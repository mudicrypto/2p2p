import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { seed } from '@p2p/core';
import { users, orders, eq } from '@p2p/db';
import { startApp, makeUser, idem, type TestApp, type TestUser } from './helpers';

let t: TestApp;
beforeAll(async () => { t = await startApp(); await seed(t.ctx.db); });
afterAll(async () => { await t.close(); });

const post = (u: TestUser, path: string, body: unknown = {}) => t.http.post(path).set(u.auth).set(idem()).send(body as object);

/** makeUser covers email + 2FA; add a verified phone so tier 1 can start. */
async function tier0Ready(): Promise<TestUser> {
  const u = await makeUser(t);
  const phone = `+49${Math.floor(1e9 + Math.random() * 8e9)}`;
  const s = await post(u, '/v1/auth/phone/start', { phone }).expect(201);
  await post(u, '/v1/auth/phone/verify', { phone, code: s.body.devCode }).expect(200);
  // M1 cooldown: new accounts get 25% limits for 48h — age the account so tier defaults apply.
  await t.ctx.db.update(users).set({ createdAt: new Date(Date.now() - 7 * 86400_000) }).where(eq(users.id, u.id));
  return u;
}

async function sellAd() {
  const maker = await makeUser(t);
  await post(maker, '/v1/dev/tier', { tier: 2 });
  await post(maker, '/v1/dev/faucet', { asset: 'USDT', amount: '50000' });
  const pm = await post(maker, '/v1/payment-methods', { type: 'SEPA', holderName: 'Max Mustermann', details: { iban: 'DE89370400440532013000' } }).expect(201);
  const ad = await post(maker, '/v1/ads', { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '1', minAmount: '10', maxAmount: '5000', totalAmount: '20000', paymentMethodIds: [pm.body.id] }).expect(201);
  return { maker, adId: ad.body.id as string };
}

describe('M4 KYC & limits (API)', () => {
  it('tier upgrade via KYC webhook raises limits; over-limit orders are rejected', async () => {
    const { adId } = await sellAd();
    const u = await tier0Ready();
    const lim0 = (await t.http.get('/v1/me/limits').set(u.auth).expect(200)).body;
    expect(lim0).toMatchObject({ tier: 0, daily: '500' });
    await post(u, '/v1/orders', { adId, fiatAmount: '600' }).expect(422).expect((r) => expect(r.body.error).toBe('LIMIT_EXCEEDED'));
    expect(await t.ctx.db.select().from(orders).where(eq(orders.buyerId, u.id))).toHaveLength(0);

    const s = await post(u, '/v1/kyc/start', { level: 1 }).expect(201);
    expect(s.body.providerRef).toBeTruthy();
    const r = await post(u, '/v1/dev/kyc/approve', { providerRef: s.body.providerRef, fullName: 'Max Mustermann' }).expect(200);
    expect(r.body.outcome).toBe('upgraded');
    expect((await t.http.get('/v1/kyc/status').set(u.auth)).body.tier).toBe(1);
    const lim1 = (await t.http.get('/v1/me/limits').set(u.auth).expect(200)).body;
    expect(lim1).toMatchObject({ tier: 1, daily: '10000' });
    await post(u, '/v1/orders', { adId, fiatAmount: '600' }).expect(201);
  });

  it('webhook: signature verified, replay idempotent', async () => {
    const u = await tier0Ready();
    const s = await post(u, '/v1/kyc/start', { level: 1 }).expect(201);
    const wh = t.ctx.providers.mocks!.kyc.simulateReview(s.body.providerRef, { status: 'approved', fullName: 'Erika Musterfrau' });
    const send = (sig: string) => t.http.post('/v1/webhooks/kyc').set('content-type', 'application/json').set('x-mock-signature', sig).send(wh.body);
    await send('bad').expect(401);
    expect((await send(wh.headers['x-mock-signature']).expect(200)).body.outcome).toBe('upgraded');
    expect((await send(wh.headers['x-mock-signature']).expect(200)).body.outcome).toBe('replayed');
  });

  it('sanctions hit on tier upgrade freezes and blocks the upgrade', async () => {
    const u = await tier0Ready();
    const s = await post(u, '/v1/kyc/start', { level: 1 }).expect(201);
    const r = await post(u, '/v1/dev/kyc/approve', { providerRef: s.body.providerRef, fullName: 'Sanctioned Person' }).expect(200);
    expect(r.body.outcome).toBe('sanctions_hit');
    const me = await t.http.get('/v1/auth/me').set(u.auth).expect(200);
    expect(me.body.user).toMatchObject({ kycTier: 0, status: 'frozen' });
  });

  it('level 1 requires tier-0 requirements (phone)', async () => {
    const u = await makeUser(t);
    await post(u, '/v1/kyc/start', { level: 1 }).expect(403);
  });
});
