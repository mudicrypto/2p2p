import 'reflect-metadata';
import request from 'supertest';
import { authenticator } from 'otplib';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/bootstrap';

process.env.RATE_LIMIT_DISABLED = '1';
export type TestApp = Awaited<ReturnType<typeof createApp>> & { http: ReturnType<typeof request> };

export async function startApp(): Promise<TestApp> {
  const a = await createApp({ databaseUrl: process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/p2p_test', redisUrl: null, logger: false });
  await a.app.init();
  return Object.assign(a, { http: request(a.app.getHttpServer()) });
}
let n = 0;
export const uniq = (p = 'u') => `${p}${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const idem = () => ({ 'Idempotency-Key': randomUUID() });

export interface TestUser { id: string; token: string; email: string; totpSecret: string; auth: Record<string, string> }
/** Sign up + verify + enable 2FA + log in. Returns a bearer-auth user. */
export async function makeUser(t: TestApp, country = 'DE'): Promise<TestUser> {
  const email = `${uniq()}@example.com`;
  const password = 'correct horse battery';
  const s = await t.http.post('/v1/auth/signup').set(idem()).send({ email, password, country }).expect(201);
  await t.http.post('/v1/auth/verify-email').set(idem()).send({ token: s.body.devEmailToken }).expect(200);
  let l = await t.http.post('/v1/auth/login').send({ email, password }).expect(200);
  const auth = { Authorization: `Bearer ${l.body.token}` };
  const setup = await t.http.post('/v1/auth/2fa/setup').set(auth).set(idem()).expect(201);
  await t.http.post('/v1/auth/2fa/confirm').set(auth).set(idem()).send({ code: authenticator.generate(setup.body.secret) }).expect(200);
  l = await t.http.post('/v1/auth/login').send({ email, password, totp: authenticator.generate(setup.body.secret) }).expect(200);
  return { id: l.body.user.id, token: l.body.token, email, totpSecret: setup.body.secret, auth: { Authorization: `Bearer ${l.body.token}` } };
}
export const totp = (u: TestUser) => authenticator.generate(u.totpSecret);
