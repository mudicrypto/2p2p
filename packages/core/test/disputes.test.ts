import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminUsers, orders, disputes, users, riskFlags, auditLog, eq, and } from '@p2p/db';
import { toMinor, applyBps } from '@p2p/shared';
import { makeCtx, mkUser, sellAd, ensureSeed, uniq, fund, refresh } from './helpers';
import {
  createOrder, markPaid, releaseOrder, uploadAttachment, openDispute, openDisputeSystem, addEvidence, runTriage, assignDispute, decideDispute,
  escalateOverdueDisputes, arbiterQueue, getDisputeDetail, getDisputeForParticipant, balanceOf, userAcct, systemAcct, checkInvariants,
  submitFreezeReport, reviewFreezeReport, fundInsurance, insuranceBalance, setConfig, publicProfile, type User,
} from '../src';

const ctx = makeCtx();
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
let adminId: string;
beforeAll(async () => {
  await ensureSeed(ctx);
  adminId = (await ctx.db.insert(adminUsers).values({ email: `${uniq()}@arb.io`, passwordHash: 'x', roles: ['arbiter'] }).returning())[0].id;
});
afterAll(() => ctx.close());
const usdt = (s: string) => toMinor(s, 6);

/** A PAID order (100 USDT, maker=seller pays 0.1 fee) whose appeal wait has passed. */
async function paidOrder(opts: { aged?: boolean } = {}) {
  const { maker, ad } = await sellAd(ctx);
  const buyer = await mkUser(ctx, { tier: 1 });
  const o = await createOrder(ctx, buyer, { adId: ad.id, cryptoAmount: '100' });
  await markPaid(ctx, buyer, o.id);
  if (opts.aged !== false) await ctx.db.update(orders).set({ paidAt: new Date(Date.now() - 11 * 60_000) }).where(eq(orders.id, o.id));
  const ev = await uploadAttachment(ctx, buyer, o.id, PNG, 'image/png');
  return { seller: maker, buyer, order: o, evidenceKey: ev.key };
}
async function disputed(by: 'buyer' | 'seller' = 'buyer') {
  const p = await paidOrder();
  const opener = by === 'buyer' ? p.buyer : p.seller;
  const key = by === 'buyer' ? p.evidenceKey : (await uploadAttachment(ctx, p.seller, p.order.id, PNG, 'image/png')).key;
  const d = await openDispute(ctx, opener, p.order.id, { reason: by === 'buyer' ? 'not_released' : 'not_paid', note: 'see receipt', evidenceKeys: [key] });
  return { ...p, dispute: d };
}

describe('M7 disputes', () => {
  it('opening rules: only PAID, after the appeal wait, with evidence from this order', async () => {
    const { maker, ad } = await sellAd(ctx);
    const buyer = await mkUser(ctx, { tier: 1 });
    const o = await createOrder(ctx, buyer, { adId: ad.id, cryptoAmount: '50' });
    const key = (await uploadAttachment(ctx, buyer, o.id, PNG, 'image/png')).key;
    await expect(openDispute(ctx, buyer, o.id, { reason: 'other', note: 'x', evidenceKeys: [key] })).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    await markPaid(ctx, buyer, o.id);
    await expect(openDispute(ctx, buyer, o.id, { reason: 'other', note: 'x', evidenceKeys: [key] })).rejects.toMatchObject({ code: 'COOLDOWN' });
    await ctx.db.update(orders).set({ paidAt: new Date(Date.now() - 11 * 60_000) }).where(eq(orders.id, o.id));
    await expect(openDispute(ctx, buyer, o.id, { reason: 'other', note: 'x', evidenceKeys: [] })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(openDispute(ctx, buyer, o.id, { reason: 'other', note: 'x', evidenceKeys: ['orders/other/abc'] })).rejects.toMatchObject({ code: 'VALIDATION' });
    const stranger = await mkUser(ctx);
    await expect(openDispute(ctx, stranger, o.id, { reason: 'other', note: 'x', evidenceKeys: [key] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const d = await openDispute(ctx, maker, o.id, { reason: 'not_paid', note: 'no money arrived', evidenceKeys: [(await uploadAttachment(ctx, maker, o.id, PNG, 'image/png')).key] });
    expect(d.status).toBe('open');
    expect(d.slaDueAt.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
    const [ord] = await ctx.db.select().from(orders).where(eq(orders.id, o.id));
    expect(ord.status).toBe('DISPUTED');
    await expect(releaseOrder(ctx, maker, o.id, undefined, { skip2fa: true })).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('AI triage stores a recommendation but never decides', async () => {
    const { dispute, order, buyer } = await disputed();
    const out = await runTriage(ctx, dispute.id);
    expect(['release', 'refund', 'split', 'unclear']).toContain(out.recommendation);
    const det = await getDisputeDetail(ctx, dispute.id);
    expect(det.dispute.aiRecommendation).toBe(out.recommendation);
    expect(typeof det.dispute.aiConfidence).toBe('number');
    expect(det.dispute.aiSummary).toBeTruthy();
    expect(det.dispute.status).toBe('open');
    expect(det.order.status).toBe('DISPUTED');
    expect(det.evidence).toHaveLength(1);
    const view = await getDisputeForParticipant(ctx, buyer, order.id);
    expect(view).not.toHaveProperty('aiRecommendation');
    expect(await balanceOf(ctx.db, userAcct(buyer.id, 'USDT'))).toBe(0n);
  });

  it('decision RELEASE: buyer gets crypto, fee charged, seller loses', async () => {
    const { dispute, buyer, seller, order } = await disputed();
    await expect(decideDispute(ctx, adminId, dispute.id, { decision: 'release', note: '' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await assignDispute(ctx, adminId, dispute.id);
    const r = await decideDispute(ctx, adminId, dispute.id, { decision: 'release', note: 'payment verified in bank statement' });
    expect(r.loserId).toBe(seller.id);
    expect(await balanceOf(ctx.db, userAcct(buyer.id, 'USDT'))).toBe(usdt('100'));
    expect(await balanceOf(ctx.db, userAcct(seller.id, 'USDT', 'escrow'))).toBe(0n);
    expect(await balanceOf(ctx.db, userAcct(seller.id, 'USDT'))).toBe(usdt('100000') - usdt('100.1'));
    const [o] = await ctx.db.select().from(orders).where(eq(orders.id, order.id));
    expect(o.status).toBe('COMPLETED');
    await expect(decideDispute(ctx, adminId, dispute.id, { decision: 'refund', note: 'again' })).rejects.toMatchObject({ code: 'CONFLICT' });
    const a = await ctx.db.select().from(auditLog).where(and(eq(auditLog.subjectId, dispute.id), eq(auditLog.action, 'dispute.decided')));
    expect(a).toHaveLength(1);
    expect((await ctx.providers.mocks!.notifier.outbox.filter((m) => m.template === 'dispute_resolved' && m.params.orderId === order.id))).toBeDefined();
    expect((await publicProfile(ctx, seller.id)).disputeRateBps).toBeGreaterThan(0);
  });

  it('decision REFUND: escrow incl. fee returns to seller, buyer loses', async () => {
    const { dispute, buyer, seller } = await disputed('seller');
    const r = await decideDispute(ctx, adminId, dispute.id, { decision: 'refund', note: 'no payment received' });
    expect(r.loserId).toBe(buyer.id);
    expect(await balanceOf(ctx.db, userAcct(seller.id, 'USDT'))).toBe(usdt('100000'));
    expect(await balanceOf(ctx.db, userAcct(seller.id, 'USDT', 'escrow'))).toBe(0n);
    expect(await balanceOf(ctx.db, userAcct(buyer.id, 'USDT'))).toBe(0n);
  });

  it('decision SPLIT 60/40: buyer gets 60% of crypto, seller the rest of escrow, no fee', async () => {
    const { dispute, buyer, seller } = await disputed();
    const feeBefore = await balanceOf(ctx.db, systemAcct('USDT', 'fee'));
    await expect(decideDispute(ctx, adminId, dispute.id, { decision: 'split', splitBuyerBps: 10_000, note: 'x' })).rejects.toMatchObject({ code: 'VALIDATION' });
    const r = await decideDispute(ctx, adminId, dispute.id, { decision: 'split', splitBuyerBps: 6000, note: 'partial payment' });
    expect(r.loserId).toBeNull();
    expect(await balanceOf(ctx.db, userAcct(buyer.id, 'USDT'))).toBe(applyBps(usdt('100'), 6000));
    expect(await balanceOf(ctx.db, userAcct(seller.id, 'USDT'))).toBe(usdt('100000') - usdt('60'));
    expect(await balanceOf(ctx.db, systemAcct('USDT', 'fee'))).toBe(feeBefore);
    expect((await checkInvariants(ctx.db)).ok).toBe(true);
  });

  it('system-opened disputes skip the appeal wait', async () => {
    const p = await paidOrder({ aged: false });
    const d = await openDisputeSystem(ctx, p.order.id, 'third_party_payment', 'payer name mismatch');
    expect(d.openedBy).toBeNull();
    await addEvidence(ctx, p.buyer, d.id, p.evidenceKey, 'my bank receipt');
    expect((await getDisputeDetail(ctx, d.id)).evidence).toHaveLength(1);
  });

  it('SLA escalation and arbiter queue ordering', async () => {
    const a = await disputed();
    const b = await disputed();
    await ctx.db.update(disputes).set({ slaDueAt: new Date(Date.now() - 60_000) }).where(eq(disputes.id, a.dispute.id));
    const q = await arbiterQueue(ctx);
    const ia = q.findIndex((x) => x.id === a.dispute.id);
    const ib = q.findIndex((x) => x.id === b.dispute.id);
    expect(ia).toBeLessThan(ib);
    expect(q[ia].overdue).toBe(true);
    expect(await escalateOverdueDisputes(ctx)).toBeGreaterThanOrEqual(1);
    const [row] = await ctx.db.select().from(disputes).where(eq(disputes.id, a.dispute.id));
    expect(row.status).toBe('escalated');
    expect(ctx.providers.mocks!.notifier.last('dispute_escalated')).toBeTruthy();
  });

  it('repeat offenders are frozen automatically', async () => {
    await setConfig(ctx.db, 'disputes', { autoFreezeLostDisputes: 3 });
    const repeat = await mkUser(ctx, { tier: 1 });
    for (let i = 0; i < 3; i++) {
      const { maker, ad } = await sellAd(ctx);
      const o = await createOrder(ctx, repeat, { adId: ad.id, cryptoAmount: '20' });
      await markPaid(ctx, repeat, o.id);
      await ctx.db.update(orders).set({ paidAt: new Date(Date.now() - 11 * 60_000) }).where(eq(orders.id, o.id));
      const key = (await uploadAttachment(ctx, maker, o.id, PNG, 'image/png')).key;
      const d = await openDispute(ctx, maker, o.id, { reason: 'not_paid', note: 'no payment', evidenceKeys: [key] });
      await decideDispute(ctx, adminId, d.id, { decision: 'refund', note: 'buyer never paid' });
    }
    expect((await refresh(ctx, repeat as User)).status).toBe('frozen');
    expect(await ctx.db.select().from(riskFlags).where(and(eq(riskFlags.subjectId, repeat.id), eq(riskFlags.code, 'REPEAT_DISPUTE_LOSER')))).toHaveLength(1);
  });
});

describe('M7 insurance fund', () => {
  it('fees fund the insurance account; approved freeze report pays out once, capped, ledger balanced', async () => {
    const insBefore = await insuranceBalance(ctx, 'USDT');
    const { maker, ad } = await sellAd(ctx);
    const buyer = await mkUser(ctx, { tier: 1 });
    const o = await createOrder(ctx, buyer, { adId: ad.id, cryptoAmount: '1000' });
    await markPaid(ctx, buyer, o.id);
    await releaseOrder(ctx, maker, o.id, undefined, { skip2fa: true });
    // fee 1 USDT, 10% to insurance
    expect(await insuranceBalance(ctx, 'USDT')).toBe(insBefore + usdt('0.1'));
    await fundInsurance(ctx, adminId, 'USDT', usdt('0.5'), 'k1');
    await fundInsurance(ctx, adminId, 'USDT', usdt('0.5'), 'k1'); // replay
    expect(await insuranceBalance(ctx, 'USDT')).toBe(insBefore + usdt('0.6'));

    const letter = (await uploadAttachment(ctx, maker, o.id, Buffer.from('%PDF-1.4 bank letter'), 'application/pdf')).key;
    await expect(submitFreezeReport(ctx, buyer, { orderId: o.id, bankLetterKey: letter, claimedAmountFiat: 100n })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const fr = await submitFreezeReport(ctx, maker, { orderId: o.id, bankLetterKey: letter, claimedAmountFiat: o.fiatAmount });
    await expect(submitFreezeReport(ctx, maker, { orderId: o.id, bankLetterKey: letter, claimedAmountFiat: 1n })).rejects.toMatchObject({ code: 'CONFLICT' });

    await expect(reviewFreezeReport(ctx, adminId, fr.id, { approve: true, payoutAsset: 'USDT', payoutAmount: usdt('6000'), note: 'too much' })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    const big = insBefore + usdt('1');
    await expect(reviewFreezeReport(ctx, adminId, fr.id, { approve: true, payoutAsset: 'USDT', payoutAmount: big, note: 'over fund' })).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    const sellerBefore = await balanceOf(ctx.db, userAcct(maker.id, 'USDT'));
    const r = await reviewFreezeReport(ctx, adminId, fr.id, { approve: true, payoutAsset: 'USDT', payoutAmount: usdt('0.4'), note: 'bank letter verified' });
    expect(r.status).toBe('paid');
    expect(await balanceOf(ctx.db, userAcct(maker.id, 'USDT'))).toBe(sellerBefore + usdt('0.4'));
    await expect(reviewFreezeReport(ctx, adminId, fr.id, { approve: true, payoutAsset: 'USDT', payoutAmount: usdt('0.4'), note: 'again' })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await balanceOf(ctx.db, userAcct(maker.id, 'USDT'))).toBe(sellerBefore + usdt('0.4'));
    const inv = await checkInvariants(ctx.db);
    expect(inv.ok).toBe(true);
    expect(inv.perAsset.find((p) => p.asset === 'USDT')!.ledgerSum).toBe(0n);
    expect((await publicProfile(ctx, buyer.id)).freezeReports).toBe(1);
  });

  it('rejected freeze reports pay nothing', async () => {
    const { maker, ad } = await sellAd(ctx);
    const buyer = await mkUser(ctx, { tier: 1 });
    await fund(ctx, buyer, 'USDT', '1');
    const o = await createOrder(ctx, buyer, { adId: ad.id, cryptoAmount: '20' });
    await markPaid(ctx, buyer, o.id);
    await releaseOrder(ctx, maker, o.id, undefined, { skip2fa: true });
    const letter = (await uploadAttachment(ctx, maker, o.id, PNG, 'image/png')).key;
    const fr = await submitFreezeReport(ctx, maker, { orderId: o.id, bankLetterKey: letter, claimedAmountFiat: 100n });
    const before = await balanceOf(ctx.db, userAcct(maker.id, 'USDT'));
    expect((await reviewFreezeReport(ctx, adminId, fr.id, { approve: false, note: 'letter unrelated' })).status).toBe('rejected');
    expect(await balanceOf(ctx.db, userAcct(maker.id, 'USDT'))).toBe(before);
  });
});
