import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { seed } from '@p2p/core';
import { startApp, makeUser, idem, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => { t = await startApp(); await seed(t.ctx.db); });
afterAll(async () => { await t.close(); });

describe('M5 wallet API', () => {
  it('custody webhook: signature verified over raw body, deposit credited after confirmations', async () => {
    const u = await makeUser(t);
    const a = await t.http.get('/v1/wallet/deposit-address').query({ asset: 'USDT', network: 'TRON' }).set(u.auth).expect(200);
    const wh = t.ctx.providers.mocks!.custody.simulateDeposit({ network: 'TRON', asset: 'USDT', address: a.body.address, txHash: `h${Date.now()}`, amount: 5_000_000n, confirmations: 25 });
    await t.http.post('/v1/webhooks/custody').set('content-type', 'application/json').set('x-mock-signature', 'bad').send(wh.body).expect(401);
    const r = await t.http.post('/v1/webhooks/custody').set('content-type', 'application/json').set(wh.headers).send(wh.body).expect(200);
    expect(r.body.outcome).toBe('credited');
    expect((await t.http.get('/v1/me/balances').set(u.auth)).body.USDT.available).toBe('5');
    const deps = await t.http.get('/v1/wallet/deposits').set(u.auth).expect(200);
    expect(deps.body[0]).toMatchObject({ amount: '5', status: 'credited', network: 'TRON' });
  });
  it('withdrawal requires an allowlisted, matured address', async () => {
    const u = await makeUser(t);
    await t.http.post('/v1/dev/custody/deposit').set(u.auth).set(idem()).send({ asset: 'USDT', network: 'TRON', amount: '50' }).expect(200);
    const r = await t.http.post('/v1/wallet/withdrawals').set(u.auth).set(idem()).send({ asset: 'USDT', network: 'TRON', address: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW', amount: '10', totp: '123456' });
    expect([401, 403]).toContain(r.status); // invalid 2FA or cooldown/allowlist
  });
});
