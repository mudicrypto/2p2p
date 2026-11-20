import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { seed, decideDispute, runTriage } from '@p2p/core';
import { adminUsers, orders, eq } from '@p2p/db';
import { startApp, makeUser, idem, totp, uniq, type TestApp, type TestUser } from './helpers';

let t: TestApp;
let adminId: string;
beforeAll(async () => {
  t = await startApp();
  await seed(t.ctx.db);
  adminId = (await t.ctx.db.insert(adminUsers).values({ email: `${uniq()}@arb.io`, passwordHash: 'x', roles: ['arbiter'] }).returning())[0].id;
});
afterAll(async () => { await t.close(); });

const post = (u: TestUser, path: string, body: unknown = {}) => t.http.post(path).set(u.auth).set(idem()).send(body as object);
const PNG_B64 = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64');
const bal = async (u: TestUser) => (await t.http.get('/v1/me/balances').set(u.auth)).body.USDT ?? {};

async function paidOrder() {
  const seller = await makeUser(t); const buyer = await makeUser(t);
  await post(seller, '/v1/dev/tier', { tier: 1 });
  await post(seller, '/v1/dev/faucet', { asset: 'USDT', amount: '1000' });
  const pm = (await post(seller, '/v1/payment-methods', { type: 'SEPA', holderName: 'Seller', details: { iban: 'DE89370400440532013000' } }).expect(201)).body.id;
  const ad = await post(seller, '/v1/ads', { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '1', minAmount: '10', maxAmount: '500', totalAmount: '500', paymentMethodIds: [pm] }).expect(201);
  const o = await post(buyer, '/v1/orders', { adId: ad.body.id, fiatAmount: '100' }).expect(201);
  await post(buyer, `/v1/orders/${o.body.id}/paid`).expect(200);
  return { seller, buyer, orderId: o.body.id as string };
}
async function upload(u: TestUser, orderId: string) {
  return (await post(u, `/v1/orders/${orderId}/attachments`, { contentType: 'image/png', dataBase64: PNG_B64 }).expect(201)).body.key as string;
}
async function dispute(decision: 'release' | 'refund' | 'split', splitBuyerBps?: number) {
  const p = await paidOrder();
  const key = await upload(p.buyer, p.orderId);
  await post(p.buyer, `/v1/orders/${p.orderId}/dispute`, { reason: 'not_released', note: 'paid, see receipt', evidenceKeys: [key] }).expect(403); // appeal wait (COOLDOWN)
  await t.ctx.db.update(orders).set({ paidAt: new Date(Date.now() - 11 * 60_000) }).where(eq(orders.id, p.orderId));
  await post(p.buyer, `/v1/orders/${p.orderId}/dispute`, { reason: 'not_released', note: 'paid', evidenceKeys: [] }).expect(400);
  const d = await post(p.buyer, `/v1/orders/${p.orderId}/dispute`, { reason: 'not_released', note: 'paid, see receipt', evidenceKeys: [key] }).expect(201);
  expect(d.body.status).toBe('open');
  expect(d.body).not.toHaveProperty('aiRecommendation');
  const k2 = await upload(p.seller, p.orderId);
  await post(p.seller, `/v1/disputes/${d.body.id}/evidence`, { fileKey: k2, note: 'nothing arrived' }).expect(201);
  expect((await t.http.get(`/v1/orders/${p.orderId}`).set(p.buyer.auth)).body.status).toBe('DISPUTED');
  await runTriage(t.ctx, d.body.id);
  await decideDispute(t.ctx, adminId, d.body.id, { decision, splitBuyerBps, note: `arbiter: ${decision}` });
  const view = (await t.http.get(`/v1/orders/${p.orderId}/dispute`).set(p.seller.auth).expect(200)).body;
  expect(view).toMatchObject({ status: 'resolved', decision, decisionNote: `arbiter: ${decision}` });
  return p;
}

describe('M7 disputes API E2E', () => {
  it('release decision', async () => {
    const p = await dispute('release');
    expect((await bal(p.buyer)).available).toBe('100');
    expect(await bal(p.seller)).toMatchObject({ available: '899.9', escrow: '0' });
    expect((await t.http.get(`/v1/orders/${p.orderId}`).set(p.buyer.auth)).body.status).toBe('COMPLETED');
  });
  it('refund decision', async () => {
    const p = await dispute('refund');
    expect((await bal(p.buyer)).available ?? '0').toBe('0');
    expect(await bal(p.seller)).toMatchObject({ available: '1000', escrow: '0' });
  });
  it('split decision (70% to buyer)', async () => {
    const p = await dispute('split', 7000);
    expect((await bal(p.buyer)).available).toBe('70');
    expect(await bal(p.seller)).toMatchObject({ available: '930', escrow: '0' });
  });
  it('freeze report submission (seller of a completed order, once)', async () => {
    const p = await paidOrder();
    await post(p.seller, `/v1/orders/${p.orderId}/release`, { totp: totp(p.seller) }).expect(200);
    const key = await upload(p.seller, p.orderId);
    await post(p.buyer, '/v1/freeze-reports', { orderId: p.orderId, bankLetterKey: key, claimedAmount: '100' }).expect(404);
    const r = await post(p.seller, '/v1/freeze-reports', { orderId: p.orderId, bankLetterKey: key, claimedAmount: '100' }).expect(201);
    expect(r.body).toMatchObject({ status: 'pending', claimedAmount: '100' });
    await post(p.seller, '/v1/freeze-reports', { orderId: p.orderId, bankLetterKey: key, claimedAmount: '100' }).expect(409);
    expect((await t.http.get('/v1/freeze-reports').set(p.seller.auth)).body).toHaveLength(1);
  });
});
