/**
 * Admin & compliance (spec 11 / M6). Separate auth: password + IP allowlist + WebAuthn (hardware key) per session.
 * Least-privilege roles; every admin action is audited (also enforced generically by the API interceptor).
 */
import argon2 from 'argon2';
import {
  adminUsers, adminSessions, users, kycApplications, countryRules, paymentMethodTypes, fiatCurrencies, auditLog, riskFlags, reports,
  orders, deposits, withdrawals, devices, limitsConfig, and, eq, or, sql, desc, gt, isNull, inArray, gte, lte, ilike,
} from '@p2p/db';
import { DomainError } from '@p2p/shared';
import type { Ctx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import { randomToken, sha256, decrypt } from './crypto';
import { passkeyAuthOptions, passkeyVerify, passkeyRegistrationOptions, passkeyRegister, hashPassword } from './auth';
import { setConfig, getConfig, type ConfigKey } from './config';
import { userBalances } from './ledger';

export const ADMIN_ROLES = ['support', 'arbiter', 'compliance', 'finance', 'superadmin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Permission matrix — least privilege. superadmin implicitly has everything. */
export const PERMISSIONS: Record<string, AdminRole[]> = {
  'users.search': ['support', 'compliance'],
  'users.read': ['support', 'compliance'],
  'users.read_pii': ['compliance'],
  'users.freeze': ['compliance'],
  'kyc.review': ['compliance'],
  'deposits.review': ['compliance'],
  'risk.read': ['compliance'],
  'risk.resolve': ['compliance'],
  'reports.sar': ['compliance'],
  'audit.read': ['compliance'],
  'country_rules.write': ['compliance'],
  'limits.write': ['compliance'],
  'withdrawals.read': ['finance', 'compliance'],
  'withdrawals.approve': ['finance'],
  'fees.write': ['finance'],
  'insurance.fund': ['finance'],
  'withdrawals.pause': ['finance'],
  'disputes.read': ['arbiter'],
  'disputes.decide': ['arbiter'],
  'freeze_reports.review': ['arbiter', 'compliance'],
  'orders.read': ['support', 'arbiter', 'compliance'],
  'payment_methods.write': [],
  'fiat.write': [],
  'admins.manage': [],
  'config.read': ['finance', 'compliance'],
};
export type Permission = keyof typeof PERMISSIONS;
export function can(roles: string[], p: string) {
  if (roles.includes('superadmin')) return true;
  return (PERMISSIONS[p] ?? []).some((r) => roles.includes(r));
}

export type Admin = typeof adminUsers.$inferSelect;
export interface AdminSession { admin: Admin; session: typeof adminSessions.$inferSelect }

export function ipAllowed(ip: string | undefined, list = process.env.ADMIN_IP_ALLOWLIST ?? '127.0.0.1,::1,::ffff:127.0.0.1') {
  if (!ip) return false;
  const norm = ip.replace(/^::ffff:/, '');
  return list.split(',').map((s) => s.trim()).filter(Boolean).some((e) => e === ip || e === norm || (e.endsWith('*') && norm.startsWith(e.slice(0, -1))));
}

export async function createAdmin(ctx: Ctx, actorId: string | null, input: { email: string; password: string; roles: AdminRole[] }) {
  for (const r of input.roles) if (!ADMIN_ROLES.includes(r)) throw new DomainError('VALIDATION', `unknown role ${r}`);
  return runTx(ctx, async (t) => {
    const [a] = await t.tx.insert(adminUsers).values({ email: input.email.toLowerCase(), passwordHash: await hashPassword(input.password), roles: input.roles }).returning();
    await audit(t.tx, { actorType: actorId ? 'admin' : 'system', actorId, action: 'admin.created', subjectType: 'admin', subjectId: a.id, after: { email: a.email, roles: a.roles } });
    return a;
  });
}
export async function setAdminRoles(ctx: Ctx, actorId: string, adminId: string, roles: AdminRole[], active = true) {
  return runTx(ctx, async (t) => {
    const [before] = await t.tx.select().from(adminUsers).where(eq(adminUsers.id, adminId));
    if (!before) throw new DomainError('NOT_FOUND', 'admin not found');
    const [a] = await t.tx.update(adminUsers).set({ roles, active }).where(eq(adminUsers.id, adminId)).returning();
    await audit(t.tx, { actorType: 'admin', actorId, action: 'admin.roles_changed', subjectType: 'admin', subjectId: adminId, before: { roles: before.roles, active: before.active }, after: { roles, active } });
    return a;
  });
}

/** Step 1: password (+ IP allowlist). Returns a session that is NOT usable until WebAuthn completes. */
export async function adminLogin(ctx: Ctx, email: string, password: string, ip?: string) {
  if (!ipAllowed(ip)) {
    await audit(ctx.db, { actorType: 'system', action: 'admin.login_ip_blocked', after: { email }, ip });
    throw new DomainError('FORBIDDEN', 'IP not allowed');
  }
  const [a] = await ctx.db.select().from(adminUsers).where(eq(adminUsers.email, email.toLowerCase()));
  if (!a || !a.active || !(await argon2.verify(a.passwordHash, password))) {
    await audit(ctx.db, { actorType: 'system', action: 'admin.login_failed', after: { email }, ip });
    throw new DomainError('UNAUTHORIZED', 'invalid credentials');
  }
  const token = randomToken(32);
  await ctx.db.insert(adminSessions).values({ adminId: a.id, tokenHash: sha256(token), ip, expiresAt: new Date(ctx.now().getTime() + 8 * 3600_000) });
  const options = await passkeyAuthOptions(ctx, `admin:${sha256(token)}`);
  await audit(ctx.db, { actorType: 'admin', actorId: a.id, action: 'admin.login_password', ip });
  return { token, webauthnOptions: options, needsRegistration: !(await hasAdminKey(ctx, a.id)) };
}
async function hasAdminKey(ctx: Ctx, adminId: string) {
  const r = await ctx.db.execute<{ n: number }>(sql`select count(*)::int n from webauthn_credentials where admin_id = ${adminId}`);
  return (r.rows[0]?.n ?? 0) > 0;
}
/** Step 2: WebAuthn assertion from the admin's hardware key, bound to this session. */
export async function adminWebauthn(ctx: Ctx, token: string, response: unknown, ip?: string) {
  const s = await adminSessionRaw(ctx, token);
  if (!s) throw new DomainError('UNAUTHORIZED', 'session expired');
  const owner = await passkeyVerify(ctx, `admin:${sha256(token)}`, response);
  if (owner.adminId !== s.admin.id) throw new DomainError('UNAUTHORIZED', 'key does not belong to this admin');
  await ctx.db.update(adminSessions).set({ webauthnAt: ctx.now() }).where(eq(adminSessions.id, s.session.id));
  await audit(ctx.db, { actorType: 'admin', actorId: s.admin.id, action: 'admin.login_webauthn', ip });
  return { ok: true, roles: s.admin.roles };
}
/** First-time key enrolment for an admin (requires a password-authenticated session from an allowed IP). */
export async function adminKeyRegistrationOptions(ctx: Ctx, token: string) {
  const s = await adminSessionRaw(ctx, token);
  if (!s) throw new DomainError('UNAUTHORIZED', 'session expired');
  if (await hasAdminKey(ctx, s.admin.id)) throw new DomainError('CONFLICT', 'key already enrolled; ask a superadmin to reset');
  return passkeyRegistrationOptions(ctx, { kind: 'admin', id: s.admin.id, name: s.admin.email });
}
export async function adminKeyRegister(ctx: Ctx, token: string, response: unknown) {
  const s = await adminSessionRaw(ctx, token);
  if (!s) throw new DomainError('UNAUTHORIZED', 'session expired');
  if (await hasAdminKey(ctx, s.admin.id)) throw new DomainError('CONFLICT', 'key already enrolled');
  return passkeyRegister(ctx, { kind: 'admin', id: s.admin.id }, response);
}
async function adminSessionRaw(ctx: Ctx, token: string): Promise<AdminSession | null> {
  const [row] = await ctx.db.select({ s: adminSessions, a: adminUsers }).from(adminSessions).innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminId))
    .where(and(eq(adminSessions.tokenHash, sha256(token)), gt(adminSessions.expiresAt, ctx.now())));
  if (!row || !row.a.active) return null;
  return { admin: row.a, session: row.s };
}
/** Full admin auth: valid session, WebAuthn completed, same allowed IP. */
export async function authenticateAdmin(ctx: Ctx, token: string, ip?: string): Promise<AdminSession | null> {
  const s = await adminSessionRaw(ctx, token);
  if (!s || !s.session.webauthnAt || !ipAllowed(ip)) return null;
  return s;
}

// ---------------------------------------------------------------- users
const mask = (s?: string | null) => (!s ? s : s.length <= 4 ? '****' : s.replace(/^(.{2}).*(.{2})$/, '$1***$2'));

export async function searchUsers(ctx: Ctx, admin: Admin, q: string) {
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const rows = await ctx.read.select().from(users).where(or(
    /^[0-9a-f-]{36}$/.test(q) ? eq(users.id, q) : sql`false`, ilike(users.email, like), ilike(users.phone, like), eq(users.tgId, q), ilike(users.displayName, like),
  )).limit(50);
  return rows.map((u) => presentUserForAdmin(admin, u));
}
export function presentUserForAdmin(admin: Admin, u: typeof users.$inferSelect) {
  const pii = can(admin.roles, 'users.read_pii');
  return { id: u.id, email: pii ? u.email : mask(u.email), phone: pii ? u.phone : mask(u.phone), tgId: pii ? u.tgId : mask(u.tgId), country: u.country, kycTier: u.kycTier, status: u.status, sanctionsHit: u.sanctionsHit, isMerchant: u.isMerchant, createdAt: u.createdAt, displayName: u.displayName };
}
export async function userDetail(ctx: Ctx, admin: Admin, userId: string) {
  const [u] = await ctx.db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new DomainError('NOT_FOUND', 'user not found');
  const pii = can(admin.roles, 'users.read_pii');
  const kyc = await ctx.db.select().from(kycApplications).where(eq(kycApplications.userId, userId)).orderBy(desc(kycApplications.createdAt));
  const flags = can(admin.roles, 'risk.read') ? await ctx.db.select().from(riskFlags).where(and(eq(riskFlags.subjectType, 'user'), eq(riskFlags.subjectId, userId))) : undefined;
  const devs = pii ? await ctx.db.select().from(devices).where(eq(devices.userId, userId)) : undefined;
  const recentOrders = await ctx.db.select({ id: orders.id, status: orders.status, asset: orders.asset, fiat: orders.fiat, createdAt: orders.createdAt }).from(orders).where(or(eq(orders.buyerId, userId), eq(orders.sellerId, userId))).orderBy(desc(orders.createdAt)).limit(20);
  await audit(ctx.db, { actorType: 'admin', actorId: admin.id, action: 'admin.view_user', subjectType: 'user', subjectId: userId, after: { pii } });
  return {
    user: presentUserForAdmin(admin, u), balances: await userBalances(ctx.db, userId), recentOrders,
    kyc: kyc.map((k) => ({ id: k.id, level: k.level, status: k.status, provider: k.provider, createdAt: k.createdAt, verifiedFullName: pii && k.verifiedFullNameEnc ? decrypt(k.verifiedFullNameEnc) : undefined, rejectReason: k.rejectReason })),
    flags, devices: devs,
  };
}
export async function setUserStatus(ctx: Ctx, admin: Admin, userId: string, status: 'active' | 'frozen' | 'banned', reason: string) {
  if (!reason?.trim()) throw new DomainError('VALIDATION', 'reason required');
  return runTx(ctx, async (t) => {
    const [before] = await t.tx.select().from(users).where(eq(users.id, userId)).for('update');
    if (!before) throw new DomainError('NOT_FOUND', 'user not found');
    await t.tx.update(users).set({ status }).where(eq(users.id, userId));
    await audit(t.tx, { actorType: 'admin', actorId: admin.id, action: 'user.status_changed', subjectType: 'user', subjectId: userId, before: { status: before.status }, after: { status, reason } });
    return { id: userId, status };
  });
}

// ---------------------------------------------------------------- KYC manual review
export async function kycQueue(ctx: Ctx) {
  return ctx.db.select({ id: kycApplications.id, userId: kycApplications.userId, level: kycApplications.level, status: kycApplications.status, createdAt: kycApplications.createdAt, provider: kycApplications.provider })
    .from(kycApplications).where(inArray(kycApplications.status, ['pending', 'manual_review'])).orderBy(kycApplications.createdAt).limit(200);
}
export async function reviewKyc(ctx: Ctx, admin: Admin, applicationId: string, approve: boolean, note: string) {
  return runTx(ctx, async (t) => {
    const [k] = await t.tx.select().from(kycApplications).where(eq(kycApplications.id, applicationId)).for('update');
    if (!k || !['pending', 'manual_review'].includes(k.status)) throw new DomainError('CONFLICT', 'application not reviewable');
    const [u] = await t.tx.select().from(users).where(eq(users.id, k.userId)).for('update');
    await t.tx.update(kycApplications).set({ status: approve ? 'approved' : 'rejected', rejectReason: approve ? null : note, reviewedBy: admin.id, reviewedAt: ctx.now() }).where(eq(kycApplications.id, k.id));
    if (approve && k.level > u.kycTier) {
      if (u.sanctionsHit) throw new DomainError('SANCTIONED', 'user has a sanctions hit; resolve first');
      await t.tx.update(users).set({ kycTier: k.level }).where(eq(users.id, u.id));
      await audit(t.tx, { actorType: 'admin', actorId: admin.id, action: 'user.tier_changed', subjectType: 'user', subjectId: u.id, before: { tier: u.kycTier }, after: { tier: k.level, via: 'manual_review' } });
    }
    await audit(t.tx, { actorType: 'admin', actorId: admin.id, action: `kyc.manual_${approve ? 'approved' : 'rejected'}`, subjectType: 'kyc_application', subjectId: k.id, after: { note } });
    return { status: approve ? 'approved' : 'rejected' };
  });
}

// ---------------------------------------------------------------- config editors
export async function upsertCountryRule(ctx: Ctx, admin: Admin, country: string, patch: Partial<typeof countryRules.$inferInsert>) {
  const code = country.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new DomainError('VALIDATION', 'country must be ISO alpha-2');
  return runTx(ctx, async (t) => {
    const [before] = await t.tx.select().from(countryRules).where(eq(countryRules.country, code));
    const values = { ...patch, country: code, updatedAt: ctx.now() };
    const [r] = await t.tx.insert(countryRules).values(values).onConflictDoUpdate({ target: countryRules.country, set: values }).returning();
    await audit(t.tx, { actorType: 'admin', actorId: admin.id, action: 'country_rules.changed', subjectType: 'country', subjectId: code, before, after: r });
    return r;
  });
}
export async function updatePaymentMethodType(ctx: Ctx, admin: Admin, code: string, patch: Partial<typeof paymentMethodTypes.$inferInsert>) {
  return runTx(ctx, async (t) => {
    const [before] = await t.tx.select().from(paymentMethodTypes).where(eq(paymentMethodTypes.code, code));
    if (!before) throw new DomainError('NOT_FOUND', 'unknown payment method');
    const { code: _ignored, ...rest } = patch;
    const [r] = await t.tx.update(paymentMethodTypes).set(rest).where(eq(paymentMethodTypes.code, code)).returning();
    await audit(t.tx, { actorType: 'admin', actorId: admin.id, action: 'payment_method_type.changed', subjectType: 'payment_method_type', subjectId: code, before, after: r });
    return r;
  });
}
export async function updateFiat(ctx: Ctx, admin: Admin, code: string, patch: { enabled?: boolean; minOrder?: bigint | null; maxOrder?: bigint | null; rateSource?: string }) {
  return runTx(ctx, async (t) => {
    const [before] = await t.tx.select().from(fiatCurrencies).where(eq(fiatCurrencies.code, code));
    if (!before) throw new DomainError('NOT_FOUND', 'unknown currency');
    const [r] = await t.tx.update(fiatCurrencies).set(patch).where(eq(fiatCurrencies.code, code)).returning();
    await audit(t.tx, { actorType: 'admin', actorId: admin.id, action: 'fiat.changed', subjectType: 'fiat', subjectId: code, before, after: r });
    return r;
  });
}
/** Audited system config change (fees, withdrawals pause, risk thresholds…). */
export async function adminSetConfig<K extends ConfigKey>(ctx: Ctx, admin: Admin, key: K, value: Record<string, unknown>) {
  const before = await getConfig(ctx.db, key);
  const after = await setConfig(ctx.db, key, value as never);
  await audit(ctx.db, { actorType: 'admin', actorId: admin.id, action: `config.${key}.changed`, subjectType: 'config', subjectId: key, before, after });
  return after;
}
export const limitsTable = async (ctx: Ctx): Promise<Array<typeof limitsConfig.$inferSelect>> => ctx.db.select().from(limitsConfig).orderBy(limitsConfig.tier);

// ---------------------------------------------------------------- audit viewer / flags / reports
export async function queryAudit(ctx: Ctx, q: { action?: string; subjectId?: string; actorId?: string; from?: Date; to?: Date; limit?: number }) {
  const conds = [];
  if (q.action) conds.push(ilike(auditLog.action, `${q.action.replace(/[%_]/g, '')}%`));
  if (q.subjectId) conds.push(eq(auditLog.subjectId, q.subjectId));
  if (q.actorId) conds.push(eq(auditLog.actorId, q.actorId));
  if (q.from) conds.push(gte(auditLog.createdAt, q.from));
  if (q.to) conds.push(lte(auditLog.createdAt, q.to));
  return ctx.read.select().from(auditLog).where(conds.length ? and(...conds) : undefined).orderBy(desc(auditLog.id)).limit(Math.min(q.limit ?? 100, 500));
}
export async function listFlags(ctx: Ctx, open = true) {
  return ctx.db.select().from(riskFlags).where(open ? isNull(riskFlags.resolvedAt) : undefined).orderBy(desc(riskFlags.id)).limit(500);
}
export async function resolveFlag(ctx: Ctx, admin: Admin, flagId: bigint, note: string) {
  return runTx(ctx, async (t) => {
    const [f] = await t.tx.update(riskFlags).set({ resolvedAt: ctx.now() }).where(and(eq(riskFlags.id, flagId), isNull(riskFlags.resolvedAt))).returning();
    if (!f) throw new DomainError('NOT_FOUND', 'flag not found or resolved');
    await audit(t.tx, { actorType: 'admin', actorId: admin.id, action: 'risk_flag.resolved', subjectType: f.subjectType, subjectId: f.subjectId, after: { flagId: String(flagId), code: f.code, note } });
    return f;
  });
}

/** SAR/STR: snapshot of the subject's identity, activity and flags; stored and exportable (JSON / CSV). */
export async function createSuspiciousActivityReport(ctx: Ctx, admin: Admin, input: { kind: 'SAR' | 'STR'; userId: string; narrative: string }) {
  if (!input.narrative?.trim()) throw new DomainError('VALIDATION', 'narrative required');
  const [u] = await ctx.db.select().from(users).where(eq(users.id, input.userId));
  if (!u) throw new DomainError('NOT_FOUND', 'user not found');
  const kyc = await ctx.db.select().from(kycApplications).where(and(eq(kycApplications.userId, u.id), eq(kycApplications.status, 'approved')));
  const ord = await ctx.db.select().from(orders).where(or(eq(orders.buyerId, u.id), eq(orders.sellerId, u.id))).orderBy(desc(orders.createdAt)).limit(500);
  const dep = await ctx.db.select().from(deposits).where(eq(deposits.userId, u.id));
  const wd = await ctx.db.select().from(withdrawals).where(eq(withdrawals.userId, u.id));
  const fl = await ctx.db.select().from(riskFlags).where(and(eq(riskFlags.subjectType, 'user'), eq(riskFlags.subjectId, u.id)));
  const payload = {
    kind: input.kind, generatedAt: ctx.now().toISOString(), narrative: input.narrative,
    subject: { id: u.id, email: u.email, phone: u.phone, country: u.country, kycTier: u.kycTier, status: u.status, verifiedName: kyc[0]?.verifiedFullNameEnc ? decrypt(kyc[0].verifiedFullNameEnc) : null },
    orders: ord.map((o) => ({ id: o.id, role: o.buyerId === u.id ? 'buyer' : 'seller', status: o.status, asset: o.asset, cryptoAmount: o.cryptoAmount.toString(), fiat: o.fiat, fiatAmount: o.fiatAmount.toString(), usdValueCents: o.usdValueCents.toString(), createdAt: o.createdAt })),
    deposits: dep.map((d) => ({ id: d.id, asset: d.asset, network: d.network, txHash: d.txHash, from: d.fromAddress, amount: d.amount.toString(), status: d.status, riskScore: d.riskScore })),
    withdrawals: wd.map((w) => ({ id: w.id, asset: w.asset, network: w.network, address: w.address, amount: w.amount.toString(), status: w.status, txHash: w.txHash })),
    flags: fl.map((f) => ({ code: f.code, severity: f.severity, at: f.createdAt, resolved: !!f.resolvedAt })),
  };
  return runTx(ctx, async (t) => {
    const [r] = await t.tx.insert(reports).values({ kind: input.kind, subjectUserId: u.id, createdBy: admin.id, payload }).returning();
    await audit(t.tx, { actorType: 'admin', actorId: admin.id, action: `report.${input.kind.toLowerCase()}_created`, subjectType: 'user', subjectId: u.id, after: { reportId: r.id } });
    return r;
  });
}
export function reportToCsv(payload: any): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['section', 'id', 'type', 'status', 'asset', 'amount', 'counter/address', 'at'].join(',')];
  for (const o of payload.orders) lines.push(['order', o.id, o.role, o.status, o.asset, o.cryptoAmount, `${o.fiatAmount} ${o.fiat}`, o.createdAt].map(esc).join(','));
  for (const d of payload.deposits) lines.push(['deposit', d.id, d.network, d.status, d.asset, d.amount, d.from, ''].map(esc).join(','));
  for (const w of payload.withdrawals) lines.push(['withdrawal', w.id, w.network, w.status, w.asset, w.amount, w.address, ''].map(esc).join(','));
  return lines.join('\n');
}
