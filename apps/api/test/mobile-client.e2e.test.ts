import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { seed } from '@p2p/core';
import { createApi } from '../../mobile/src/api';
import { startApp, makeUser, idem, totp, type TestApp } from './helpers';

let t: TestApp; let base = '';
beforeAll(async () => {
  t = await startApp(); await seed(t.ctx.db);
  await t.app.listen(0, '127.0.0.1');
  const addr = t.app.getHttpServer().address();
  base = `http://127.0.0.1:${addr.port}`;
});
afterAll(async () => { await t.close(); });

describe('M12 mobile client — full trade flow (same code the iOS/Android builds run)', () => {
  it('buyer on mobile buys from a seller on mobile; release with 2FA; push token registered', async () => {
    const seller = await makeUser(t); const buyer = await makeUser(t);
    await t.http.post('/v1/dev/tier').set(seller.auth).set(idem()).send({ tier: 1 });
    await t.http.post('/v1/dev/faucet').set(seller.auth).set(idem()).send({ asset: 'USDT', amount: '300' });
    const sApi = createApi(base, () => seller.token, 'seller-device');
    const bApi = createApi(base, () => buyer.token, 'buyer-device');
    const pm = await sApi.call('/payment-methods', { body: { type: 'SEPA', holderName: 'Mobile Seller', details: { iban: 'DE89370400440532013000' } } });
    const ad = await sApi.call('/ads', { body: { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '0.94', minAmount: '10', maxAmount: '200', totalAmount: '200', paymentMethodIds: [pm.id] } });
    await bApi.registerPush('ExponentPushToken[abcDEF123]', 'ios');
    const book = await bApi.book({ side: 'buy', asset: 'USDT', fiat: 'EUR', amount: '94' });
    expect(book.items.map((i) => i.id)).toContain(ad.id);
    const o = await bApi.createOrder(ad.id, '94');
    expect(o.status).toBe('AWAITING_PAYMENT');
    await bApi.markPaid(o.id);
    await expect(sApi.release(o.id, '000000')).rejects.toMatchObject({ code: 'TWO_FA_INVALID' });
    const done = await sApi.release(o.id, totp(seller));
    expect(done.status).toBe('COMPLETED');
    expect((await bApi.balances()).USDT.available).toBe('100');
    const pushes = t.ctx.providers.mocks!.notifier.outbox.filter((m) => m.channel === 'push' && m.to === 'ExponentPushToken[abcDEF123]');
    expect(pushes.map((p) => p.template)).toEqual(expect.arrayContaining(['order_completed']));
  });
});
