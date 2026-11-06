/**
 * Tiered limits (spec 5 / M4). Limits are USD-cent equivalents from limits_config (admin editable),
 * scaled by country multipliers and new-account cooldown. Usage is consumed atomically inside the
 * order-creation transaction (INSERT .. ON CONFLICT DO UPDATE used = used + x), so concurrent orders
 * cannot jointly exceed a limit.
 */
import { limitsConfig, limitUsage, users, and, eq, sql, type DbOrTx, type Tx } from '@p2p/db';
import { DEFAULT_TIER_LIMITS_USD_CENTS, DomainError, cryptoToFiat, assetDecimals, type Asset, type KycTier, applyBps } from '@p2p/shared';
import type { Ctx } from './context';
import { getConfig } from './config';
import { getCountryRule } from './compliance';
import { getReferencePrice } from './rates';
import type { User } from './auth';

const limitsCache = new Map<number, { at: number; v: typeof limitsConfig.$inferSelect | undefined }>();
const LIMITS_TTL_MS = Number(process.env.CONFIG_CACHE_MS ?? 2000);
export const clearLimitsCache = () => limitsCache.clear();

export interface EffectiveLimits { daily: bigint; monthly: bigint; perOrder: bigint; withdrawDaily: bigint; cooldown: boolean; multiplierBps: number }

export async function getLimits(ctx: Ctx, db: DbOrTx, user: Pick<User, 'kycTier' | 'country' | 'createdAt'>): Promise<EffectiveLimits> {
  const tier = user.kycTier as KycTier;
  const ck = limitsCache.get(tier);
  const row = ck && Date.now() - ck.at < LIMITS_TTL_MS ? ck.v : (await db.select().from(limitsConfig).where(and(eq(limitsConfig.tier, tier), eq(limitsConfig.asset, 'USD'))))[0];
  if (!ck || Date.now() - ck.at >= LIMITS_TTL_MS) limitsCache.set(tier, { at: Date.now(), v: row });
  const d = DEFAULT_TIER_LIMITS_USD_CENTS[tier];
  const base = row ? { daily: row.dailyLimit, monthly: row.monthlyLimit, perOrder: row.perOrderMax, withdrawDaily: row.withdrawDaily } : d;
  const rule = await getCountryRule(db, user.country);
  const cd = await getConfig(db, 'cooldowns');
  const young = ctx.now().getTime() - user.createdAt.getTime() < cd.newAccountHours * 3600_000;
  let mult = rule.limitMultiplierBps;
  if (young) mult = Math.floor((mult * cd.newAccountLimitBps) / 10_000);
  const f = (v: bigint) => applyBps(v, mult);
  return { daily: f(base.daily), monthly: f(base.monthly), perOrder: f(base.perOrder), withdrawDaily: f(base.withdrawDaily), cooldown: young, multiplierBps: mult };
}

export async function usdCents(ctx: Ctx, db: DbOrTx, asset: Asset, amount: bigint): Promise<bigint> {
  if (amount === 0n) return 0n;
  const price = await getReferencePrice(ctx, db, asset, 'USD');
  if (!price) throw new DomainError('CONFLICT', 'USD reference rate unavailable');
  return cryptoToFiat(amount, price, assetDecimals(asset));
}

const periods = (now: Date) => ({ d: `d:${now.toISOString().slice(0, 10)}`, m: `m:${now.toISOString().slice(0, 7)}` });

async function bump(tx: Tx, userId: string, kind: string, period: string, delta: bigint) {
  const [r] = await tx.insert(limitUsage).values({ userId, kind, period, used: delta })
    .onConflictDoUpdate({ target: [limitUsage.userId, limitUsage.kind, limitUsage.period], set: { used: sql`${limitUsage.used} + ${delta.toString()}::numeric` } })
    .returning({ used: limitUsage.used });
  return r.used;
}

/** Consume trade limit for a user inside the order transaction. Throws LIMIT_EXCEEDED. */
export async function consumeTradeLimit(ctx: Ctx, tx: Tx, user: User, cents: bigint, at = ctx.now()) {
  const l = await getLimits(ctx, tx, user);
  if (cents > l.perOrder) throw new DomainError('LIMIT_EXCEEDED', 'order exceeds per-order limit', { limit: l.perOrder.toString() });
  const p = periods(at);
  const day = await bump(tx, user.id, 'trade', p.d, cents);
  if (day > l.daily) throw new DomainError('LIMIT_EXCEEDED', 'daily limit exceeded', { limit: l.daily.toString() });
  const month = await bump(tx, user.id, 'trade', p.m, cents);
  if (month > l.monthly) throw new DomainError('LIMIT_EXCEEDED', 'monthly limit exceeded', { limit: l.monthly.toString() });
}
export async function releaseTradeLimit(tx: Tx, userId: string, cents: bigint, createdAt: Date) {
  if (cents === 0n) return;
  const p = periods(createdAt);
  for (const per of [p.d, p.m]) // same row order as consumeTradeLimit (day, then month)
    await tx.update(limitUsage).set({ used: sql`greatest(${limitUsage.used} - ${cents.toString()}::numeric, 0)` })
      .where(and(eq(limitUsage.userId, userId), eq(limitUsage.kind, 'trade'), eq(limitUsage.period, per)));
}
export async function consumeWithdrawLimit(ctx: Ctx, tx: Tx, user: User, cents: bigint) {
  const l = await getLimits(ctx, tx, user);
  const used = await bump(tx, user.id, 'withdraw', periods(ctx.now()).d, cents);
  if (used > l.withdrawDaily) throw new DomainError('LIMIT_EXCEEDED', 'daily withdrawal limit exceeded', { limit: l.withdrawDaily.toString() });
}
export async function limitUsageFor(db: DbOrTx, userId: string, now: Date) {
  const p = periods(now);
  const rows = await db.select().from(limitUsage).where(and(eq(limitUsage.userId, userId), sql`${limitUsage.period} in (${p.d}, ${p.m})`));
  const get = (k: string, per: string) => rows.find((r) => r.kind === k && r.period === per)?.used ?? 0n;
  return { tradeDay: get('trade', p.d), tradeMonth: get('trade', p.m), withdrawDay: get('withdraw', p.d) };
}
export async function reloadUser(db: DbOrTx, id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u;
}
