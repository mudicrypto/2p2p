import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startApp, makeUser, idem, uniq, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => { t = await startApp(); });
afterAll(async () => { await t.close(); });

describe('M1 auth API', () => {
  it('signup -> verify -> 2FA -> login', async () => {
    const u = await makeUser(t);
    const me = await t.http.get('/v1/auth/me').set(u.auth).expect(200);
    expect(me.body.user).toMatchObject({ id: u.id, emailVerified: true, totpEnabled: true, kycTier: 0 });
    await t.http.post('/v1/auth/login').send({ email: u.email, password: 'correct horse battery' }).expect(401).expect((r) => expect(r.body.error).toBe('TWO_FA_REQUIRED'));
  });

  it('requires an Idempotency-Key and replays results', async () => {
    const email = `${uniq()}@example.com`;
    await t.http.post('/v1/auth/signup').send({ email, password: 'longpassword', country: 'DE' }).expect(400);
    const h = idem();
    const a = await t.http.post('/v1/auth/signup').set(h).send({ email, password: 'longpassword', country: 'DE' }).expect(201);
    const b = await t.http.post('/v1/auth/signup').set(h).send({ email, password: 'longpassword', country: 'DE' }).expect(201);
    expect(b.headers['idempotent-replayed']).toBe('true');
    expect(b.body.user.id).toBe(a.body.user.id);
    await t.http.post('/v1/auth/signup').set(h).send({ email: 'other@x.io', password: 'longpassword', country: 'DE' }).expect(422);
  });

  it('cookie sessions need CSRF on mutations', async () => {
    const email = `${uniq()}@example.com`;
    const s = await t.http.post('/v1/auth/signup').set(idem()).send({ email, password: 'longpassword', country: 'DE' });
    await t.http.post('/v1/auth/verify-email').set(idem()).send({ token: s.body.devEmailToken });
    const l = await t.http.post('/v1/auth/login').send({ email, password: 'longpassword' }).expect(200);
    const cookies = l.headers['set-cookie'] as unknown as string[];
    expect(cookies.find((c) => c.startsWith('sid='))).toMatch(/HttpOnly/);
    await t.http.post('/v1/auth/2fa/setup').set('Cookie', cookies).set(idem()).expect(403);
    await t.http.post('/v1/auth/2fa/setup').set('Cookie', cookies).set('X-CSRF-Token', l.body.csrf).set(idem()).expect(201);
  });

  it('openapi is generated', async () => {
    const r = await t.http.get('/v1/openapi.json').expect(200);
    expect(r.body.paths['/v1/auth/signup'].post).toBeTruthy();
    expect(r.body.components.schemas.SignupEmail).toBeTruthy();
  });
});
