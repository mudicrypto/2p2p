import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminUsers } from '@p2p/db';
import { seed, reviewMerchant } from '@p2p/core';
import { MerchantClient, AutoPricer, MerchantApiError } from '@p2p/merchant-sdk';
import { startApp, makeUser, idem, totp, uniq, type TestApp, type TestUser } from './helpers';

let t: TestApp;
let apiUrl: string;
beforeAll(async () => {
  t = await startApp();
  await seed(t.ctx.db);
  await t.app.listen(0, '127.0.0.1');
  apiUrl = `http://127.0.0.1:${(t.app.getHttpServer().address() as { port: number }).port}`;
});
afterAll(async () => { await t.close(); });

const post = (u: TestUser, p: string, b: unknown = {}) => t.http.post(p).set(u.auth).set(idem()).send(b as object);
const bal = async (u: TestUser) => (await t.http.get('/v1/me/balances').set(u.auth)).body.USDT;
async function sepa(u: TestUser) { return (await post(u, '/v1/payment-methods', { type: 'SEPA', holderName: 'Holder Name', details: { iban: 'DE89370400440532013000' } }).expect(201)).body.id as string; }
const adBody = (side: 'buy' | 'sell', price: string, pm: string, total = '1000') => ({ side, asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price, minAmount: '10', maxAmount: '5000', totalAmount: total, paymentMethodIds: [pm] });

describe('M13 merchant bot via HMAC API', () => {
  it('a test merchant bot runs ads and completes trades through the API alone', async () => {
    // ---- onboarding (session API + compliance review)
    const m = await makeUser(t);
    await post(m, '/v1/dev/tier', { tier: 3 });
    await post(m, '/v1/dev/faucet', { asset: 'USDT', amount: '20000' });
    await post(m, '/v1/merchant-program/apply', { businessName: 'Bot Trading GmbH', country: 'DE', expectedMonthlyVolumeUsd: 500000 }).expect(201);
    await post(m, '/v1/merchant-program/deposit', { asset: 'USDT', amount: '6000', totp: totp(m) }).expect(201);
    const [admin] = await t.ctx.db.insert(adminUsers).values({ email: `${uniq()}@admin.io`, passwordHash: 'x', roles: ['compliance'] }).returning();
    await reviewMerchant(t.ctx, admin.id, m.id, { approve: true, note: 'video KYC + deposit ok' });
    const st = await t.http.get('/v1/merchant-program/status').set(m.auth).expect(200);
    expect(st.body).toMatchObject({ status: 'approved', level: 1, verifiedBadge: true, deposit: '6000' });
    const pmM = await sepa(m);
    const key = (await post(m, '/v1/merchant-program/api-keys', { scopes: ['ads:read', 'ads:write', 'orders:read', 'orders:write', 'orders:release'], totp: totp(m) }).expect(201)).body;
    const bot = new MerchantClient({ apiUrl, keyId: key.keyId, secret: key.secret });

    // unsigned / wrongly signed requests are refused
    await t.http.get('/v1/merchant/ads').expect(401);
    await expect(new MerchantClient({ apiUrl, keyId: key.keyId, secret: 'nope', retries: 0 }).ads()).rejects.toBeInstanceOf(MerchantApiError);

    // ---- bot creates ads in bulk
    const created = await bot.bulkCreate([adBody('sell', '0.99', pmM), adBody('buy', '0.90', pmM), { ...adBody('sell', '1', pmM), fiat: 'XXX' }]);
    expect(created.results.map((r) => r.ok)).toEqual([true, true, false]);
    const sellAd = created.results[0].ad!; const buyAd = created.results[1].ad!;

    // ---- competitor liquidity, then the auto-pricer reacts
    const c = await makeUser(t);
    await post(c, '/v1/dev/tier', { tier: 1 });
    await post(c, '/v1/dev/faucet', { asset: 'USDT', amount: '1000' });
    const pmC = await sepa(c);
    await post(c, '/v1/ads', adBody('sell', '0.95', pmC, '500')).expect(201);
    await post(c, '/v1/ads', adBody('buy', '0.92', pmC, '500')).expect(201);
    const repriced = await new AutoPricer(bot, { stepBps: 10, floorBps: -500, ceilBps: 500, reference: async () => '0.93' }).runOnce();
    expect(Object.fromEntries(repriced.map((r) => [r.adId, r.to]))).toEqual({ [sellAd.id]: '0.9491', [buyAd.id]: '0.9209' });
    const after = await bot.ads();
    expect(after.find((a) => a.id === sellAd.id)!.price).toBe('0.9491');
    expect(await new AutoPricer(bot, { stepBps: 10, floorBps: -500, ceilBps: 500, reference: async () => '0.93' }).runOnce()).toEqual([]); // stable

    // ---- a user buys from the merchant's sell ad; the bot releases via API only
    const buyer = await makeUser(t);
    await post(buyer, '/v1/dev/tier', { tier: 1 });
    const o1 = (await post(buyer, '/v1/orders', { adId: sellAd.id, cryptoAmount: '100' }).expect(201)).body;
    expect(o1.fee).toBe('0.08'); // level-1 merchant maker fee: 8 bps instead of 10
    await post(buyer, `/v1/orders/${o1.id}/paid`).expect(200);
    const paid = await bot.orders(['PAID']);
    expect(paid.map((o) => o.id)).toContain(o1.id);
    expect((await bot.release(o1.id)).status).toBe('COMPLETED');
    expect((await bal(buyer)).available).toBe('100');

    // ---- a user sells into the merchant's buy ad; the bot marks paid
    const seller = await makeUser(t);
    await post(seller, '/v1/dev/tier', { tier: 1 });
    await post(seller, '/v1/dev/faucet', { asset: 'USDT', amount: '50' });
    const pmS = await sepa(seller);
    const o2 = (await post(seller, '/v1/orders', { adId: buyAd.id, cryptoAmount: '50', paymentMethodId: pmS }).expect(201)).body;
    const todo = (await bot.orders(['AWAITING_PAYMENT'])).filter((o) => o.role === 'buyer');
    expect(todo.map((o) => o.id)).toContain(o2.id);
    expect((await bot.markPaid(o2.id)).status).toBe('PAID');
    await post(seller, `/v1/orders/${o2.id}/release`, { totp: totp(seller) }).expect(200);
    expect((await bot.order(o2.id)).status).toBe('COMPLETED');

    // merchant: 20000 - 6000 deposit - 100.08 sold + 49.96 bought (50 - 0.04 fee)
    expect(await bal(m)).toMatchObject({ available: '13949.88', escrow: '0', security_deposit: '6000' });
  });

  it('scopes are enforced (fail closed)', async () => {
    const m = await makeUser(t);
    await post(m, '/v1/dev/tier', { tier: 3 });
    await post(m, '/v1/dev/faucet', { asset: 'USDT', amount: '6000' });
    await post(m, '/v1/merchant-program/apply', { businessName: 'Read Only Ltd', country: 'DE', expectedMonthlyVolumeUsd: 1 }).expect(201);
    await post(m, '/v1/merchant-program/deposit', { asset: 'USDT', amount: '6000', totp: totp(m) }).expect(201);
    const [admin] = await t.ctx.db.insert(adminUsers).values({ email: `${uniq()}@admin.io`, passwordHash: 'x', roles: ['compliance'] }).returning();
    await reviewMerchant(t.ctx, admin.id, m.id, { approve: true, note: 'ok' });
    const key = (await post(m, '/v1/merchant-program/api-keys', { scopes: ['ads:read'], totp: totp(m) }).expect(201)).body;
    const bot = new MerchantClient({ apiUrl, keyId: key.keyId, secret: key.secret, retries: 0 });
    expect(Array.isArray(await bot.ads())).toBe(true);
    await expect(bot.orders()).rejects.toMatchObject({ status: 403 });
    await post(m, `/v1/merchant-program/api-keys/${key.keyId}/revoke`).expect(200);
    await expect(bot.ads()).rejects.toMatchObject({ status: 401 });
  });
});
