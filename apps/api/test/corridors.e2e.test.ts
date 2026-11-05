import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { seed } from '@p2p/core';
import { startApp, makeUser, idem, totp, type TestApp, type TestUser } from './helpers';

let t: TestApp;
beforeAll(async () => { t = await startApp(); await seed(t.ctx.db); });
afterAll(async () => { await t.close(); });
const post = (u: TestUser, p: string, b: unknown = {}) => t.http.post(p).set(u.auth).set(idem()).send(b as object);

describe('M11 corridor E2E (API)', () => {
  it('EUR -> BRL one-tap corridor completes end to end', async () => {
    // Isolation: other suites share this DB; the corridor must only see this test's EUR/BRL liquidity.
    await t.ctx.db.execute("update ads set status = 'closed' where fiat in ('EUR','BRL') and status = 'active'" as never);
    const eur = await makeUser(t); const brl = await makeUser(t); const me = await makeUser(t);
    for (const u of [eur, brl, me]) await post(u, '/v1/dev/tier', { tier: 2 }); // new accounts get 25% limits for 48h
    await post(eur, '/v1/dev/faucet', { asset: 'USDT', amount: '1000' });
    const sepa = (await post(eur, '/v1/payment-methods', { type: 'SEPA', holderName: 'E S', details: { iban: 'DE89370400440532013000' } }).expect(201)).body.id;
    await post(eur, '/v1/ads', { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '0.95', minAmount: '10', maxAmount: '900', totalAmount: '900', paymentMethodIds: [sepa] }).expect(201);
    const pixB = (await post(brl, '/v1/payment-methods', { type: 'PIX', holderName: 'B B', details: { pixKey: 'b@pix' } }).expect(201)).body.id;
    await post(brl, '/v1/ads', { side: 'buy', asset: 'USDT', fiat: 'BRL', priceType: 'fixed', price: '5.40', minAmount: '10', maxAmount: '10000', totalAmount: '900', paymentMethodIds: [pixB] }).expect(201);
    const myPix = (await post(me, '/v1/payment-methods', { type: 'PIX', holderName: 'M E', details: { pixKey: 'me@pix' } }).expect(201)).body.id;

    const q = await post(me, '/v1/corridors/quote', { fromFiat: 'EUR', toFiat: 'BRL', fiatIn: '190', receivePaymentMethodId: myPix }).expect(200);
    expect(q.body).toMatchObject({ youPay: '190', viaUsdt: '200', youReceive: '1080' });
    expect(Number(q.body.effectiveRate)).toBeCloseTo(5.684, 2);
    const c = await post(me, '/v1/corridors', { fromFiat: 'EUR', toFiat: 'BRL', fiatIn: '190', receivePaymentMethodId: myPix }).expect(201);
    await post(me, `/v1/orders/${c.body.buyOrderId}/paid`).expect(200);
    await post(eur, `/v1/orders/${c.body.buyOrderId}/release`, { totp: totp(eur) }).expect(200);
    expect((await t.http.get(`/v1/orders/${c.body.sellOrderId}`).set(me.auth)).body.status).toBe('AWAITING_PAYMENT');
    await post(brl, `/v1/orders/${c.body.sellOrderId}/paid`).expect(200);
    await post(me, `/v1/orders/${c.body.sellOrderId}/release`, { totp: totp(me) }).expect(200);
    const final = await t.http.get(`/v1/corridors/${c.body.corridorId}`).set(me.auth).expect(200);
    expect(final.body.status).toBe('completed');
    expect(final.body.legs.every((l: any) => l.status === 'COMPLETED')).toBe(true);
  });
});
