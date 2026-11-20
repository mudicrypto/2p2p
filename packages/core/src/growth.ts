/**
 * Merchant growth tools: paid ad promotion, per-ad analytics, bulk ad actions, public "pay with link" page,
 * and price history for the market chart.
 */
import { ads, orders, users, priceSnapshots, reputation, merchantProfiles, and, eq, gt, gte, sql, asc, inArray } from '@p2p/db';
import { DomainError, assetDecimals, fromMinor, toMinor, formatPrice, type Asset } from '@p2p/shared';
import type { Ctx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import { getConfig } from './config';
import { postTx, systemAcct, userAcct } from './ledger';
import { fiatDecimals } from './fiat';
import { presentAd, setAdStatus, updateAdPricing } from './ads';
import { publicProfile } from './reputation';
import { getReferencePrice } from './rates';
import type { User } from './auth';

// ---------------------------------------------------------------- promotion
/** Pay to show an ad in the Promoted slots for `days` days (charged in USDT from the owner's wallet to platform fees). */
export async function promoteAd(ctx: Ctx, user: User, adId: string, days: number) {
  const cfg = await getConfig(ctx.db, 'promotion');
  if (!Number.isInteger(days) || days < 1 || days > cfg.maxDays) throw new DomainError('VALIDATION', `days must be 1–${cfg.maxDays}`);
  const cost = toMinor(cfg.pricePerDayUsdt, 6) * BigInt(days);
  return runTx(ctx, async (t) => {
    const [ad] = await t.tx.select().from(ads).where(and(eq(ads.id, adId), eq(ads.userId, user.id))).for('update');
    if (!ad || ad.status === 'closed') throw new DomainError('NOT_FOUND', 'ad not found');
    await postTx(t.tx, { type: 'ad_promotion', refType: 'ad', refId: adId, idempotencyKey: `promo:${adId}:${ctx.now().getTime()}`, postings: [
      { account: userAcct(user.id, 'USDT'), amount: -cost }, { account: systemAcct('USDT', 'fee'), amount: cost },
    ] });
    const from = ad.promotedUntil && ad.promotedUntil > ctx.now() ? ad.promotedUntil : ctx.now();
    const until = new Date(from.getTime() + days * 86400_000);
    const [u] = await t.tx.update(ads).set({ promotedUntil: until, updatedAt: ctx.now() }).where(eq(ads.id, adId)).returning();
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'ad.promoted', subjectType: 'ad', subjectId: adId, after: { days, cost: cost.toString(), until } });
    t.emit({ type: 'book.updated', room: `ads:${u.asset}:${u.fiat}`, payload: { adId } });
    return { adId, promotedUntil: until, charged: fromMinor(cost, 6, { trim: true }), asset: 'USDT' };
  });
}

// ---------------------------------------------------------------- analytics
/** Per-ad and total figures over the last `days` days, from the merchant's own orders. */
export async function merchantStats(ctx: Ctx, user: User, days = 30) {
  const since = new Date(ctx.now().getTime() - Math.min(365, Math.max(1, days)) * 86400_000);
  const rows = await ctx.db.select({
    adId: orders.adId, asset: orders.asset, fiat: orders.fiat,
    total: sql<number>`count(*)::int`,
    completed: sql<number>`count(*) filter (where ${orders.status} = 'COMPLETED')::int`,
    cancelled: sql<number>`count(*) filter (where ${orders.status} = 'CANCELLED')::int`,
    disputed: sql<number>`count(*) filter (where ${orders.status} = 'DISPUTED')::int`,
    fiatVolume: sql<string>`coalesce(sum(${orders.fiatAmount}) filter (where ${orders.status} = 'COMPLETED'), 0)::text`,
    cryptoVolume: sql<string>`coalesce(sum(${orders.cryptoAmount}) filter (where ${orders.status} = 'COMPLETED'), 0)::text`,
    usdCents: sql<string>`coalesce(sum(${orders.usdValueCents}) filter (where ${orders.status} = 'COMPLETED'), 0)::text`,
    fees: sql<string>`coalesce(sum(${orders.feeAmount}) filter (where ${orders.status} = 'COMPLETED'), 0)::text`,
    avgReleaseSec: sql<number>`coalesce(avg(extract(epoch from (${orders.releasedAt} - ${orders.paidAt}))) filter (where ${orders.status} = 'COMPLETED' and ${orders.paidAt} is not null), 0)::int`,
  }).from(orders).where(and(eq(orders.makerId, user.id), gte(orders.createdAt, since))).groupBy(orders.adId, orders.asset, orders.fiat);
  const adRows = rows.length ? await ctx.db.select({ id: ads.id, side: ads.side, status: ads.status }).from(ads).where(inArray(ads.id, rows.map((r) => r.adId))) : [];
  const perAd = await Promise.all(rows.map(async (r) => {
    const fd = await fiatDecimals(ctx.db, r.fiat); const d = assetDecimals(r.asset as Asset);
    const a = adRows.find((x) => x.id === r.adId);
    return {
      adId: r.adId, side: a?.side, status: a?.status, asset: r.asset, fiat: r.fiat, orders: r.total, completed: r.completed, cancelled: r.cancelled, disputed: r.disputed,
      completionRateBps: r.total ? Math.round((r.completed / r.total) * 10000) : 0,
      fiatVolume: fromMinor(BigInt(r.fiatVolume), fd), cryptoVolume: fromMinor(BigInt(r.cryptoVolume), d), feesPaid: fromMinor(BigInt(r.fees), d), avgReleaseSec: r.avgReleaseSec,
      usdVolume: (Number(r.usdCents) / 100).toFixed(2),
    };
  }));
  const sum = (k: 'orders' | 'completed' | 'cancelled' | 'disputed') => perAd.reduce((a, r) => a + r[k], 0);
  const totalOrders = sum('orders');
  return {
    days, since,
    totals: { orders: totalOrders, completed: sum('completed'), cancelled: sum('cancelled'), disputed: sum('disputed'), completionRateBps: totalOrders ? Math.round((sum('completed') / totalOrders) * 10000) : 0, usdVolume: perAd.reduce((a, r) => a + Number(r.usdVolume), 0).toFixed(2) },
    perAd,
  };
}

// ---------------------------------------------------------------- bulk ad actions
export type BulkAction = { action: 'pause' | 'resume' | 'close' } | { action: 'margin'; marginBps: number } | { action: 'price'; price: string };
/** Apply one action to many of the user's ads; reports per-ad success so one bad ad doesn't stop the rest. */
export async function bulkAds(ctx: Ctx, user: User, adIds: string[], a: BulkAction) {
  if (!adIds.length || adIds.length > 100) throw new DomainError('VALIDATION', '1–100 ads');
  const results: Array<{ adId: string; ok: boolean; error?: string }> = [];
  for (const id of [...new Set(adIds)]) {
    try {
      if (a.action === 'pause') await setAdStatus(ctx, user, id, 'paused');
      else if (a.action === 'resume') await setAdStatus(ctx, user, id, 'active');
      else if (a.action === 'close') await setAdStatus(ctx, user, id, 'closed');
      else if (a.action === 'margin') {
        const [ad] = await ctx.db.select({ t: ads.priceType }).from(ads).where(and(eq(ads.id, id), eq(ads.userId, user.id)));
        if (ad?.t !== 'floating') throw new DomainError('VALIDATION', 'only floating-price ads take a margin');
        await updateAdPricing(ctx, user, id, { marginBps: a.marginBps });
      } else {
        const [ad] = await ctx.db.select({ t: ads.priceType }).from(ads).where(and(eq(ads.id, id), eq(ads.userId, user.id)));
        if (ad?.t !== 'fixed') throw new DomainError('VALIDATION', 'only fixed-price ads take a price');
        await updateAdPricing(ctx, user, id, { price: (a as { price: string }).price });
      }
      results.push({ adId: id, ok: true });
    } catch (e) { results.push({ adId: id, ok: false, error: (e as { code?: string }).code ?? 'ERROR' }); }
  }
  return { results };
}

// ---------------------------------------------------------------- pay with link
/** Public merchant page: profile + their active ads (both sides). Found by nickname (case-insensitive) or user id. */
export async function merchantPage(ctx: Ctx, handle: string) {
  const h = handle.trim();
  const [u] = await ctx.read.select({ id: users.id }).from(users).where(/^[0-9a-f-]{36}$/i.test(h) ? eq(users.id, h) : sql`lower(${users.displayName}) = lower(${h})`);
  if (!u) throw new DomainError('NOT_FOUND', 'merchant not found');
  const profile = await publicProfile(ctx, u.id);
  const rows = await ctx.read.select({ ad: ads, rep: reputation, m: { badge: merchantProfiles.verifiedBadge, level: merchantProfiles.level } }).from(ads)
    .leftJoin(reputation, eq(reputation.userId, ads.userId)).leftJoin(merchantProfiles, eq(merchantProfiles.userId, ads.userId))
    .where(and(eq(ads.userId, u.id), eq(ads.status, 'active'), sql`${ads.remainingAmount} > 0`)).orderBy(asc(ads.asset), asc(ads.fiat));
  const list = await Promise.all(rows.map(async (r) => presentAd(r.ad, await fiatDecimals(ctx.read, r.ad.fiat), { id: u.id, displayName: profile.displayName, kycTier: profile.kycTier, isMerchant: profile.isMerchant, lastSeenAt: profile.lastSeenAt }, r.rep, r.m)));
  return { profile, ads: profile.away || profile.offHours ? [] : list };
}

// ---------------------------------------------------------------- price history
/** Worker: snapshot best P2P prices and the market rate for every market that has active ads. */
export async function snapshotPrices(ctx: Ctx) {
  const pairs = await ctx.db.selectDistinct({ asset: ads.asset, fiat: ads.fiat }).from(ads).where(eq(ads.status, 'active'));
  const now = ctx.now();
  for (const p of pairs) {
    const [ask] = await ctx.db.select({ v: sql<string | null>`min(${ads.price})::text` }).from(ads).where(and(eq(ads.asset, p.asset), eq(ads.fiat, p.fiat), eq(ads.side, 'sell'), eq(ads.status, 'active'), gt(ads.remainingAmount, 0n)));
    const [bid] = await ctx.db.select({ v: sql<string | null>`max(${ads.price})::text` }).from(ads).where(and(eq(ads.asset, p.asset), eq(ads.fiat, p.fiat), eq(ads.side, 'buy'), eq(ads.status, 'active'), gt(ads.remainingAmount, 0n)));
    const market = await getReferencePrice(ctx, ctx.db, p.asset as Asset, p.fiat).catch(() => null);
    await ctx.db.insert(priceSnapshots).values({ asset: p.asset, fiat: p.fiat, bestAsk: ask?.v ? BigInt(ask.v) : null, bestBid: bid?.v ? BigInt(bid.v) : null, market: market ?? null, at: now });
  }
  await ctx.db.delete(priceSnapshots).where(sql`${priceSnapshots.at} < now() - interval '30 days'`);
  return { pairs: pairs.length };
}
export async function priceHistory(ctx: Ctx, asset: string, fiat: string, hours = 24) {
  const h = Math.min(24 * 30, Math.max(1, hours));
  const fd = await fiatDecimals(ctx.read, fiat);
  const rows = await ctx.read.select().from(priceSnapshots)
    .where(and(eq(priceSnapshots.asset, asset), eq(priceSnapshots.fiat, fiat), gte(priceSnapshots.at, new Date(ctx.now().getTime() - h * 3600_000))))
    .orderBy(asc(priceSnapshots.at)).limit(2000);
  const f = (v: bigint | null) => (v === null ? null : formatPrice(v, fd));
  return { asset, fiat, hours: h, points: rows.map((r) => ({ at: r.at, bestAsk: f(r.bestAsk), bestBid: f(r.bestBid), market: f(r.market) })) };
}
