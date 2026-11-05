import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { orders, corridors, ads, eq } from '@p2p/db';
import { makeCtx, mkUser, fund, ensureSeed } from './helpers';
import { addPaymentMethod, createAd, quoteCorridor, createCorridor, markPaid, releaseOrder, cancelOrder, expireOrder, balanceOf, userAcct, checkInvariants, limitUsageFor, type User } from '../src';

const ctx = makeCtx();
beforeAll(() => ensureSeed(ctx));
afterAll(() => ctx.close());

/** EUR seller (SEPA) and BRL buyer (PIX) liquidity. */
async function market() {
  // Isolation: other suites share this DB; make sure the corridor only sees this test's EUR/BRL liquidity.
  await ctx.db.execute("update ads set status = 'closed' where fiat in ('EUR','BRL') and status = 'active'" as never);
  const eurSeller = await mkUser(ctx, { tier: 2 });
  await fund(ctx, eurSeller, 'USDT', '10000');
  const sepa = await addPaymentMethod(ctx, eurSeller, { type: 'SEPA', holderName: 'Eur Seller', details: { iban: 'DE89370400440532013000' } });
  const adA = await createAd(ctx, eurSeller, { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '0.93', minAmount: '10', maxAmount: '5000', totalAmount: '5000', paymentMethodIds: [sepa.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0, acceptReversible: false });
  const brlBuyer = await mkUser(ctx, { tier: 2 });
  const pixB = await addPaymentMethod(ctx, brlBuyer, { type: 'PIX', holderName: 'Brl Buyer', details: { pixKey: 'buyer@pix' } });
  const adB = await createAd(ctx, brlBuyer, { side: 'buy', asset: 'USDT', fiat: 'BRL', priceType: 'fixed', price: '5.35', minAmount: '10', maxAmount: '50000', totalAmount: '5000', paymentMethodIds: [pixB.id], paymentWindowMin: 20, terms: '', minCounterpartyTier: 0, acceptReversible: false });
  const user = await mkUser(ctx, { tier: 2 });
  const pix = await addPaymentMethod(ctx, user, { type: 'PIX', holderName: 'Corridor User', details: { pixKey: 'me@pix' } });
  return { eurSeller, brlBuyer, user, pix, adA, adB };
}
const get = async (id: string) => (await ctx.db.select().from(orders).where(eq(orders.id, id)))[0];
const cor = async (id: string) => (await ctx.db.select().from(corridors).where(eq(corridors.id, id)))[0];

describe('M11 cross-border corridors', () => {
  it('EUR -> BRL completes; user sees effective vs market rate', async () => {
    const m = await market();
    const q = await quoteCorridor(ctx, m.user, { fromFiat: 'EUR', toFiat: 'BRL', fiatIn: '93', receivePaymentMethodId: m.pix.id });
    expect(q.display).toMatchObject({ youPay: '93', viaUsdt: '100', youReceive: '535' });
    expect(Number(q.display.effectiveRate)).toBeCloseTo(5.7526, 3);
    expect(Number(q.display.marketRate)).toBeGreaterThan(5);
    const c = await createCorridor(ctx, m.user, { fromFiat: 'EUR', toFiat: 'BRL', fiatIn: '93', receivePaymentMethodId: m.pix.id });
    expect((await get(c.buyOrderId)).status).toBe('AWAITING_PAYMENT');
    expect((await get(c.sellOrderId)).status).toBe('CREATED');
    // user pays EUR; EUR seller releases -> USDT flows straight into leg 2 escrow
    await markPaid(ctx, m.user, c.buyOrderId);
    await releaseOrder(ctx, m.eurSeller, c.buyOrderId, undefined, { skip2fa: true });
    expect((await get(c.sellOrderId)).status).toBe('AWAITING_PAYMENT');
    expect(await balanceOf(ctx.db, userAcct(m.user.id, 'USDT'))).toBe(0n);
    expect(await balanceOf(ctx.db, userAcct(m.user.id, 'USDT', 'escrow'))).toBe(100_000_000n);
    // BRL buyer pays user via PIX; user releases
    await markPaid(ctx, m.brlBuyer, c.sellOrderId);
    await releaseOrder(ctx, m.user, c.sellOrderId, undefined, { skip2fa: true });
    expect((await cor(c.corridorId)).status).toBe('completed');
    expect(await balanceOf(ctx.db, userAcct(m.brlBuyer.id, 'USDT'))).toBe(99_900_000n); // 100 - 0.1% maker fee
    expect(await balanceOf(ctx.db, userAcct(m.user.id, 'USDT', 'escrow'))).toBe(0n);
    expect((await checkInvariants(ctx.db)).ok).toBe(true);
  });

  it('leg 1 fails (cancel or timeout) -> both legs roll back cleanly', async () => {
    for (const how of ['cancel', 'timeout'] as const) {
      const m = await market();
      const before = { a: (await ctx.db.select().from(ads).where(eq(ads.id, m.adA.id)))[0].remainingAmount, b: (await ctx.db.select().from(ads).where(eq(ads.id, m.adB.id)))[0].remainingAmount };
      const c = await createCorridor(ctx, m.user, { fromFiat: 'EUR', toFiat: 'BRL', fiatIn: '186', receivePaymentMethodId: m.pix.id });
      if (how === 'cancel') await cancelOrder(ctx, m.user, c.buyOrderId);
      else { await ctx.db.update(orders).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(orders.id, c.buyOrderId)); await expireOrder(ctx, c.buyOrderId); }
      expect((await get(c.buyOrderId)).status).toBe('CANCELLED');
      expect((await get(c.sellOrderId)).status).toBe('CANCELLED');
      expect((await cor(c.corridorId)).status).toBe('rolled_back');
      const after = { a: (await ctx.db.select().from(ads).where(eq(ads.id, m.adA.id)))[0].remainingAmount, b: (await ctx.db.select().from(ads).where(eq(ads.id, m.adB.id)))[0].remainingAmount };
      expect(after).toEqual(before);
      expect(await balanceOf(ctx.db, userAcct(m.eurSeller.id, 'USDT', 'escrow'))).toBe(0n);
      const usage = await limitUsageFor(ctx.db, m.user.id, new Date());
      expect(usage.tradeDay).toBe(0n);
    }
    expect((await checkInvariants(ctx.db)).ok).toBe(true);
  });

  it('leg 2 fails after leg 1 settles -> leg 2 escrow refunds to the user, nothing stranded', async () => {
    const m = await market();
    const c = await createCorridor(ctx, m.user, { fromFiat: 'EUR', toFiat: 'BRL', fiatIn: '93', receivePaymentMethodId: m.pix.id });
    await markPaid(ctx, m.user, c.buyOrderId);
    await releaseOrder(ctx, m.eurSeller, c.buyOrderId, undefined, { skip2fa: true });
    await ctx.db.update(orders).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(orders.id, c.sellOrderId));
    await expireOrder(ctx, c.sellOrderId);
    expect((await get(c.sellOrderId)).status).toBe('CANCELLED');
    expect((await cor(c.corridorId)).status).toBe('rolled_back');
    expect(await balanceOf(ctx.db, userAcct(m.user.id, 'USDT', 'escrow'))).toBe(0n);
    expect(await balanceOf(ctx.db, userAcct(m.user.id, 'USDT'))).toBe(100_000_000n);
    expect((await checkInvariants(ctx.db)).ok).toBe(true);
  });
  void (null as unknown as User);
});
