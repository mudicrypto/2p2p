import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { authenticator } from 'otplib';
import { users, orders, eq } from '@p2p/db';
import { toMinor } from '@p2p/shared';
import { makeCtx, mkUser, fund, sepa, sellAd, ensureSeed, refresh } from './helpers';
import {
  createAd, createOrder, markPaid, cancelOrder, releaseOrder, sweepExpiredOrders, orderBook, balanceOf, userAcct, systemAcct,
  checkInvariants, encrypt, totpSetup, totpConfirm, expireOrder, type User,
} from '../src';

const ctx = makeCtx();
beforeAll(() => ensureSeed(ctx));
afterAll(() => ctx.close());

async function with2fa(u: User) {
  const { secret } = await totpSetup(ctx, u.id);
  await totpConfirm(ctx, u.id, authenticator.generate(secret));
  return { user: await refresh(ctx, u), code: () => authenticator.generate(secret) };
}
const usdt = (s: string) => toMinor(s, 6);

describe('M2 trading core', () => {
  it('BUY flow: taker buys USDT from a sell ad; maker pays 0.1% fee from escrow', async () => {
    const { maker, ad } = await sellAd(ctx);
    const buyer = await mkUser(ctx, { tier: 0 });
    const o = await createOrder(ctx, buyer, { adId: ad.id, fiatAmount: '92' });
    expect(o.status).toBe('AWAITING_PAYMENT');
    expect(o.cryptoAmount).toBe(usdt('100'));
    expect(o.feeAmount).toBe(usdt('0.1'));
    expect(o.referenceCode).toMatch(/^P2P[A-Z2-9]{8}$/);
    expect(await balanceOf(ctx.db, userAcct(maker.id, 'USDT', 'escrow'))).toBe(usdt('100.1'));
    await expect(releaseOrder(ctx, maker, o.id, '000000')).rejects.toMatchObject({ code: 'TWO_FA_REQUIRED' });
    const seller = await with2fa(maker);
    await expect(releaseOrder(ctx, seller.user, o.id, seller.code())).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' }); // not paid yet
    await expect(markPaid(ctx, maker, o.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await markPaid(ctx, buyer, o.id);
    await expect(cancelOrder(ctx, buyer, o.id)).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' }); // no cancel after PAID
    const done = await releaseOrder(ctx, seller.user, o.id, seller.code());
    expect(done.status).toBe('COMPLETED');
    expect(await balanceOf(ctx.db, userAcct(buyer.id, 'USDT'))).toBe(usdt('100'));
    expect(await balanceOf(ctx.db, userAcct(maker.id, 'USDT'))).toBe(usdt('100000') - usdt('100.1'));
    expect(await balanceOf(ctx.db, userAcct(maker.id, 'USDT', 'escrow'))).toBe(0n);
    expect((await checkInvariants(ctx.db)).ok).toBe(true);
  });

  it('SELL flow: taker sells into a buy ad; buyer-maker pays the fee', async () => {
    const maker = await mkUser(ctx, { tier: 1 });
    const pmMaker = await sepa(ctx, maker);
    const ad = await createAd(ctx, maker, { side: 'buy', asset: 'USDT', fiat: 'EUR', priceType: 'floating', marginBps: 50, minAmount: '10', maxAmount: '1000', totalAmount: '500', paymentMethodIds: [pmMaker.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0, acceptReversible: false });
    const seller = await mkUser(ctx, { tier: 1 });
    await fund(ctx, seller, 'USDT', '300');
    await expect(createOrder(ctx, seller, { adId: ad.id, cryptoAmount: '200' })).rejects.toMatchObject({ code: 'VALIDATION' }); // needs own pm
    const pm = await sepa(ctx, seller);
    const o = await createOrder(ctx, seller, { adId: ad.id, cryptoAmount: '200', paymentMethodId: pm.id });
    expect(o.feePayer).toBe('buyer');
    expect(o.buyerId).toBe(maker.id);
    expect(await balanceOf(ctx.db, userAcct(seller.id, 'USDT', 'escrow'))).toBe(usdt('200'));
    await markPaid(ctx, maker, o.id);
    const s = await with2fa(seller);
    await releaseOrder(ctx, s.user, o.id, s.code());
    expect(await balanceOf(ctx.db, userAcct(maker.id, 'USDT'))).toBe(usdt('199.8'));
    expect(await balanceOf(ctx.db, userAcct(seller.id, 'USDT'))).toBe(usdt('100'));
  });

  it('cancel and timeout refund escrow and restore the ad', async () => {
    const { maker, ad } = await sellAd(ctx, { total: '1000' });
    const buyer = await mkUser(ctx, { tier: 0 });
    const o1 = await createOrder(ctx, buyer, { adId: ad.id, cryptoAmount: '50' });
    await cancelOrder(ctx, buyer, o1.id);
    const o2 = await createOrder(ctx, buyer, { adId: ad.id, cryptoAmount: '60' });
    await ctx.db.update(orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(orders.id, o2.id));
    expect(await sweepExpiredOrders(ctx)).toBeGreaterThanOrEqual(1);
    const [after] = await ctx.db.select().from(orders).where(eq(orders.id, o2.id));
    expect(after.status).toBe('CANCELLED');
    expect(await balanceOf(ctx.db, userAcct(maker.id, 'USDT', 'escrow'))).toBe(0n);
    const book = await orderBook(ctx, { side: 'buy', asset: 'USDT', fiat: 'EUR', limit: 100 });
    expect(book.items.find((i) => i.id === ad.id)?.remainingAmount).toBe('1000');
  });

  it('order book filters by amount, payment type, tier and sorts by price', async () => {
    const a = await sellAd(ctx, { price: '0.9101' });
    const b = await sellAd(ctx, { price: '0.9001', min: '1000', max: '2000' });
    const book = await orderBook(ctx, { side: 'buy', asset: 'USDT', fiat: 'EUR', limit: 100, amount: '50', paymentType: 'SEPA' });
    const ids = book.items.map((i) => i.id);
    expect(ids).toContain(a.ad.id);
    expect(ids).not.toContain(b.ad.id);
    const prices = book.items.map((i) => Number(i.price));
    expect([...prices].sort((x, y) => x - y)).toEqual(prices);
    expect((await orderBook(ctx, { side: 'buy', asset: 'USDT', fiat: 'EUR', limit: 100, paymentType: 'PIX' })).items).toHaveLength(0);
    expect((await orderBook(ctx, { side: 'buy', asset: 'USDT', fiat: 'EUR', limit: 100, merchantOnly: true })).items).toHaveLength(0);
  });

  it('rules: tier 0 cannot create ads, no self trade, counterparty tier enforced', async () => {
    const u0 = await mkUser(ctx, { tier: 0 });
    const pm = await sepa(ctx, u0);
    await expect(createAd(ctx, u0, { side: 'buy', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '1', minAmount: '1', maxAmount: '2', totalAmount: '1', paymentMethodIds: [pm.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0, acceptReversible: false })).rejects.toMatchObject({ code: 'TIER_REQUIRED' });
    const { maker, ad } = await sellAd(ctx);
    await expect(createOrder(ctx, maker, { adId: ad.id, fiatAmount: '50' })).rejects.toMatchObject({ code: 'SELF_TRADE' });
    await ctx.db.execute(`update ads set min_counterparty_tier = 2 where id = '${ad.id}'` as any);
    await expect(createOrder(ctx, u0, { adId: ad.id, fiatAmount: '50' })).rejects.toMatchObject({ code: 'TIER_REQUIRED' });
  });

  it('concurrent orders on one ad never oversell (no double spend)', async () => {
    const { maker, ad } = await sellAd(ctx, { total: '500', max: '5000' });
    const buyers = await Promise.all(Array.from({ length: 12 }, () => mkUser(ctx, { tier: 1 })));
    const res = await Promise.allSettled(buyers.map((b) => createOrder(ctx, b, { adId: ad.id, cryptoAmount: '100' })));
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(await balanceOf(ctx.db, userAcct(maker.id, 'USDT', 'escrow'))).toBe(usdt('500.5'));
  });

  it('race: concurrent release + cancel + timeout + markPaid on the same order — exactly one outcome', async () => {
    for (let round = 0; round < 8; round++) {
      const { maker, ad } = await sellAd(ctx);
      const s = await with2fa(maker);
      const buyer = await mkUser(ctx, { tier: 1 });
      const o = await createOrder(ctx, buyer, { adId: ad.id, cryptoAmount: '100' });
      if (round % 2) await ctx.db.update(orders).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(orders.id, o.id));
      const ops = [
        () => markPaid(ctx, buyer, o.id), () => cancelOrder(ctx, buyer, o.id), () => expireOrder(ctx, o.id),
        () => releaseOrder(ctx, s.user, o.id, s.code()), () => markPaid(ctx, buyer, o.id).then(() => releaseOrder(ctx, s.user, o.id, s.code())),
      ];
      await Promise.allSettled(ops.map((f) => f()));
      const [fin] = await ctx.db.select().from(orders).where(eq(orders.id, o.id));
      const esc = await balanceOf(ctx.db, userAcct(maker.id, 'USDT', 'escrow'));
      const buyerBal = await balanceOf(ctx.db, userAcct(buyer.id, 'USDT'));
      if (fin.status === 'COMPLETED') { expect(buyerBal).toBe(usdt('100')); expect(esc).toBe(0n); }
      else if (fin.status === 'CANCELLED') { expect(buyerBal).toBe(0n); expect(esc).toBe(0n); }
      else { expect(fin.status).toBe('PAID'); expect(esc).toBe(usdt('100.1')); expect(buyerBal).toBe(0n); }
    }
    expect((await checkInvariants(ctx.db)).ok).toBe(true);
  });
});
