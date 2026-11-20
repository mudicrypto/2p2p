/**
 * Email delivery settings and account emails (verification, password reset).
 * The Resend API key comes from RESEND_API_KEY on the server or is pasted by a superadmin in the admin panel;
 * the panel copy is stored encrypted in system_config and never returned.
 */
import { sessions, systemConfig, users, verificationTokens, and, desc, eq, gt, isNull, sql } from '@p2p/db';
import { ResendNotifier, sendResend, type Notifier, type NotifyMessage } from '@p2p/providers';
import type { Ctx } from './context';
import { DomainError } from '@p2p/shared';
import { decrypt, encrypt, sha256, safeEqual, randomToken } from './crypto';
import { audit } from './audit';
import { runTx } from './context';
import { hashPassword, type ReqMeta, type User } from './auth';

const KEY = 'secret.email';
const DEFAULT_FROM = 'parley <no-reply@parley.markets>';
type Stored = { keyEnc?: string; keyHint?: string; from?: string; lastError?: string | null; lastErrorAt?: string | null; lastOkAt?: string | null; updatedAt?: string };

let cache: { at: number; v: { key?: string; from?: string; source: 'env' | 'admin' | 'none' } } | null = null;
async function readStored(ctx: Ctx): Promise<Stored> {
  const [row] = await ctx.db.select().from(systemConfig).where(eq(systemConfig.key, KEY));
  return (row?.value as Stored) ?? {};
}
async function writeStored(ctx: Ctx, patch: Partial<Stored>) {
  const value = { ...(await readStored(ctx)), ...patch };
  await ctx.db.insert(systemConfig).values({ key: KEY, value }).onConflictDoUpdate({ target: systemConfig.key, set: { value, updatedAt: new Date() } });
  cache = null;
}

/** The key and sender to use right now (environment first, then the admin panel). Cached for 30 s. */
export async function emailSettings(ctx: Ctx) {
  if (cache && Date.now() - cache.at < 30_000) return cache.v;
  let v: { key?: string; from?: string; source: 'env' | 'admin' | 'none' };
  if (process.env.RESEND_API_KEY) v = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM, source: 'env' };
  else {
    const s = await readStored(ctx).catch(() => ({} as Stored));
    let key: string | undefined;
    try { key = s.keyEnc ? decrypt(s.keyEnc) : undefined; } catch { key = undefined; }
    v = key ? { key, from: s.from, source: 'admin' } : { source: 'none' };
  }
  cache = { at: Date.now(), v };
  return v;
}
export async function emailConfigured(ctx: Ctx) { return !!(await emailSettings(ctx)).key; }

/** Route the email channel through Resend once a key exists; until then email keeps going to the current notifier. */
export function wireEmail(ctx: Ctx) {
  const base = ctx.providers.notifier;
  const resend = new ResendNotifier(async () => { const s = await emailSettings(ctx); return s.key ? { key: s.key, from: s.from || DEFAULT_FROM } : null; }, base);
  const wrapped: Notifier = {
    async send(msg: NotifyMessage) {
      if (msg.channel !== 'email') return base.send(msg);
      const configured = await emailConfigured(ctx);
      try {
        const r = await resend.send(msg);
        if (configured) void writeStored(ctx, { lastOkAt: new Date().toISOString(), lastError: null }).catch(() => {});
        return r;
      } catch (e) {
        if (configured) void writeStored(ctx, { lastError: (e as Error).message.slice(0, 300), lastErrorAt: new Date().toISOString() }).catch(() => {});
        throw e;
      }
    },
  };
  // Keep helpers such as MockNotifier.outbox reachable for tests and dev tools.
  ctx.providers = { ...ctx.providers, notifier: Object.assign(Object.create(base), wrapped) };
}

/** Send an account email without letting a delivery problem break the request that triggered it. */
export async function sendAccountEmail(ctx: Ctx, to: string, template: string, params: Record<string, unknown>) {
  try { await ctx.providers.notifier.send({ channel: 'email', to, template, params }); return true; }
  catch (e) { console.error(`[email] ${template} not sent: ${(e as Error).message}`); return false; }
}
const webOrigin = () => (process.env.WEB_ORIGIN ?? '').split(',')[0].trim();

// ---------------------------------------------------------------- admin panel
export async function adminEmailStatus(ctx: Ctx) {
  const s = await readStored(ctx);
  const env = !!process.env.RESEND_API_KEY;
  return {
    provider: 'Resend',
    configured: env || !!s.keyEnc,
    keySource: env ? 'server environment' : s.keyEnc ? 'admin panel' : 'none',
    key: env ? 're_…(from server)' : s.keyHint ?? '',
    from: (env ? process.env.EMAIL_FROM : s.from) || DEFAULT_FROM,
    lastSentOk: s.lastOkAt ?? '',
    lastError: s.lastError ?? '',
    lastErrorAt: s.lastErrorAt ?? '',
  };
}
export async function adminSetEmail(ctx: Ctx, adminId: string, input: { apiKey?: string; from?: string }) {
  const patch: Partial<Stored> = { updatedAt: new Date().toISOString() };
  if (input.apiKey !== undefined) {
    const k = input.apiKey.trim();
    if (!/^re_[A-Za-z0-9_]{10,200}$/.test(k)) throw new DomainError('VALIDATION', 'That does not look like a Resend API key (it starts with re_)');
    patch.keyEnc = encrypt(k); patch.keyHint = `${k.slice(0, 5)}…${k.slice(-4)}`; patch.lastError = null;
  }
  if (input.from !== undefined) {
    const f = input.from.trim();
    if (f && !/^([^<>@]{1,60}<)?[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}>?$/i.test(f)) throw new DomainError('VALIDATION', 'Sender must look like: parley <no-reply@parley.markets>');
    patch.from = f || undefined;
  }
  await writeStored(ctx, patch);
  await audit(ctx.db, { actorType: 'admin', actorId: adminId, action: 'config.email.changed', subjectType: 'config', subjectId: KEY, after: { keyChanged: input.apiKey !== undefined, from: patch.from } });
  return adminEmailStatus(ctx);
}
export async function adminClearEmail(ctx: Ctx, adminId: string) {
  await writeStored(ctx, { keyEnc: undefined, keyHint: undefined, lastError: null });
  await audit(ctx.db, { actorType: 'admin', actorId: adminId, action: 'config.email.removed', subjectType: 'config', subjectId: KEY });
  return adminEmailStatus(ctx);
}
/** Sends a test email straight through Resend and reports Resend's own error message if it fails. */
export async function adminTestEmail(ctx: Ctx, to: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new DomainError('VALIDATION', 'enter an email address');
  const s = await emailSettings(ctx);
  if (!s.key) throw new DomainError('VALIDATION', 'Add the Resend API key first');
  try {
    const r = await sendResend(s.key, s.from || DEFAULT_FROM, { channel: 'email', to, template: 'email_test', params: {} });
    await writeStored(ctx, { lastOkAt: new Date().toISOString(), lastError: null });
    return { ok: true, id: r.id };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await writeStored(ctx, { lastError: msg, lastErrorAt: new Date().toISOString() });
    throw new DomainError('UNAVAILABLE', msg);
  }
}

// ---------------------------------------------------------------- user flows
async function recentTokens(ctx: Ctx, purpose: string, target: string) {
  const [r] = await ctx.db.select({ c: sql<number>`count(*)::int` }).from(verificationTokens)
    .where(and(eq(verificationTokens.purpose, purpose), eq(verificationTokens.target, target), gt(verificationTokens.createdAt, new Date(ctx.now().getTime() - 3600_000))));
  return r?.c ?? 0;
}
async function newToken(ctx: Ctx, userId: string, purpose: string, target: string, ttlMs: number) {
  const code = randomToken(24);
  await ctx.db.insert(verificationTokens).values({ userId, purpose, target, codeHash: sha256(code), expiresAt: new Date(ctx.now().getTime() + ttlMs) });
  return code;
}

/** Sends a new confirmation link. Max 5 per hour. */
export async function resendVerificationEmail(ctx: Ctx, user: User) {
  if (!user.email) throw new DomainError('VALIDATION', 'no email on this account');
  if (user.emailVerifiedAt) return { alreadyVerified: true, token: undefined as string | undefined };
  if ((await recentTokens(ctx, 'email_verify', user.email)) >= 5) throw new DomainError('RATE_LIMITED', 'too many emails, try again in an hour');
  const token = await newToken(ctx, user.id, 'email_verify', user.email, 24 * 3600_000);
  await sendAccountEmail(ctx, user.email, 'email_verify', { link: `${webOrigin()}/verify-email?token=${token}` });
  return { alreadyVerified: false, token };
}

/** Always answers the same way, so it can't be used to find out which emails have accounts. Max 3 links per hour. */
export async function requestPasswordReset(ctx: Ctx, emailIn: string, meta: ReqMeta = {}) {
  const email = emailIn.trim().toLowerCase();
  const [u] = await ctx.db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
  if (!u || u.status === 'banned') return { ok: true };
  if ((await recentTokens(ctx, 'password_reset', email)) >= 3) return { ok: true };
  const token = await newToken(ctx, u.id, 'password_reset', email, 3600_000);
  await audit(ctx.db, { actorType: 'user', actorId: u.id, action: 'user.password_reset_requested', subjectType: 'user', subjectId: u.id, ip: meta.ip });
  await sendAccountEmail(ctx, email, 'password_reset', { link: `${webOrigin()}/reset-password?token=${token}` });
  return { ok: true };
}

/** Sets a new password from an emailed link. Signs out every device and confirms the email (they opened it). */
export async function resetPassword(ctx: Ctx, token: string, newPassword: string, meta: ReqMeta = {}) {
  const [row] = await ctx.db.select().from(verificationTokens)
    .where(and(eq(verificationTokens.purpose, 'password_reset'), eq(verificationTokens.codeHash, sha256(token)), isNull(verificationTokens.consumedAt), gt(verificationTokens.expiresAt, ctx.now())))
    .orderBy(desc(verificationTokens.createdAt)).limit(1);
  if (!row || !row.userId || !safeEqual(row.codeHash, sha256(token))) throw new DomainError('UNAUTHORIZED', 'This link has expired or was already used');
  const hash = await hashPassword(newPassword);
  const u = await runTx(ctx, async (t) => {
    const used = await t.tx.update(verificationTokens).set({ consumedAt: ctx.now() }).where(and(eq(verificationTokens.id, row.id), isNull(verificationTokens.consumedAt))).returning();
    if (!used.length) throw new DomainError('UNAUTHORIZED', 'This link has expired or was already used');
    // Any other reset links still in the inbox stop working too.
    await t.tx.update(verificationTokens).set({ consumedAt: ctx.now() }).where(and(eq(verificationTokens.userId, row.userId!), eq(verificationTokens.purpose, 'password_reset'), isNull(verificationTokens.consumedAt)));
    const [cur] = await t.tx.select().from(users).where(eq(users.id, row.userId!));
    const [x] = await t.tx.update(users).set({ passwordHash: hash, passwordChangedAt: ctx.now(), securityChangedAt: ctx.now(), emailVerifiedAt: cur.emailVerifiedAt ?? ctx.now() }).where(eq(users.id, row.userId!)).returning();
    await t.tx.update(sessions).set({ revokedAt: ctx.now() }).where(and(eq(sessions.userId, row.userId!), isNull(sessions.revokedAt)));
    await audit(t.tx, { actorType: 'user', actorId: x.id, action: 'user.password_reset', subjectType: 'user', subjectId: x.id, ip: meta.ip });
    return x;
  });
  if (u.email) await sendAccountEmail(ctx, u.email, 'security_alert', { what: 'password reset' });
  return { ok: true };
}
