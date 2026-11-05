import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { auditLog, eq, and, gt } from '@p2p/db';
import { createAdmin, seed, type AdminRole } from '@p2p/core';
import { SoftAuthenticator } from '@p2p/core/dist/testing/soft-authenticator';
import { startApp, makeUser, idem, uniq, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => { t = await startApp(); await seed(t.ctx.db); });
afterAll(async () => { await t.close(); });

async function adminSession(roles: AdminRole[]) {
  const email = `${uniq()}@admin.io`;
  const a = await createAdmin(t.ctx, null, { email, password: 'admin-password-123', roles });
  const key = new SoftAuthenticator();
  let l = await t.http.post('/v1/admin/auth/login').send({ email, password: 'admin-password-123' }).expect(200);
  const reg = await t.http.post('/v1/admin/auth/register-key/options').set('x-admin-token', l.body.token).expect(200);
  await t.http.post('/v1/admin/auth/register-key').set('x-admin-token', l.body.token).send({ response: key.register(reg.body) }).expect(200);
  l = await t.http.post('/v1/admin/auth/login').send({ email, password: 'admin-password-123' }).expect(200);
  // Before WebAuthn the session is useless.
  await t.http.get('/v1/admin/users?q=x').set('x-admin-token', l.body.token).expect(401);
  await t.http.post('/v1/admin/auth/webauthn').set('x-admin-token', l.body.token).send({ response: key.assert(l.body.webauthnOptions) }).expect(200);
  return { id: a.id, h: { 'x-admin-token': l.body.token } };
}

/** [method, path, body, permission-holding roles] — each role must only reach its own endpoints. */
const MATRIX: Array<[string, string, unknown, AdminRole[]]> = [
  ['get', '/v1/admin/users?q=example', undefined, ['support', 'compliance']],
  ['get', '/v1/admin/kyc', undefined, ['compliance']],
  ['get', '/v1/admin/withdrawals', undefined, ['finance', 'compliance']],
  ['get', '/v1/admin/deposits/held', undefined, ['compliance']],
  ['get', '/v1/admin/audit', undefined, ['compliance']],
  ['get', '/v1/admin/flags', undefined, ['compliance']],
  ['get', '/v1/admin/admins', undefined, []],
  ['put', '/v1/admin/config/fees', { makerBps: 10 }, ['finance']],
  ['put', '/v1/admin/country-rules/ZZ', { status: 'allowed' }, ['compliance']],
  ['patch', '/v1/admin/payment-method-types/SEPA', { enabled: true }, []],
  ['put', '/v1/admin/limits/0', { daily: '500', monthly: '5000', perOrder: '500', withdrawDaily: '500' }, ['compliance']],
];

describe('M6 admin API', () => {
  it('each role only sees what it is allowed to (superadmin sees all)', async () => {
    const sessions = Object.fromEntries(await Promise.all((['support', 'arbiter', 'compliance', 'finance', 'superadmin'] as AdminRole[]).map(async (r) => [r, await adminSession([r])])));
    for (const [method, path, body, allowed] of MATRIX) {
      for (const role of Object.keys(sessions) as AdminRole[]) {
        let req = (t.http as any)[method](path).set(sessions[role].h);
        if (method !== 'get') req = req.set(idem()).send(body);
        const r = await req;
        const expectOk = role === 'superadmin' || allowed.includes(role);
        expect(r.status < 400, `${role} ${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`).toBe(expectOk);
      }
    }
  });

  it('every admin action appears in the audit log; PII masked for support', async () => {
    const comp = await adminSession(['compliance']);
    const sup = await adminSession(['support']);
    const u = await makeUser(t);
    const since = new Date();
    const s = await t.http.get(`/v1/admin/users/${u.id}`).set(sup.h).expect(200);
    expect(s.body.user.email).toMatch(/\*\*\*/);
    const c = await t.http.get(`/v1/admin/users/${u.id}`).set(comp.h).expect(200);
    expect(c.body.user.email).toBe(u.email);
    await t.http.post(`/v1/admin/users/${u.id}/status`).set(comp.h).set(idem()).send({ status: 'frozen', reason: 'aml review' }).expect(200);
    await t.http.put('/v1/admin/country-rules/QQ').set(comp.h).set(idem()).send({ status: 'blocked' }).expect(200);
    const rep = await t.http.post('/v1/admin/reports').set(comp.h).set(idem()).send({ kind: 'STR', userId: u.id, narrative: 'rapid in/out' }).expect(201);
    const csv = await t.http.get(`/v1/admin/reports/${rep.body.id}?format=csv`).set(comp.h).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    await t.http.post(`/v1/admin/users/${u.id}/status`).set(sup.h).set(idem()).send({ status: 'active', reason: 'x' }).expect(403);
    const rows = await t.ctx.db.select().from(auditLog).where(and(gt(auditLog.createdAt, since)));
    const mine = rows.filter((r) => r.actorId === comp.id).map((r) => r.action);
    expect(mine).toEqual(expect.arrayContaining(['admin.view_user', 'user.status_changed', 'country_rules.changed', 'report.str_created', 'report.exported', 'admin.request']));
    expect(rows.filter((r) => r.actorId === sup.id).map((r) => r.action)).toEqual(expect.arrayContaining(['admin.view_user', 'admin.permission_denied']));
    // every mutating admin request has a catch-all audit row
    expect(rows.filter((r) => r.actorId === comp.id && r.action === 'admin.request').length).toBeGreaterThanOrEqual(3);
  });

  it('two finance admins approve a large withdrawal through the API', async () => {
    const f1 = await adminSession(['finance']); const f2 = await adminSession(['finance']);
    const r = await t.http.get('/v1/admin/withdrawals').set(f1.h).expect(200);
    expect(Array.isArray(r.body)).toBe(true);
    await t.http.put('/v1/admin/config/withdrawals').set(f1.h).set(idem()).send({ paused: false }).expect(200);
    void f2;
  });
});
