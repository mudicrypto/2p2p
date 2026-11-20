import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { seed } from '@p2p/core';
import { startApp, makeUser, idem, totp, type TestApp, type TestUser } from './helpers';

let t: TestApp;
beforeAll(async () => { t = await startApp(); await seed(t.ctx.db); });
afterAll(async () => { await t.close(); });

const post = (u: TestUser, path: string, body: unknown = {}) => t.http.post(path).set(u.auth).set(idem()).send(body as object);
async function addSepa(u: TestUser) {
  const r = await post(u, '/v1/payment-methods', { type: 'SEPA', holderName: 'Max Mustermann', details: { iban: 'DE89370400440532013000' } }).expect(201);
  return r.body.id as string;
}

describe('M2 E2E (API, mocks)', () => {
  it('BUY: taker buys USDT for EUR from a sell ad', async () => {
    const maker = await makeUser(t); const buyer = await makeUser(t);
    await post(maker, '/v1/dev/tier', { tier: 1 }).expect(201);
    await post(maker, '/v1/dev/faucet', { asset: 'USDT', amount: '1000' }).expect(201);
    const pm = await addSepa(maker);
    const ad = await post(maker, '/v1/ads', { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '0.95', minAmount: '10', maxAmount: '500', totalAmount: '600', paymentMethodIds: [pm] }).expect(201);
    const book = await t.http.get('/v1/ads').query({ side: 'buy', asset: 'USDT', fiat: 'EUR', amount: '95' }).expect(200);
    expect(book.body.items.map((i: any) => i.id)).toContain(ad.body.id);

    const order = await post(buyer, '/v1/orders', { adId: ad.body.id, fiatAmount: '95' }).expect(201);
    expect(order.body).toMatchObject({ status: 'AWAITING_PAYMENT', role: 'buyer', cryptoAmount: '100', fiatAmount: '95', fee: '0.1' });
    expect(order.body.payee).toMatchObject({ type: 'SEPA', details: { iban: 'DE89370400440532013000' } });
    const id = order.body.id;
    await post(buyer, `/v1/orders/${id}/paid`).expect(200);
    await post(buyer, `/v1/orders/${id}/cancel`).expect(409);
    await post(maker, `/v1/orders/${id}/release`, { totp: '000000' }).expect(401);
    const done = await post(maker, `/v1/orders/${id}/release`, { totp: totp(maker) }).expect(200);
    expect(done.body.status).toBe('COMPLETED');
    expect((await t.http.get('/v1/me/balances').set(buyer.auth)).body.USDT.available).toBe('100');
    expect((await t.http.get('/v1/me/balances').set(maker.auth)).body.USDT).toMatchObject({ available: '899.9', escrow: '0' });
  });

  it('SELL: taker sells USDT into a buy ad', async () => {
    const maker = await makeUser(t); const seller = await makeUser(t);
    await post(maker, '/v1/dev/tier', { tier: 1 });
    const pmM = await addSepa(maker);
    const ad = await post(maker, '/v1/ads', { side: 'buy', asset: 'USDT', fiat: 'EUR', priceType: 'floating', marginBps: -30, minAmount: '5', maxAmount: '1000', totalAmount: '1000', paymentMethodIds: [pmM] }).expect(201);
    await post(seller, '/v1/dev/faucet', { asset: 'USDT', amount: '50' });
    const pmS = await addSepa(seller);
    const order = await post(seller, '/v1/orders', { adId: ad.body.id, cryptoAmount: '50', paymentMethodId: pmS }).expect(201);
    expect(order.body.role).toBe('seller');
    await post(maker, `/v1/orders/${order.body.id}/paid`).expect(200);
    await post(seller, `/v1/orders/${order.body.id}/release`, { totp: totp(seller) }).expect(200);
    expect((await t.http.get('/v1/me/balances').set(maker.auth)).body.USDT.available).toBe('49.95');
  });

  it('idempotent order creation: retry returns the same order and locks escrow once', async () => {
    const maker = await makeUser(t); const buyer = await makeUser(t);
    await post(maker, '/v1/dev/tier', { tier: 1 });
    await post(maker, '/v1/dev/faucet', { asset: 'USDT', amount: '200' });
    const pm = await addSepa(maker);
    const ad = await post(maker, '/v1/ads', { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '1', minAmount: '10', maxAmount: '200', totalAmount: '200', paymentMethodIds: [pm] }).expect(201);
    const h = idem();
    const [a, b] = await Promise.all([
      t.http.post('/v1/orders').set(buyer.auth).set(h).send({ adId: ad.body.id, fiatAmount: '100' }),
      t.http.post('/v1/orders').set(buyer.auth).set(h).send({ adId: ad.body.id, fiatAmount: '100' }),
    ]);
    const okOnes = [a, b].filter((r) => r.status === 201);
    expect(okOnes.length).toBeGreaterThanOrEqual(1);
    const c = await t.http.post('/v1/orders').set(buyer.auth).set(h).send({ adId: ad.body.id, fiatAmount: '100' }).expect(201);
    expect(c.body.id).toBe(okOnes[0].body.id);
    expect((await t.http.get('/v1/me/balances').set(maker.auth)).body.USDT.escrow).toBe('100.1');
  });
});
