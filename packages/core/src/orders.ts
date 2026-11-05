/**
 * Orders + escrow (spec 4). Every transition: `UPDATE ... WHERE status = :expected` inside the same
 * DB transaction as its ledger movement, plus order_events + audit_log rows.
 */
import { randomBytes } from 'node:crypto';
import { ads, orders, orderEvents, paymentMethods, paymentMethodTypes, users, merchantProfiles, and, eq, sql, lt, inArray, desc, or } from '@p2p/db';
import {
  DomainError, nextStatus, escrowEffect, toMinor, fiatToCrypto, cryptoToFiat, assetDecimals, fromMinor, formatPrice, applyBps,
  type Asset, type OrderStatus, type OrderEvent, type OrderActor,
} from '@p2p/shared';
import type { Ctx, TxCtx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import { postTx, userAcct, systemAcct, type Posting } from './ledger';
import { getConfig } from './config';
import { computeFee } from './fees';
import { fiatDecimals } from './fiat';
import { getReferencePrice, floatingPrice } from './rates';
import { consumeTradeLimit, releaseTradeLimit, usdCents, reloadUser } from './limits';
import { assertCountryAllowed } from './compliance';
import { require2fa, type User } from './auth';
import { scoreOrder, flag } from './risk';
import { assertTierAllowed } from './kyc';
import { decryptJson } from './crypto';
import { notify } from './notifications';
import { recomputeReputation } from './reputation';
import { onCorridorLegSettled } from './corridors';

export type Order = typeof orders.$inferSelect;
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newReferenceCode = () => 'P2P' + Array.from(randomBytes(8), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');

/** Escrow amount locked from the seller: crypto + maker fee when the maker is the seller. */
export const escrowAmount = (o: Pick<Order, 'cryptoAmount' | 'feeAmount' | 'feePayer'>) => o.cryptoAmount + (o.feePayer === 'seller' ? o.feeAmount : 0n);

export interface CreateOrderInput { adId: string; fiatAmount?: string; cryptoAmount?: string; paymentMethodId?: string; corridorId?: string }
export interface CreateOrderOpts { /** Corridor leg 2: reserve the ad + limits now, lock escrow when leg 1 settles. */ deferEscrow?: boolean; expiresAt?: Date }

export async function createOrder(ctx: Ctx, takerIn: User, input: CreateOrderInput): Promise<Order> {
  await assertCountryAllowed(ctx.db, takerIn.country);
  return runTx(ctx, (t) => createOrderInTx(ctx, t, takerIn, input));
}

export async function createOrderInTx(ctx: Ctx, t: TxCtx, takerIn: User, input: CreateOrderInput, opts: CreateOrderOpts = {}): Promise<Order> {
  {
    const taker = await reloadUser(t.tx, takerIn.id);
    const [ad] = await t.tx.select().from(ads).where(eq(ads.id, input.adId)).for('update');
    if (!ad || ad.status !== 'active') throw new DomainError('AD_UNAVAILABLE', 'ad not available');
    if (ad.userId === taker.id) throw new DomainError('SELF_TRADE', 'cannot trade with your own ad');
    if (taker.status !== 'active') throw new DomainError('ACCOUNT_FROZEN', 'account not active');
    if (taker.kycTier < ad.minCounterpartyTier) throw new DomainError('TIER_REQUIRED', `advertiser requires tier ${ad.minCounterpartyTier}+`);
    const maker = await reloadUser(t.tx, ad.userId);
    if (maker.status !== 'active') throw new DomainError('AD_UNAVAILABLE', 'advertiser unavailable');
    const trading = await getConfig(t.tx, 'trading');
    const [{ open }] = await t.tx.select({ open: sql<number>`count(*)::int` }).from(orders)
      .where(and(or(eq(orders.buyerId, taker.id), eq(orders.sellerId, taker.id)), inArray(orders.status, ['AWAITING_PAYMENT', 'PAID', 'DISPUTED'])));
    if (open >= trading.maxOpenOrdersPerUser) throw new DomainError('LIMIT_EXCEEDED', 'too many open orders');

    const asset = ad.asset as Asset;
    const dec = assetDecimals(asset);
    const fd = await fiatDecimals(t.tx, ad.fiat);
    let price = ad.price!;
    if (ad.priceType === 'floating') {
      const ref = await getReferencePrice(ctx, t.tx, asset, ad.fiat);
      if (!ref) throw new DomainError('CONFLICT', 'reference rate unavailable');
      price = floatingPrice(ref, ad.marginBps ?? 0);
    }
    let fiatAmount: bigint; let cryptoAmount: bigint;
    if (input.fiatAmount) { fiatAmount = toMinor(input.fiatAmount, fd); cryptoAmount = fiatToCrypto(fiatAmount, price, dec); }
    else { cryptoAmount = toMinor(input.cryptoAmount!, dec); fiatAmount = cryptoToFiat(cryptoAmount, price, dec); }
    if (cryptoAmount <= 0n || fiatAmount <= 0n) throw new DomainError('VALIDATION', 'amount too small');
    if (fiatAmount < ad.minAmount || fiatAmount > ad.maxAmount) throw new DomainError('VALIDATION', `amount must be between ${fromMinor(ad.minAmount, fd)} and ${fromMinor(ad.maxAmount, fd)} ${ad.fiat}`);
    if (cryptoAmount > ad.remainingAmount) throw new DomainError('AD_UNAVAILABLE', 'not enough remaining on this ad');

    await assertTierAllowed(t.tx, taker);
    await assertTierAllowed(t.tx, maker);
    const sellerIsMaker = ad.side === 'sell';
    const buyer = sellerIsMaker ? taker : maker;
    const seller = sellerIsMaker ? maker : taker;

    // Payment method: the seller's account that receives fiat.
    let pmId: string;
    if (sellerIsMaker) {
      pmId = input.paymentMethodId ?? ad.paymentMethodIds[0];
      if (!ad.paymentMethodIds.includes(pmId)) throw new DomainError('VALIDATION', 'payment method not offered by this ad');
    } else {
      if (!input.paymentMethodId) throw new DomainError('VALIDATION', 'paymentMethodId (your receiving account) required');
      pmId = input.paymentMethodId;
    }
    const [pm] = await t.tx.select({ pm: paymentMethods, t: paymentMethodTypes }).from(paymentMethods).innerJoin(paymentMethodTypes, eq(paymentMethodTypes.code, paymentMethods.type))
      .where(and(eq(paymentMethods.id, pmId), eq(paymentMethods.userId, seller.id), eq(paymentMethods.active, true)));
    if (!pm) throw new DomainError('VALIDATION', 'invalid payment method');
    if (!sellerIsMaker && !ad.paymentTypes.includes(pm.pm.type)) throw new DomainError('VALIDATION', 'payment type not accepted by this ad');
    if (pm.t.reversible && (seller.kycTier < 2 || !sellerIsMaker)) throw new DomainError('TIER_REQUIRED', 'reversible methods need an opted-in tier 2+ seller');

    const fees = await getConfig(t.tx, 'fees');
    const [mp] = await t.tx.select({ level: merchantProfiles.level, status: merchantProfiles.status }).from(merchantProfiles).where(eq(merchantProfiles.userId, maker.id));
    const { fee } = computeFee(fees, cryptoAmount, mp?.status === 'approved' ? mp.level : 0);
    const feePayer = sellerIsMaker ? 'seller' : 'buyer';
    if (feePayer === 'buyer' && fee >= cryptoAmount) throw new DomainError('VALIDATION', 'amount too small to cover fee');

    const usd = await usdCents(ctx, t.tx, asset, cryptoAmount);
    // Lock order: ad -> limit_usage (by user id) -> accounts (by id). Keeps every path deadlock-free.
    for (const u of [buyer, seller].sort((a, b) => (a.id < b.id ? -1 : 1))) await consumeTradeLimit(ctx, t.tx, u, usd);

    await t.tx.update(ads).set({ remainingAmount: sql`${ads.remainingAmount} - ${cryptoAmount.toString()}::numeric`, updatedAt: ctx.now() }).where(eq(ads.id, ad.id));

    const risk = await scoreOrder(ctx, t.tx, { buyer, seller, usdCents: usd, paymentRisk: pm.t.riskLevel, reversible: pm.t.reversible });
    const now = ctx.now();
    const [created] = await t.tx.insert(orders).values({
      adId: ad.id, makerId: maker.id, takerId: taker.id, buyerId: buyer.id, sellerId: seller.id, asset, fiat: ad.fiat,
      cryptoAmount, fiatAmount, price, feeAmount: fee, feePayer, usdValueCents: usd, paymentMethodId: pmId, paymentType: pm.pm.type,
      referenceCode: newReferenceCode(), status: 'CREATED', riskScore: risk.score, manualConfirmRequired: risk.manual,
      expiresAt: opts.expiresAt ?? new Date(now.getTime() + ad.paymentWindowMin * 60_000), corridorId: input.corridorId ?? null,
    }).returning();
    if (opts.deferEscrow) {
      await logEvent(t, created.id, null, 'CREATED', 'CREATE', sellerIsMaker ? 'buyer' : 'seller', taker.id, 'corridor_leg_pending');
      return created;
    }
    await logEvent(t, created.id, null, 'CREATED', 'CREATE', sellerIsMaker ? 'buyer' : 'seller', taker.id);
    // Lock escrow atomically with creation (CREATED -> AWAITING_PAYMENT).
    const lock = escrowAmount(created);
    await postTx(t.tx, { type: 'escrow_lock', refType: 'order', refId: created.id, idempotencyKey: `order:${created.id}:lock`, postings: [
      { account: userAcct(seller.id, asset), amount: -lock }, { account: userAcct(seller.id, asset, 'escrow'), amount: lock },
    ] });
    const o = await transition(t, created, 'ESCROW_LOCKED', 'system', null);
    for (const f of risk.flags) await flag(t.tx, 'order', o.id, f.code, f.severity, f.details);
    t.afterCommit(() => ctx.jobs?.enqueue('order.expire', { orderId: o.id }, { delayMs: ad.paymentWindowMin * 60_000 + 1000, jobId: `expire-${o.id}` }));
    t.emit({ type: 'order.created', orderId: o.id, userIds: [maker.id], payload: { orderId: o.id, status: o.status } });
    t.emit({ type: 'book.updated', room: `ads:${asset}:${ad.fiat}`, payload: { adId: ad.id } });
    return o;
  }
}

async function logEvent(t: TxCtx, orderId: string, from: OrderStatus | null, to: OrderStatus, event: string, actor: string, actorId: string | null, reason?: string) {
  await t.tx.insert(orderEvents).values({ orderId, fromStatus: from, toStatus: to, event, actor, actorId, reason });
  await audit(t.tx, { actorType: actor === 'arbiter' ? 'admin' : actor === 'system' || actor === 'verifier' ? 'system' : 'user', actorId, action: `order.${event.toLowerCase()}`, subjectType: 'order', subjectId: orderId, before: { status: from }, after: { status: to, reason } });
}

/** Optimistic state transition. Throws ILLEGAL_TRANSITION if the state changed concurrently. */
export async function transition(t: TxCtx, o: Order, event: OrderEvent, actor: OrderActor, actorId: string | null, reason?: string, patch: Partial<Order> = {}): Promise<Order> {
  let to: OrderStatus;
  try { to = nextStatus(o.status as OrderStatus, event, actor); }
  catch (e) { throw new DomainError('ILLEGAL_TRANSITION', (e as Error).message); }
  const [u] = await t.tx.update(orders).set({ ...patch, status: to, version: sql`${orders.version} + 1` })
    .where(and(eq(orders.id, o.id), eq(orders.status, o.status))).returning();
  if (!u) throw new DomainError('ILLEGAL_TRANSITION', 'order state changed concurrently');
  await logEvent(t, o.id, o.status as OrderStatus, to, event, actor, actorId, reason);
  t.emit({ type: 'order.status', orderId: o.id, payload: { orderId: o.id, status: to, event } });
  const kind = NOTIFY_ON[to];
  if (kind) {
    const targets = to === 'AWAITING_PAYMENT' ? [o.makerId] : to === 'PAID' ? [o.sellerId] : [o.buyerId, o.sellerId];
    for (const uid of targets) await notify(t, t.tx, uid, kind, { orderId: o.id, status: to, amount: o.cryptoAmount.toString(), asset: o.asset });
  }
  if (to === 'COMPLETED' || to === 'CANCELLED' || to === 'DISPUTED') {
    t.afterCommit(async () => {
      if (ctxHasJobs(t)) await t.jobs!.enqueue('reputation.recompute', { userIds: [o.buyerId, o.sellerId] });
      else for (const uid of [o.buyerId, o.sellerId]) await recomputeReputation(t, uid);
    });
  }
  return u;
}

const NOTIFY_ON: Partial<Record<OrderStatus, string>> = { AWAITING_PAYMENT: 'order_created', PAID: 'order_paid', COMPLETED: 'order_completed', CANCELLED: 'order_cancelled', DISPUTED: 'order_disputed' };
const ctxHasJobs = (c: Ctx) => !!c.jobs;

export async function lockOrder(t: TxCtx, id: string): Promise<Order> {
  const [o] = await t.tx.select().from(orders).where(eq(orders.id, id)).for('update');
  if (!o) throw new DomainError('NOT_FOUND', 'order not found');
  return o;
}

/** Ledger effect for a terminal transition. `buyerBps` only for splits. */
export async function applyEscrow(ctx: Ctx, t: TxCtx, o: Order, effect: 'release' | 'refund' | 'split', buyerBps = 0) {
  const asset = o.asset as Asset;
  const lock = escrowAmount(o);
  const escrow = userAcct(o.sellerId, asset, 'escrow');
  const key = `order:${o.id}:${effect}`;
  if (effect === 'refund') {
    // Same lock order as createOrder: ad -> limit_usage -> accounts.
    await t.tx.update(ads).set({ remainingAmount: sql`${ads.remainingAmount} + ${o.cryptoAmount.toString()}::numeric` }).where(and(eq(ads.id, o.adId), sql`${ads.status} <> 'closed'`));
    for (const uid of [o.buyerId, o.sellerId].sort()) await releaseTradeLimit(t.tx, uid, o.usdValueCents, o.createdAt);
    await postTx(t.tx, { type: 'escrow_refund', refType: 'order', refId: o.id, idempotencyKey: key, postings: [{ account: escrow, amount: -lock }, { account: userAcct(o.sellerId, asset), amount: lock }] });
    if (o.corridorId) await onCorridorLegSettled(ctx, t, o, 'failed');
    return;
  }
  if (effect === 'split') {
    // Arbiter split: no fee; buyer gets buyerBps of the crypto amount, seller gets the rest of the escrow back.
    const toBuyer = applyBps(o.cryptoAmount, buyerBps, 'floor');
    const toSeller = lock - toBuyer;
    const p: Posting[] = [{ account: escrow, amount: -lock }];
    if (toBuyer > 0n) p.push({ account: userAcct(o.buyerId, asset), amount: toBuyer });
    if (toSeller > 0n) p.push({ account: userAcct(o.sellerId, asset), amount: toSeller });
    await postTx(t.tx, { type: 'escrow_split', refType: 'order', refId: o.id, idempotencyKey: key, postings: p });
    if (o.corridorId) await onCorridorLegSettled(ctx, t, o, 'failed'); // partial leg 1 cannot fund leg 2
    return;
  }
  const fees = await getConfig(t.tx, 'fees');
  const insurance = applyBps(o.feeAmount, fees.insuranceShareBps, 'floor');
  const platform = o.feeAmount - insurance;
  const buyerGets = o.cryptoAmount - (o.feePayer === 'buyer' ? o.feeAmount : 0n);
  // Reversible rails: crypto sits in a hold account until the chargeback window passes.
  const buyerKind = o.holdUntil && o.holdUntil > ctx.now() ? 'hold' : 'available';
  const p: Posting[] = [{ account: escrow, amount: -lock }, { account: userAcct(o.buyerId, asset, buyerKind), amount: buyerGets }];
  if (platform > 0n) p.push({ account: systemAcct(asset, 'fee'), amount: platform });
  if (insurance > 0n) p.push({ account: systemAcct(asset, 'insurance'), amount: insurance });
  await postTx(t.tx, { type: 'escrow_release', refType: 'order', refId: o.id, idempotencyKey: key, postings: p });
  if (o.corridorId) await onCorridorLegSettled(ctx, t, o, 'completed');
}

// ---------------------------------------------------------------- actions
export async function markPaid(ctx: Ctx, user: User, orderId: string) {
  return runTx(ctx, async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.buyerId !== user.id) throw new DomainError('FORBIDDEN', 'only the buyer can mark paid');
    const [pmt] = await t.tx.select({ reversible: paymentMethodTypes.reversible, holdHours: paymentMethodTypes.holdHours }).from(paymentMethodTypes).where(eq(paymentMethodTypes.code, o.paymentType ?? ''));
    const trading = await getConfig(t.tx, 'trading');
    const holdUntil = pmt?.reversible ? new Date(ctx.now().getTime() + (pmt.holdHours || trading.reversibleHoldHours) * 3600_000) : null;
    const u = await transition(t, o, 'MARK_PAID', 'buyer', user.id, undefined, { paidAt: ctx.now(), holdUntil });
    t.afterCommit(() => ctx.jobs?.enqueue('payment.verify', { orderId }, { delayMs: 5_000 }));
    return u;
  });
}

export async function cancelOrder(ctx: Ctx, user: User, orderId: string, reason = 'buyer_cancelled') {
  return runTx(ctx, async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.buyerId !== user.id) throw new DomainError('FORBIDDEN', 'only the buyer can cancel');
    const u = await transition(t, o, 'BUYER_CANCEL', 'buyer', user.id, reason, { cancelledAt: ctx.now() });
    await applyEscrow(ctx, t, o, 'refund');
    return u;
  });
}

export async function releaseOrder(ctx: Ctx, user: User, orderId: string, totp: string | undefined, opts: { skip2fa?: boolean } = {}) {
  if (!opts.skip2fa) await require2fa(ctx, user, totp);
  return runTx(ctx, async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.sellerId !== user.id) throw new DomainError('FORBIDDEN', 'only the seller can release');
    const u = await transition(t, o, 'RELEASE', 'seller', user.id, undefined, { releasedAt: ctx.now() });
    await applyEscrow(ctx, t, o, 'release');
    return u;
  });
}

/** System auto-release after PaymentVerifier full match (M10). */
export async function autoRelease(ctx: Ctx, orderId: string, actor: 'verifier' | 'system' = 'verifier') {
  return runTx(ctx, async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.manualConfirmRequired) throw new DomainError('RISK_BLOCKED', 'manual confirmation required');
    const u = await transition(t, o, 'AUTO_RELEASE', actor, null, 'verifier_full_match', { releasedAt: ctx.now(), autoConfirmed: true });
    await applyEscrow(ctx, t, o, 'release');
    return u;
  });
}

export async function expireOrder(ctx: Ctx, orderId: string) {
  return runTx(ctx, async (t) => {
    const o = await lockOrder(t, orderId);
    if (o.status !== 'AWAITING_PAYMENT' || o.expiresAt > ctx.now()) return null;
    const u = await transition(t, o, 'TIMEOUT', 'system', null, 'payment_window_expired', { cancelledAt: ctx.now() });
    await applyEscrow(ctx, t, o, 'refund');
    return u;
  });
}

/** Backup sweeper (every 30s) in case a delayed job was lost. */
export async function sweepExpiredOrders(ctx: Ctx, limit = 500) {
  const rows = await ctx.db.select({ id: orders.id }).from(orders).where(and(eq(orders.status, 'AWAITING_PAYMENT'), lt(orders.expiresAt, ctx.now()))).limit(limit);
  let n = 0;
  for (const r of rows) {
    try { if (await expireOrder(ctx, r.id)) n++; } catch (e) { if (!(e instanceof DomainError)) throw e; }
  }
  return n;
}

/** Release buyer holds (reversible rails) whose chargeback window has passed. */
export async function releaseExpiredHolds(ctx: Ctx) {
  const rows = await ctx.db.select().from(orders).where(and(eq(orders.status, 'COMPLETED'), lt(orders.holdUntil, ctx.now()))).limit(500);
  for (const o of rows) {
    const buyerGets = o.cryptoAmount - (o.feePayer === 'buyer' ? o.feeAmount : 0n);
    await runTx(ctx, (t) => postTx(t.tx, { type: 'hold_release', refType: 'order', refId: o.id, idempotencyKey: `order:${o.id}:hold_release`, postings: [
      { account: userAcct(o.buyerId, o.asset, 'hold'), amount: -buyerGets }, { account: userAcct(o.buyerId, o.asset), amount: buyerGets },
    ] }).catch((e) => { if (!(e instanceof DomainError)) throw e; }));
  }
}

// ---------------------------------------------------------------- reads
export async function getOrderFor(ctx: Ctx, userId: string, orderId: string) {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId));
  if (!o || (o.buyerId !== userId && o.sellerId !== userId)) throw new DomainError('NOT_FOUND', 'order not found');
  return o;
}

export async function presentOrder(ctx: Ctx, o: Order, viewerId: string) {
  const fd = await fiatDecimals(ctx.db, o.fiat);
  const dec = assetDecimals(o.asset as Asset);
  const events = await ctx.db.select().from(orderEvents).where(eq(orderEvents.orderId, o.id)).orderBy(orderEvents.id);
  const role = o.buyerId === viewerId ? 'buyer' : 'seller';
  // Payee details are shown to the buyer only while payment is due.
  let payee: unknown;
  if (o.paymentMethodId && ['AWAITING_PAYMENT', 'PAID', 'DISPUTED'].includes(o.status)) {
    const [pm] = await ctx.db.select().from(paymentMethods).where(eq(paymentMethods.id, o.paymentMethodId));
    if (pm) payee = { type: pm.type, holderName: pm.holderName, details: decryptJson(pm.detailsEnc) };
  }
  const [cp] = await ctx.db.select({ id: users.id, displayName: users.displayName, kycTier: users.kycTier }).from(users).where(eq(users.id, role === 'buyer' ? o.sellerId : o.buyerId));
  const trading = await getConfig(ctx.db, 'trading');
  return {
    id: o.id, adId: o.adId, role, status: o.status, asset: o.asset, fiat: o.fiat,
    cryptoAmount: fromMinor(o.cryptoAmount, dec), fiatAmount: fromMinor(o.fiatAmount, fd), price: formatPrice(o.price, fd),
    fee: fromMinor(o.feeAmount, dec), feePayer: o.feePayer, referenceCode: o.referenceCode, paymentType: o.paymentType,
    payee: role === 'buyer' || o.sellerId === viewerId ? payee : undefined, counterparty: cp,
    expiresAt: o.expiresAt, paidAt: o.paidAt, releasedAt: o.releasedAt, cancelledAt: o.cancelledAt,
    disputeAvailableAt: o.paidAt ? new Date(o.paidAt.getTime() + trading.appealWaitMin * 60_000) : null,
    autoConfirmed: o.autoConfirmed, manualConfirmRequired: o.manualConfirmRequired, holdUntil: o.holdUntil, corridorId: o.corridorId,
    events: events.map((e) => ({ from: e.fromStatus, to: e.toStatus, event: e.event, actor: e.actor, at: e.createdAt })), createdAt: o.createdAt,
  };
}

export async function listMyOrders(ctx: Ctx, userId: string, status?: string[]) {
  const conds = [or(eq(orders.buyerId, userId), eq(orders.sellerId, userId))];
  if (status?.length) conds.push(inArray(orders.status, status));
  const rows = await ctx.db.select().from(orders).where(and(...conds)).orderBy(desc(orders.createdAt)).limit(100);
  return Promise.all(rows.map((o) => presentOrder(ctx, o, userId)));
}
