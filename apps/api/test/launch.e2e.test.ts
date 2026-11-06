import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdmin, seed } from '@p2p/core';
import { SoftAuthenticator } from '@p2p/core/dist/testing/soft-authenticator';
import { startApp, makeUser, idem, uniq, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => { t = await startApp(); await seed(t.ctx.db); });
afterAll(async () => { await t.close(); });

async function superadmin() {
  const email = `${uniq()}@admin.io`;
  await createAdmin(t.ctx, null, { email, password: 'admin-password-123', roles: ['superadmin'] });
  const key = new SoftAuthenticator();
  let l = await t.http.post('/v1/admin/auth/login').send({ email, password: 'admin-password-123' }).expect(200);
  const reg = await t.http.post('/v1/admin/auth/register-key/options').set('x-admin-token', l.body.token).expect(200);
  await t.http.post('/v1/admin/auth/register-key').set('x-admin-token', l.body.token).send({ response: key.register(reg.body) }).expect(200);
  l = await t.http.post('/v1/admin/auth/login').send({ email, password: 'admin-password-123' }).expect(200);
  await t.http.post('/v1/admin/auth/webauthn').set('x-admin-token', l.body.token).send({ response: key.assert(l.body.webauthnOptions) }).expect(200);
  return { 'x-admin-token': l.body.token };
}

describe('M16 launch controls', () => {
  it('each country can be switched off and on by flag, without a deploy', async () => {
    const admin = await superadmin();
    const seller = await makeUser(t, 'DE');
    const buyer = await makeUser(t, 'PT');
    await t.http.post('/v1/dev/tier').set(seller.auth).set(idem()).send({ tier: 1 });
    await t.http.post('/v1/dev/faucet').set(seller.auth).set(idem()).send({ asset: 'USDT', amount: '100' });
    const pm = await t.http.post('/v1/payment-methods').set(seller.auth).set(idem()).send({ type: 'SEPA', holderName: 'S S', details: { iban: 'DE89370400440532013000' } });
    const ad = await t.http.post('/v1/ads').set(seller.auth).set(idem()).send({ side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '1', minAmount: '5', maxAmount: '50', totalAmount: '100', paymentMethodIds: [pm.body.id] }).expect(201);

    await t.http.put('/v1/admin/country-rules/PT').set(admin).set(idem()).send({ launchEnabled: false }).expect(200);
    const off = await t.http.post('/v1/orders').set(buyer.auth).set(idem()).send({ adId: ad.body.id, fiatAmount: '10' });
    expect(off.status).toBe(451);
    expect((await t.http.get('/v1/countries/PT')).body.allowed).toBe(false);
    await t.http.post('/v1/auth/signup').set(idem()).send({ email: `${uniq()}@x.io`, password: 'longpassword', country: 'PT' }).expect(451);

    await t.http.put('/v1/admin/country-rules/PT').set(admin).set(idem()).send({ launchEnabled: true }).expect(200);
    await t.http.post('/v1/orders').set(buyer.auth).set(idem()).send({ adId: ad.body.id, fiatAmount: '10' }).expect(201);
  });

  it('auditor sign-off is superadmin-only and audited', async () => {
    const admin = await superadmin();
    const r = await t.http.post('/v1/admin/launch/auditor-signoff').set(admin).set(idem()).send({ auditor: 'Example Audit LLP', reportRef: 'AUD-2026-001', liftWithdrawalGate: false }).expect(200);
    expect(r.body.auditGate).toBe(true);
    const a = await t.http.get('/v1/admin/audit?action=launch.').set(admin).expect(200);
    expect(a.body[0].action).toBe('launch.auditor_signoff');
  });
});
