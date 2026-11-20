/**
 * Merchant program (spec 5 tier 3 / M13): application, security deposit, approval, levels with fee tiers.
 * Tier-3 rule: for merchant purposes a user only counts as tier 3 once their security deposit is locked
 * (KYC level 3 alone is not enough) — `reviewMerchant` enforces both before approval.
 */
import { merchantProfiles, users, reputation, eq, sql } from '@p2p/db';
import { DomainError, toMinor, assetDecimals, fromMinor, type Asset } from '@p2p/shared';
import type { Ctx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import { postTx, userAcct, balanceOf } from './ledger';
import { getConfig } from './config';
import { usdCents, reloadUser } from './limits';
import { require2fa, type User } from './auth';

export type MerchantProfile = typeof merchantProfiles.$inferSelect;
export interface MerchantApplication { businessName: string; country: string; expectedMonthlyVolumeUsd: number; website?: string; notes?: string }

export function computeMerchantLevel(levels: Array<{ level: number; volume30dUsdCents: number }>, volume: bigint): number {
  let lvl = 1;
  for (const l of [...levels].sort((a, b) => a.level - b.level)) if (volume >= BigInt(l.volume30dUsdCents)) lvl = l.level;
  return lvl;
}

export async function getMerchantProfile(ctx: Ctx, userId: string): Promise<MerchantProfile | null> {
  const [p] = await ctx.db.select().from(merchantProfiles).where(eq(merchantProfiles.userId, userId));
  return p ?? null;
}

export async function applyMerchant(ctx: Ctx, userIn: User, app: MerchantApplication) {
  const user = await reloadUser(ctx.db, userIn.id);
  if (user.status !== 'active') throw new DomainError('ACCOUNT_FROZEN', 'account not active');
  if (user.kycTier < 2) throw new DomainError('TIER_REQUIRED', 'tier 2 KYC required to apply');
  if (!app.businessName?.trim()) throw new DomainError('VALIDATION', 'businessName required');
  return runTx(ctx, async (t) => {
    const [existing] = await t.tx.select().from(merchantProfiles).where(eq(merchantProfiles.userId, user.id)).for('update');
    if (existing && ['applied', 'approved'].includes(existing.status)) throw new DomainError('CONFLICT', `application already ${existing.status}`);
    const application = app as unknown as Record<string, unknown>;
    const [p] = await t.tx.insert(merchantProfiles).values({ userId: user.id, status: 'applied', application })
      .onConflictDoUpdate({ target: merchantProfiles.userId, set: { status: 'applied', application } }).returning();
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'merchant.applied', subjectType: 'user', subjectId: user.id, after: app });
    return p;
  });
}

/** Lock the security deposit: available -> security_deposit (ledger). 2FA required. */
export async function lockSecurityDeposit(ctx: Ctx, userIn: User, asset: Asset, amount: string, totp?: string, opts: { skip2fa?: boolean } = {}) {
  const user = await reloadUser(ctx.db, userIn.id);
  if (!opts.skip2fa) await require2fa(ctx, user, totp);
  const prof = await getMerchantProfile(ctx, user.id);
  if (!prof || !['applied', 'approved'].includes(prof.status)) throw new DomainError('CONFLICT', 'apply to the merchant program first');
  if (prof.depositAmount > 0n) throw new DomainError('CONFLICT', 'deposit already locked');
  const minor = toMinor(amount, assetDecimals(asset));
  const cfg = await getConfig(ctx.db, 'merchants');
  const usd = await usdCents(ctx, ctx.db, asset, minor);
  if (usd < BigInt(cfg.minDepositUsdCents)) throw new DomainError('VALIDATION', `minimum deposit is $${fromMinor(BigInt(cfg.minDepositUsdCents), 2)}`);
  return runTx(ctx, async (t) => {
    const [p] = await t.tx.select().from(merchantProfiles).where(eq(merchantProfiles.userId, user.id)).for('update');
    if (p.depositAmount > 0n) throw new DomainError('CONFLICT', 'deposit already locked');
    const nonce = (await t.tx.execute<{ n: string }>(sql`select count(*)::text n from ledger_tx where ref_type = 'merchant' and ref_id = ${user.id}`)).rows[0]?.n ?? '0';
    await postTx(t.tx, { type: 'security_deposit', refType: 'merchant', refId: user.id, idempotencyKey: `merchant:${user.id}:deposit:${nonce}`, postings: [
      { account: userAcct(user.id, asset), amount: -minor }, { account: userAcct(user.id, asset, 'security_deposit'), amount: minor },
    ] });
    await t.tx.update(merchantProfiles).set({ depositAmount: minor, depositAsset: asset }).where(eq(merchantProfiles.userId, user.id));
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'merchant.deposit_locked', subjectType: 'user', subjectId: user.id, after: { asset, amount: minor } });
    return { asset, amount: fromMinor(minor, assetDecimals(asset)) };
  });
}

/** Finance releases the deposit (merchant exit). The merchant is suspended and loses the badge. */
export async function releaseSecurityDeposit(ctx: Ctx, adminId: string, userId: string) {
  return runTx(ctx, async (t) => {
    const [p] = await t.tx.select().from(merchantProfiles).where(eq(merchantProfiles.userId, userId)).for('update');
    if (!p || p.depositAmount === 0n) throw new DomainError('CONFLICT', 'no deposit locked');
    const asset = p.depositAsset;
    const nonce = (await t.tx.execute<{ n: string }>(sql`select count(*)::text n from ledger_tx where ref_type = 'merchant' and ref_id = ${userId}`)).rows[0]?.n ?? '0';
    await postTx(t.tx, { type: 'security_deposit_return', refType: 'merchant', refId: userId, idempotencyKey: `merchant:${userId}:deposit_return:${nonce}`, postings: [
      { account: userAcct(userId, asset, 'security_deposit'), amount: -p.depositAmount }, { account: userAcct(userId, asset), amount: p.depositAmount },
    ] });
    await t.tx.update(merchantProfiles).set({ depositAmount: 0n, status: p.status === 'approved' ? 'suspended' : p.status, verifiedBadge: false }).where(eq(merchantProfiles.userId, userId));
    await t.tx.update(users).set({ isMerchant: false }).where(eq(users.id, userId));
    await audit(t.tx, { actorType: 'admin', actorId: adminId, action: 'merchant.deposit_released', subjectType: 'user', subjectId: userId, before: { amount: p.depositAmount, status: p.status } });
    return { released: fromMinor(p.depositAmount, assetDecimals(asset as Asset)), asset };
  });
}

export async function reviewMerchant(ctx: Ctx, adminId: string, userId: string, input: { approve: boolean; note: string }) {
  if (!input.note?.trim()) throw new DomainError('VALIDATION', 'note required');
  return runTx(ctx, async (t) => {
    const [p] = await t.tx.select().from(merchantProfiles).where(eq(merchantProfiles.userId, userId)).for('update');
    if (!p || p.status !== 'applied') throw new DomainError('CONFLICT', 'no pending application');
    const [u] = await t.tx.select().from(users).where(eq(users.id, userId));
    if (!input.approve) {
      await t.tx.update(merchantProfiles).set({ status: 'rejected' }).where(eq(merchantProfiles.userId, userId));
      await audit(t.tx, { actorType: 'admin', actorId: adminId, action: 'merchant.rejected', subjectType: 'user', subjectId: userId, after: { note: input.note } });
      return { status: 'rejected', level: 0 };
    }
    if (u.kycTier < 3) throw new DomainError('TIER_REQUIRED', 'level-3 KYC (video call) required');
    // Tier-3 merchant rule: the deposit must be locked in the ledger (not just recorded on the profile).
    const locked = await balanceOf(t.tx, userAcct(userId, p.depositAsset, 'security_deposit'));
    const cfg = await getConfig(t.tx, 'merchants');
    if (locked <= 0n || (await usdCents(ctx, t.tx, p.depositAsset as Asset, locked)) < BigInt(cfg.minDepositUsdCents)) throw new DomainError('CONFLICT', 'security deposit not locked');
    const [rep] = await t.tx.select().from(reputation).where(eq(reputation.userId, userId));
    const level = computeMerchantLevel(cfg.levels, rep?.volume30dUsdCents ?? 0n);
    await t.tx.update(merchantProfiles).set({ status: 'approved', level, verifiedBadge: true }).where(eq(merchantProfiles.userId, userId));
    await t.tx.update(users).set({ isMerchant: true }).where(eq(users.id, userId));
    await audit(t.tx, { actorType: 'admin', actorId: adminId, action: 'merchant.approved', subjectType: 'user', subjectId: userId, after: { level, note: input.note } });
    return { status: 'approved', level };
  });
}

/** Merchant level follows 30-day volume; levels lower maker fees via fees.merchantLevelMakerBps. */
export async function recomputeMerchantLevels(ctx: Ctx) {
  const cfg = await getConfig(ctx.db, 'merchants');
  const rows = await ctx.db.select({ p: merchantProfiles, v: reputation.volume30dUsdCents }).from(merchantProfiles)
    .leftJoin(reputation, eq(reputation.userId, merchantProfiles.userId)).where(eq(merchantProfiles.status, 'approved'));
  let changed = 0;
  for (const r of rows) {
    const level = computeMerchantLevel(cfg.levels, r.v ?? 0n);
    if (level !== r.p.level) {
      await ctx.db.update(merchantProfiles).set({ level }).where(eq(merchantProfiles.userId, r.p.userId));
      await audit(ctx.db, { actorType: 'system', action: 'merchant.level_changed', subjectType: 'user', subjectId: r.p.userId, before: { level: r.p.level }, after: { level } });
      changed++;
    }
  }
  return changed;
}

export async function listMerchants(ctx: Ctx): Promise<MerchantProfile[]> {
  return ctx.db.select().from(merchantProfiles);
}
