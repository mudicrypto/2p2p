/**
 * Cross-border corridors (M11): fiat A -> USDT -> fiat B as two linked orders with a shared timer.
 * Leg 1: the user buys USDT with fiat A from a SELL ad. Leg 2: the user sells that USDT for fiat B into a BUY ad.
 * Leg 2 is created together with leg 1 (ad capacity + limits reserved, status CREATED) and is escrowed
 * atomically inside leg 1's release transaction. If leg 1 fails, leg 2 is cancelled (LINKED_LEG_FAILED) and
 * every reservation is released; if leg 2 fails, its escrow refunds to the user. No escrow can be stranded.
 */
import { ads, corridors, orders, paymentMethods, paymentMethodTypes, and, eq, sql, inArray } from '@p2p/db';
import { DomainError, cryptoToFiat, fiatToCrypto, toMinor, fromMinor, pow10, PRICE_SCALE, assetDecimals, type Asset } from '@p2p/shared';
import type { Ctx, TxCtx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import { postTx, userAcct } from './ledger';
import { orderBook } from './ads';
import { fiatDecimals } from './fiat';
import { getReferencePrice, floatingPrice } from './rates';
import { releaseTradeLimit } from './limits';
import { assertCountryAllowed } from './compliance';
import { createOrderInTx, transition, escrowAmount, type Order } from './orders';
import type { User } from './auth';

const ASSET: Asset = 'USDT';
export interface CorridorInput { fromFiat: string; toFiat: string; fiatIn: string; payInType?: string; receivePaymentMethodId: string }

const livePrice = async (ctx: Ctx, ad: typeof ads.$inferSelect) => (ad.priceType === 'floating' ? floatingPrice((await getReferencePrice(ctx, ctx.db, ad.asset as Asset, ad.fiat))!, ad.marginBps ?? 0) : ad.price!);

/** Rate "fiat B per 1 fiat A" scaled by 1e8, from minor-unit amounts. */
const rateScaled = (outMinor: bigint, inMinor: bigint, dIn: number, dOut: number) => (outMinor * pow10(dIn) * PRICE_SCALE) / (inMinor * pow10(dOut));

export async function quoteCorridor(ctx: Ctx, user: User, input: CorridorInput) {
  if (input.fromFiat === input.toFiat) throw new DomainError('VALIDATION', 'corridor needs two different currencies');
  const dA = await fiatDecimals(ctx.db, input.fromFiat);
  const dB = await fiatDecimals(ctx.db, input.toFiat);
  const dec = assetDecimals(ASSET);
  const fiatIn = toMinor(input.fiatIn, dA);
  const [rpm] = await ctx.db.select().from(paymentMethods).where(and(eq(paymentMethods.id, input.receivePaymentMethodId), eq(paymentMethods.userId, user.id), eq(paymentMethods.active, true)));
  if (!rpm) throw new DomainError('VALIDATION', 'receiving payment method not found');

  // Leg 1: cheapest SELL ad in fiat A that fits the amount (non-reversible rails only: no holds inside a corridor).
  const bookA = await orderBook(ctx, { side: 'buy', asset: ASSET, fiat: input.fromFiat, amount: input.fiatIn, paymentType: input.payInType, limit: 20 });
  let legA: { ad: typeof ads.$inferSelect; price: bigint; crypto: bigint; pmId: string } | null = null;
  for (const it of bookA.items) {
    const [ad] = await ctx.db.select().from(ads).where(eq(ads.id, it.id));
    if (!ad || ad.userId === user.id) continue;
    const pms = await ctx.db.select({ id: paymentMethods.id, type: paymentMethods.type, rev: paymentMethodTypes.reversible }).from(paymentMethods)
      .innerJoin(paymentMethodTypes, eq(paymentMethodTypes.code, paymentMethods.type)).where(inArray(paymentMethods.id, ad.paymentMethodIds));
    const pm = pms.find((m) => !m.rev && (!input.payInType || m.type === input.payInType));
    if (!pm) continue; // reversible rails (chargeback holds) are not allowed inside a corridor
    const price = await livePrice(ctx, ad);
    const crypto = fiatToCrypto(fiatIn, price, dec);
    if (crypto > 0n && crypto <= ad.remainingAmount) { legA = { ad, price, crypto, pmId: pm.id }; break; }
  }
  if (!legA) throw new DomainError('AD_UNAVAILABLE', `no ${input.fromFiat} liquidity for this amount`);

  // Leg 2: best BUY ad in fiat B that accepts the user's receiving method and fits the crypto amount.
  const bookB = await orderBook(ctx, { side: 'sell', asset: ASSET, fiat: input.toFiat, paymentType: rpm.type, limit: 20 });
  let legB: { ad: typeof ads.$inferSelect; price: bigint; fiatOut: bigint } | null = null;
  for (const it of bookB.items) {
    const [ad] = await ctx.db.select().from(ads).where(eq(ads.id, it.id));
    if (!ad || ad.userId === user.id || ad.userId === legA.ad.userId) continue;
    const price = await livePrice(ctx, ad);
    const fiatOut = cryptoToFiat(legA.crypto, price, dec);
    if (legA.crypto <= ad.remainingAmount && fiatOut >= ad.minAmount && fiatOut <= ad.maxAmount) { legB = { ad, price, fiatOut }; break; }
  }
  if (!legB) throw new DomainError('AD_UNAVAILABLE', `no ${input.toFiat} liquidity for this amount`);

  const refA = await getReferencePrice(ctx, ctx.db, ASSET, input.fromFiat);
  const refB = await getReferencePrice(ctx, ctx.db, ASSET, input.toFiat);
  const effective = rateScaled(legB.fiatOut, fiatIn, dA, dB);
  const market = refA && refB ? (refB * pow10(dA) * PRICE_SCALE) / (refA * pow10(dB)) : effective;
  const spreadBps = market > 0n ? Number(((market - effective) * 10_000n) / market) : 0;
  return {
    fromFiat: input.fromFiat, toFiat: input.toFiat, fiatIn, fiatOut: legB.fiatOut, crypto: legA.crypto, legA, legB, effective, market, spreadBps,
    display: {
      youPay: fromMinor(fiatIn, dA), youReceive: fromMinor(legB.fiatOut, dB), viaUsdt: fromMinor(legA.crypto, dec),
      effectiveRate: fromMinor(effective, 8), marketRate: fromMinor(market, 8), spreadPct: (spreadBps / 100).toFixed(2),
    },
  };
}

export async function createCorridor(ctx: Ctx, user: User, input: CorridorInput) {
  await assertCountryAllowed(ctx.db, user.country);
  const q = await quoteCorridor(ctx, user, input);
  const dec = assetDecimals(ASSET);
  return runTx(ctx, async (t) => {
    const deadline = new Date(ctx.now().getTime() + q.legA.ad.paymentWindowMin * 60_000);
    const [c] = await t.tx.insert(corridors).values({
      userId: user.id, fromFiat: q.fromFiat, toFiat: q.toFiat, asset: ASSET, fiatIn: q.fiatIn, fiatOut: q.fiatOut, effectiveRate: q.effective, marketRate: q.market, expiresAt: deadline,
    }).returning();
    const leg1 = await createOrderInTx(ctx, t, user, { adId: q.legA.ad.id, cryptoAmount: fromMinor(q.crypto, dec), paymentMethodId: q.legA.pmId, corridorId: c.id }, { expiresAt: deadline });
    if (leg1.feePayer === 'buyer') throw new DomainError('CONFLICT', 'unexpected fee payer for corridor leg 1');
    const leg2 = await createOrderInTx(ctx, t, user, { adId: q.legB.ad.id, cryptoAmount: fromMinor(q.crypto, dec), paymentMethodId: input.receivePaymentMethodId, corridorId: c.id },
      { deferEscrow: true, expiresAt: new Date(deadline.getTime() + q.legB.ad.paymentWindowMin * 60_000) });
    if (escrowAmount(leg2) > leg1.cryptoAmount) throw new DomainError('CONFLICT', 'leg 2 would exceed leg 1 proceeds');
    await t.tx.update(corridors).set({ buyOrderId: leg1.id, sellOrderId: leg2.id }).where(eq(corridors.id, c.id));
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'corridor.created', subjectType: 'corridor', subjectId: c.id, after: q.display });
    return { corridorId: c.id, buyOrderId: leg1.id, sellOrderId: leg2.id, ...q.display, expiresAt: deadline };
  });
}

/** Called inside the leg's settlement transaction (release / refund / split). */
export async function onCorridorLegSettled(ctx: Ctx, t: TxCtx, o: Order, outcome: 'completed' | 'failed') {
  const [c] = await t.tx.select().from(corridors).where(eq(corridors.id, o.corridorId!)).for('update');
  if (!c) return;
  if (o.id === c.buyOrderId) {
    const [leg2] = await t.tx.select().from(orders).where(eq(orders.id, c.sellOrderId!)).for('update');
    if (!leg2 || leg2.status !== 'CREATED') return;
    if (outcome === 'completed') {
      // Fund leg 2's escrow from the USDT the user just received — same transaction, so it is atomic.
      const lock = escrowAmount(leg2);
      await postTx(t.tx, { type: 'escrow_lock', refType: 'order', refId: leg2.id, idempotencyKey: `order:${leg2.id}:lock`, postings: [
        { account: userAcct(leg2.sellerId, leg2.asset), amount: -lock }, { account: userAcct(leg2.sellerId, leg2.asset, 'escrow'), amount: lock },
      ] });
      const [ad] = await t.tx.select({ w: ads.paymentWindowMin }).from(ads).where(eq(ads.id, leg2.adId));
      await transition(t, leg2, 'ESCROW_LOCKED', 'system', null, 'corridor_leg1_settled', { expiresAt: new Date(ctx.now().getTime() + (ad?.w ?? 15) * 60_000) });
    } else {
      await cancelPendingLeg(t, leg2);
      await t.tx.update(corridors).set({ status: 'rolled_back' }).where(eq(corridors.id, c.id));
      await audit(t.tx, { actorType: 'system', action: 'corridor.rolled_back', subjectType: 'corridor', subjectId: c.id, after: { failedLeg: 1 } });
    }
    return;
  }
  if (o.id === c.sellOrderId) {
    await t.tx.update(corridors).set({ status: outcome === 'completed' ? 'completed' : 'rolled_back' }).where(eq(corridors.id, c.id));
    await audit(t.tx, { actorType: 'system', action: `corridor.${outcome === 'completed' ? 'completed' : 'rolled_back'}`, subjectType: 'corridor', subjectId: c.id, after: { failedLeg: outcome === 'failed' ? 2 : undefined } });
  }
}

/** Cancel a CREATED (never escrowed) leg: release the ad capacity and limit reservations; no ledger movement. */
async function cancelPendingLeg(t: TxCtx, leg: Order) {
  await transition(t, leg, 'LINKED_LEG_FAILED', 'system', null, 'linked_leg_failed', { cancelledAt: t.now() });
  await t.tx.update(ads).set({ remainingAmount: sql`${ads.remainingAmount} + ${leg.cryptoAmount.toString()}::numeric` }).where(and(eq(ads.id, leg.adId), sql`${ads.status} <> 'closed'`));
  for (const uid of [leg.buyerId, leg.sellerId].sort()) await releaseTradeLimit(t.tx, uid, leg.usdValueCents, leg.createdAt);
}

/** Sweeper safety net: a corridor past its deadline whose leg 1 never got paid -> cancel the pending leg 2. */
export async function sweepCorridors(ctx: Ctx) {
  const rows = await ctx.db.select().from(corridors).where(and(eq(corridors.status, 'active'), sql`${corridors.expiresAt} < now() - interval '1 minute'`)).limit(200);
  for (const c of rows) {
    await runTx(ctx, async (t) => {
      const [l1] = await t.tx.select().from(orders).where(eq(orders.id, c.buyOrderId!));
      const [l2] = await t.tx.select().from(orders).where(eq(orders.id, c.sellOrderId!)).for('update');
      if (l1 && l1.status === 'CANCELLED' && l2?.status === 'CREATED') {
        await cancelPendingLeg(t, l2);
        await t.tx.update(corridors).set({ status: 'rolled_back' }).where(eq(corridors.id, c.id));
      }
    });
  }
}

export async function getCorridor(ctx: Ctx, userId: string, id: string) {
  const [c] = await ctx.db.select().from(corridors).where(and(eq(corridors.id, id), eq(corridors.userId, userId)));
  if (!c) throw new DomainError('NOT_FOUND', 'corridor not found');
  const legs = await ctx.db.select().from(orders).where(eq(orders.corridorId, id));
  return { ...c, effectiveRate: fromMinor(c.effectiveRate, 8), marketRate: fromMinor(c.marketRate, 8), legs: legs.map((l) => ({ id: l.id, status: l.status, role: l.buyerId === userId ? 'buyer' : 'seller', fiat: l.fiat })) };
}
