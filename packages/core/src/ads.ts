/** Ads (fixed and floating) and the order book. */
import { ads, users, reputation, merchantProfiles, and, eq, sql, desc, asc, gte, lte, inArray } from '@p2p/db';
import { DomainError, toMinor, parsePrice, assetDecimals, formatPrice, fromMinor, tierCanCreateAds, cryptoToFiat, type Asset, type CreateAdInput } from '@p2p/shared';
import type { Ctx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import { getUserMethods, getMethodTypes } from './payments';
import { assertCountryAllowed, getCountryRule } from './compliance';
import { fiatDecimals, getFiat } from './fiat';
import { getReferencePrice, floatingPrice } from './rates';
import { balanceOf, userAcct } from './ledger';
import type { User } from './auth';

export type Ad = typeof ads.$inferSelect;

export async function createAd(ctx: Ctx, user: User, input: CreateAdInput) {
  if (user.status !== 'active') throw new DomainError('ACCOUNT_FROZEN', 'account not active');
  if (!tierCanCreateAds(user.kycTier)) throw new DomainError('TIER_REQUIRED', 'tier 1 required to create ads');
  await assertCountryAllowed(ctx.db, user.country);
  const asset = input.asset as Asset;
  const fiat = await getFiat(ctx.db, input.fiat);
  if (fiat && !fiat.enabled) throw new DomainError('VALIDATION', `${input.fiat} is not enabled`);
  const fd = await fiatDecimals(ctx.db, input.fiat);
  const minAmount = toMinor(input.minAmount, fd);
  const maxAmount = toMinor(input.maxAmount, fd);
  const totalAmount = toMinor(input.totalAmount, assetDecimals(asset));
  if (minAmount <= 0n || maxAmount < minAmount || totalAmount <= 0n) throw new DomainError('VALIDATION', 'invalid amounts');
  if (fiat?.minOrder && minAmount < fiat.minOrder) throw new DomainError('VALIDATION', 'min below fiat minimum');
  if (fiat?.maxOrder && maxAmount > fiat.maxOrder) throw new DomainError('VALIDATION', 'max above fiat maximum');

  const methods = await getUserMethods(ctx.db, user.id, input.paymentMethodIds);
  if (methods.length !== input.paymentMethodIds.length) throw new DomainError('VALIDATION', 'unknown payment method');
  const types = await getMethodTypes(ctx.db, methods.map((m) => m.type));
  const rule = await getCountryRule(ctx.db, user.country);
  for (const t of types) {
    if (!t.enabled) throw new DomainError('VALIDATION', `${t.code} disabled`);
    if (!t.currencies.includes(input.fiat) && !t.currencies.includes('*')) throw new DomainError('VALIDATION', `${t.code} does not support ${input.fiat}`);
    if (rule.allowedPaymentMethods && !rule.allowedPaymentMethods.includes(t.code)) throw new DomainError('FORBIDDEN', `${t.code} not allowed in ${user.country}`);
    // Reversible rails (chargeback risk): only tier 2+ sellers who explicitly opt in (spec 2b).
    if (t.reversible && (input.side !== 'sell' || user.kycTier < 2 || !input.acceptReversible)) throw new DomainError('TIER_REQUIRED', 'reversible methods need a tier 2+ seller who opts in');
  }
  let price: bigint;
  if (input.priceType === 'fixed') price = parsePrice(input.price!, fd);
  else {
    const ref = await getReferencePrice(ctx, ctx.db, asset, input.fiat);
    if (!ref) throw new DomainError('CONFLICT', 'no reference rate for floating price');
    price = floatingPrice(ref, input.marginBps!);
  }
  if (price <= 0n) throw new DomainError('VALIDATION', 'price must be positive');
  if (input.side === 'sell') {
    const bal = await balanceOf(ctx.db, userAcct(user.id, asset));
    if (bal < totalAmount) throw new DomainError('INSUFFICIENT_FUNDS', 'balance below ad total');
  }
  return runTx(ctx, async (t) => {
    const [ad] = await t.tx.insert(ads).values({
      userId: user.id, side: input.side, asset, fiat: input.fiat, priceType: input.priceType, price, marginBps: input.marginBps ?? null,
      minAmount, maxAmount, totalAmount, remainingAmount: totalAmount, paymentMethodIds: input.paymentMethodIds, paymentTypes: [...new Set(methods.map((m) => m.type))],
      paymentWindowMin: input.paymentWindowMin, terms: input.terms, minCounterpartyTier: input.minCounterpartyTier,
    }).returning();
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'ad.created', subjectType: 'ad', subjectId: ad.id, after: ad });
    t.emit({ type: 'book.updated', room: `ads:${asset}:${input.fiat}`, payload: { adId: ad.id } });
    return ad;
  });
}

export async function setAdStatus(ctx: Ctx, user: User, adId: string, status: 'active' | 'paused' | 'closed') {
  return runTx(ctx, async (t) => {
    const [before] = await t.tx.select().from(ads).where(and(eq(ads.id, adId), eq(ads.userId, user.id))).for('update');
    if (!before) throw new DomainError('NOT_FOUND', 'ad not found');
    if (before.status === 'closed') throw new DomainError('CONFLICT', 'ad is closed');
    const [ad] = await t.tx.update(ads).set({ status, updatedAt: ctx.now() }).where(eq(ads.id, adId)).returning();
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'ad.status', subjectType: 'ad', subjectId: adId, before: { status: before.status }, after: { status } });
    t.emit({ type: 'book.updated', room: `ads:${ad.asset}:${ad.fiat}`, payload: { adId } });
    return ad;
  });
}

export async function updateAdPricing(ctx: Ctx, user: User, adId: string, patch: { price?: string; marginBps?: number }) {
  const [ad] = await ctx.db.select().from(ads).where(and(eq(ads.id, adId), eq(ads.userId, user.id)));
  if (!ad) throw new DomainError('NOT_FOUND', 'ad not found');
  const fd = await fiatDecimals(ctx.db, ad.fiat);
  const set: Partial<Ad> = { updatedAt: ctx.now() };
  if (ad.priceType === 'fixed' && patch.price) set.price = parsePrice(patch.price, fd);
  if (ad.priceType === 'floating' && patch.marginBps !== undefined) {
    const ref = await getReferencePrice(ctx, ctx.db, ad.asset as Asset, ad.fiat);
    set.marginBps = patch.marginBps;
    set.price = floatingPrice(ref!, patch.marginBps);
  }
  return runTx(ctx, async (t) => {
    const [u] = await t.tx.update(ads).set(set).where(eq(ads.id, adId)).returning();
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'ad.repriced', subjectType: 'ad', subjectId: adId, before: { price: ad.price }, after: { price: u.price } });
    t.emit({ type: 'book.updated', room: `ads:${u.asset}:${u.fiat}`, payload: { adId } });
    return u;
  });
}

export interface BookQuery { side: 'buy' | 'sell'; asset: string; fiat: string; paymentType?: string; amount?: string; minTier?: number; merchantOnly?: boolean; limit: number; cursor?: string }

/**
 * Order book from the taker's perspective: side='buy' means the taker wants to buy => list SELL ads (cheapest first).
 * Uses the read replica.
 */
export async function orderBook(ctx: Ctx, q: BookQuery) {
  const adSide = q.side === 'buy' ? 'sell' : 'buy';
  const fd = await fiatDecimals(ctx.read, q.fiat);
  const conds = [eq(ads.asset, q.asset), eq(ads.fiat, q.fiat), eq(ads.side, adSide), eq(ads.status, 'active'), sql`${ads.remainingAmount} > 0`, eq(users.status, 'active')];
  if (q.paymentType) conds.push(sql`${ads.paymentTypes} @> ${JSON.stringify([q.paymentType])}::jsonb`);
  if (q.amount) {
    const amt = toMinor(q.amount, fd);
    conds.push(lte(ads.minAmount, amt), gte(ads.maxAmount, amt));
    conds.push(sql`${ads.remainingAmount} * ${ads.price} >= ${amt.toString()}::numeric * power(10::numeric, ${assetDecimalsSql(q.asset)}) * 100000000`);
  }
  if (q.minTier !== undefined) conds.push(gte(users.kycTier, q.minTier));
  if (q.merchantOnly) conds.push(eq(users.isMerchant, true));
  const offset = q.cursor ? Number(Buffer.from(q.cursor, 'base64url').toString()) || 0 : 0;
  const rows = await ctx.read.select({ ad: ads, u: { id: users.id, displayName: users.displayName, kycTier: users.kycTier, isMerchant: users.isMerchant, createdAt: users.createdAt }, rep: reputation, m: { badge: merchantProfiles.verifiedBadge, level: merchantProfiles.level } })
    .from(ads).innerJoin(users, eq(users.id, ads.userId)).leftJoin(reputation, eq(reputation.userId, ads.userId)).leftJoin(merchantProfiles, eq(merchantProfiles.userId, ads.userId))
    .where(and(...conds))
    .orderBy(adSide === 'sell' ? asc(ads.price) : desc(ads.price), desc(reputation.completionRateBps), asc(ads.createdAt))
    .limit(q.limit + 1).offset(offset);
  const items = rows.slice(0, q.limit).map((r) => presentAd(r.ad, fd, r.u, r.rep, r.m));
  return { items, nextCursor: rows.length > q.limit ? Buffer.from(String(offset + q.limit)).toString('base64url') : null };
}
const assetDecimalsSql = (a: string) => sql.raw(String(assetDecimals(a as Asset)));

export function presentAd(ad: Ad, fd: number, u?: any, rep?: any, m?: any) {
  const ad_ = assetDecimals(ad.asset as Asset);
  const maxByRemaining = cryptoToFiat(ad.remainingAmount, ad.price!, ad_, 'floor');
  return {
    id: ad.id, side: ad.side, asset: ad.asset, fiat: ad.fiat, priceType: ad.priceType, marginBps: ad.marginBps,
    price: formatPrice(ad.price!, fd), minAmount: fromMinor(ad.minAmount, fd), maxAmount: fromMinor(ad.maxAmount < maxByRemaining ? ad.maxAmount : maxByRemaining, fd),
    totalAmount: fromMinor(ad.totalAmount, ad_), remainingAmount: fromMinor(ad.remainingAmount, ad_), paymentTypes: ad.paymentTypes,
    paymentWindowMin: ad.paymentWindowMin, terms: ad.terms, minCounterpartyTier: ad.minCounterpartyTier, status: ad.status, createdAt: ad.createdAt,
    advertiser: u ? {
      id: u.id, displayName: u.displayName ?? `user-${String(u.id).slice(0, 6)}`, kycTier: u.kycTier, isMerchant: u.isMerchant, verifiedBadge: !!m?.badge, merchantLevel: m?.level ?? 0,
      trades30d: rep?.trades30d ?? 0, completionRateBps: rep?.completionRateBps ?? 10000, avgReleaseSec: rep?.avgReleaseSec ?? 0,
    } : undefined,
  };
}

export async function getAd(ctx: Ctx, id: string) {
  const [ad] = await ctx.db.select().from(ads).where(eq(ads.id, id));
  if (!ad) throw new DomainError('NOT_FOUND', 'ad not found');
  return ad;
}
export async function myAds(ctx: Ctx, userId: string) {
  const rows = await ctx.db.select().from(ads).where(and(eq(ads.userId, userId), inArray(ads.status, ['active', 'paused']))).orderBy(desc(ads.createdAt));
  return Promise.all(rows.map(async (a) => presentAd(a, await fiatDecimals(ctx.db, a.fiat))));
}
