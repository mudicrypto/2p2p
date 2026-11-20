import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { kycApplications } from '@p2p/db';
import { seed, encrypt } from '@p2p/core';
import { createRailAdapter } from '@p2p/providers';
import { startApp, makeUser, idem, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => { t = await startApp(); await seed(t.ctx.db); });
afterAll(async () => { await t.close(); });

describe('M10 payment webhooks (API)', () => {
  it('SPEI webhook with matching payer name auto-releases the order', async () => {
    process.env.SPEI_WEBHOOK_SECRET = 'sandbox';
    t.ctx.providers.verifiers.set('SPEI', createRailAdapter('SPEI')!);
    const seller = await makeUser(t); const buyer = await makeUser(t);
    await t.http.post('/v1/dev/tier').set(seller.auth).set(idem()).send({ tier: 2 });
    await t.http.post('/v1/dev/faucet').set(seller.auth).set(idem()).send({ asset: 'USDT', amount: '100' });
    await t.ctx.db.insert(kycApplications).values({ userId: buyer.id, provider: 'mock', providerRef: `k-${buyer.id}`, level: 1, status: 'approved', verifiedFullNameEnc: encrypt('Luis Alberto Ramirez'), reviewedAt: new Date() });
    const pm = await t.http.post('/v1/payment-methods').set(seller.auth).set(idem()).send({ type: 'SPEI', holderName: 'Seller', details: { clabe: '012345678901234567' } }).expect(201);
    const ad = await t.http.post('/v1/ads').set(seller.auth).set(idem()).send({ side: 'sell', asset: 'USDT', fiat: 'MXN', priceType: 'fixed', price: '17', minAmount: '10', maxAmount: '5000', totalAmount: '50', paymentMethodIds: [pm.body.id] }).expect(201);
    const o = await t.http.post('/v1/orders').set(buyer.auth).set(idem()).send({ adId: ad.body.id, fiatAmount: '170' }).expect(201);
    const body = JSON.stringify({ claveRastreo: `MBAN${Date.now()}`, monto: 170, nombreOrdenante: 'RAMIREZ LUIS ALBERTO', conceptoPago: `pago ${o.body.referenceCode}` });
    const r = await t.http.post('/v1/webhooks/payments/spei').set('content-type', 'application/json').set('x-signature', createHmac('sha256', 'sandbox').update(body).digest('hex')).send(body).expect(200);
    expect(r.body.outcome).toBe('auto_released');
    expect((await t.http.get(`/v1/orders/${o.body.id}`).set(buyer.auth)).body).toMatchObject({ status: 'COMPLETED', autoConfirmed: true });
    delete process.env.SPEI_WEBHOOK_SECRET;
  });
});
