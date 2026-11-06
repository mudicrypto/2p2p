/** Authentication: email/password, phone OTP, Telegram initData, TOTP, passkeys, sessions, devices. */
import argon2 from 'argon2';
import { authenticator } from 'otplib';
import { createHmac } from 'node:crypto';
import {
  users, sessions, devices, verificationTokens, loginEvents, webauthnCredentials, webauthnChallenges, idempotencyKeys,
  and, eq, gt, lt, isNull, sql, desc,
} from '@p2p/db';
import {
  generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { DomainError } from '@p2p/shared';
import type { Ctx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import { encrypt, decrypt, randomToken, sha256, randomDigits, safeEqual } from './crypto';
import { assertCountryAllowed } from './compliance';
import { evaluateDeviceRisk } from './risk';
import { checkSignupVelocity, assertLoginVelocity } from './fraud';

authenticator.options = { window: 1 };

export type User = typeof users.$inferSelect;
export interface ReqMeta { ip?: string; userAgent?: string; fingerprint?: string }
const SESSION_TTL_MS = 7 * 24 * 3600_000;
const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (pw: string) => argon2.hash(pw, ARGON);

export function publicUser(u: User) {
  return {
    id: u.id, email: u.email, emailVerified: !!u.emailVerifiedAt, phone: u.phone, phoneVerified: !!u.phoneVerifiedAt,
    tgId: u.tgId, kycTier: u.kycTier, status: u.status, country: u.country, locale: u.locale, displayName: u.displayName,
    totpEnabled: !!u.totpEnabledAt, isMerchant: u.isMerchant, createdAt: u.createdAt,
  };
}

async function screenAndCreate(ctx: Ctx, values: typeof users.$inferInsert, meta: ReqMeta, action: string) {
  await assertCountryAllowed(ctx.db, values.country);
  const screen = await ctx.providers.personScreen.screenPerson({ email: values.email ?? undefined, country: values.country });
  return runTx(ctx, async (t) => {
    const [u] = await t.tx.insert(users).values({ ...values, sanctionsHit: screen.hit, status: screen.hit ? 'frozen' : 'active' }).returning();
    await audit(t.tx, { actorType: 'user', actorId: u.id, action, subjectType: 'user', subjectId: u.id, after: { country: u.country, sanctionsHit: screen.hit }, ip: meta.ip });
    if (screen.hit) await audit(t.tx, { actorType: 'system', action: 'user.sanctions_hit', subjectType: 'user', subjectId: u.id, after: { lists: screen.lists } });
    await checkSignupVelocity(t.tx, u.id, meta.ip, ctx.now());
    return u;
  });
}

// ---------------------------------------------------------------- email signup / verify
export async function signupEmail(ctx: Ctx, input: { email: string; password: string; country: string; locale?: string }, meta: ReqMeta = {}) {
  const email = input.email.trim().toLowerCase();
  const [exists] = await ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
  if (exists) throw new DomainError('CONFLICT', 'email already registered');
  const u = await screenAndCreate(ctx, { email, passwordHash: await hashPassword(input.password), country: input.country.toUpperCase(), locale: input.locale ?? 'en' }, meta, 'user.signup_email');
  const token = await issueToken(ctx, u.id, 'email_verify', email, 24 * 3600_000, randomToken(24));
  await ctx.providers.notifier.send({ channel: 'email', to: email, template: 'email_verify', params: { link: `${process.env.WEB_ORIGIN ?? ''}/verify-email?token=${token}` } });
  return { user: u, emailToken: token };
}

async function issueToken(ctx: Ctx, userId: string | null, purpose: string, target: string, ttlMs: number, code: string) {
  await ctx.db.insert(verificationTokens).values({ userId, purpose, target, codeHash: sha256(code), expiresAt: new Date(ctx.now().getTime() + ttlMs) });
  return code;
}

async function consumeToken(ctx: Ctx, purpose: string, target: string | null, code: string) {
  const conds = [eq(verificationTokens.purpose, purpose), isNull(verificationTokens.consumedAt), gt(verificationTokens.expiresAt, ctx.now())];
  if (target) conds.push(eq(verificationTokens.target, target));
  else conds.push(eq(verificationTokens.codeHash, sha256(code)));
  const [row] = await ctx.db.select().from(verificationTokens).where(and(...conds)).orderBy(desc(verificationTokens.createdAt)).limit(1);
  if (!row || row.attempts >= 5) throw new DomainError('UNAUTHORIZED', 'invalid or expired code');
  if (!safeEqual(row.codeHash, sha256(code))) {
    await ctx.db.update(verificationTokens).set({ attempts: row.attempts + 1 }).where(eq(verificationTokens.id, row.id));
    throw new DomainError('UNAUTHORIZED', 'invalid or expired code');
  }
  const upd = await ctx.db.update(verificationTokens).set({ consumedAt: ctx.now() }).where(and(eq(verificationTokens.id, row.id), isNull(verificationTokens.consumedAt))).returning();
  if (!upd.length) throw new DomainError('UNAUTHORIZED', 'code already used');
  return row;
}

export async function verifyEmail(ctx: Ctx, token: string) {
  const row = await consumeToken(ctx, 'email_verify', null, token);
  return runTx(ctx, async (t) => {
    const [u] = await t.tx.update(users).set({ emailVerifiedAt: ctx.now() }).where(eq(users.id, row.userId!)).returning();
    await audit(t.tx, { actorType: 'user', actorId: u.id, action: 'user.email_verified', subjectType: 'user', subjectId: u.id });
    return u;
  });
}

// ---------------------------------------------------------------- phone OTP
export async function startPhoneVerification(ctx: Ctx, userId: string, phone: string) {
  const [taken] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
  if (taken && taken.id !== userId) throw new DomainError('CONFLICT', 'phone already in use');
  const recent = await ctx.db.select({ c: sql<number>`count(*)::int` }).from(verificationTokens)
    .where(and(eq(verificationTokens.target, phone), gt(verificationTokens.createdAt, new Date(ctx.now().getTime() - 3600_000))));
  if ((recent[0]?.c ?? 0) >= 5) throw new DomainError('RATE_LIMITED', 'too many codes requested');
  const code = await issueToken(ctx, userId, 'phone_otp', phone, 10 * 60_000, randomDigits(6));
  await ctx.providers.notifier.send({ channel: 'sms', to: phone, template: 'otp', params: { code } });
  return { sent: true, devCode: ctx.providers.mode === 'mock' ? code : undefined };
}
export async function verifyPhone(ctx: Ctx, userId: string, phone: string, code: string) {
  const row = await consumeToken(ctx, 'phone_otp', phone, code);
  if (row.userId !== userId) throw new DomainError('UNAUTHORIZED', 'invalid code');
  return runTx(ctx, async (t) => {
    const [u] = await t.tx.update(users).set({ phone, phoneVerifiedAt: ctx.now() }).where(eq(users.id, userId)).returning();
    await audit(t.tx, { actorType: 'user', actorId: userId, action: 'user.phone_verified', subjectType: 'user', subjectId: userId });
    return u;
  });
}

// ---------------------------------------------------------------- sessions & devices
export async function trackDevice(ctx: Ctx, userId: string, meta: ReqMeta) {
  const fp = meta.fingerprint ?? sha256(`${meta.userAgent ?? ''}|${meta.ip ?? ''}`).slice(0, 32);
  const [d] = await ctx.db.insert(devices).values({ userId, fingerprint: fp, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 512) })
    .onConflictDoUpdate({ target: [devices.userId, devices.fingerprint], set: { lastSeen: ctx.now(), ip: meta.ip } }).returning();
  await evaluateDeviceRisk(ctx, userId, fp, meta.ip);
  return d;
}

export async function createSession(ctx: Ctx, user: User, meta: ReqMeta, mfa: boolean) {
  const device = await trackDevice(ctx, user.id, meta);
  const token = randomToken(32);
  await ctx.db.insert(sessions).values({ userId: user.id, tokenHash: sha256(token), deviceId: device.id, mfaAt: mfa ? ctx.now() : null, expiresAt: new Date(ctx.now().getTime() + SESSION_TTL_MS) });
  await ctx.db.insert(loginEvents).values({ userId: user.id, ip: meta.ip, fingerprint: device.fingerprint, success: true });
  return { token, user: publicUser(user), deviceId: device.id };
}

export async function authenticate(ctx: Ctx, token: string) {
  const [row] = await ctx.db.select({ s: sessions, u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, ctx.now())));
  if (!row) return null;
  if (row.u.status === 'banned') return null;
  return { user: row.u, session: row.s };
}
export async function logout(ctx: Ctx, token: string) {
  await ctx.db.update(sessions).set({ revokedAt: ctx.now() }).where(eq(sessions.tokenHash, sha256(token)));
}

export async function login(ctx: Ctx, input: { email: string; password: string; totp?: string }, meta: ReqMeta = {}) {
  await assertLoginVelocity(ctx.db, meta.ip, ctx.now());
  const [u] = await ctx.db.select().from(users).where(sql`lower(${users.email}) = ${input.email.trim().toLowerCase()}`);
  const ok = u?.passwordHash ? await argon2.verify(u.passwordHash, input.password) : (await argon2.hash('timing-pad', ARGON), false);
  if (!u || !ok) {
    await ctx.db.insert(loginEvents).values({ userId: u?.id ?? null, ip: meta.ip, fingerprint: meta.fingerprint, success: false });
    throw new DomainError('UNAUTHORIZED', 'invalid credentials');
  }
  if (u.status === 'banned') throw new DomainError('ACCOUNT_FROZEN', 'account banned');
  let mfa = false;
  if (u.totpEnabledAt) {
    if (!input.totp) throw new DomainError('TWO_FA_REQUIRED', 'TOTP code required');
    if (!(await useTotp(ctx, u, input.totp))) throw new DomainError('TWO_FA_INVALID', 'invalid or already used TOTP code');
    mfa = true;
  }
  return createSession(ctx, u, meta, mfa);
}

// ---------------------------------------------------------------- telegram
/** Validates Telegram WebApp initData per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
export function validateTelegramInitData(initData: string, botToken: string, maxAgeSec = 86400, nowSec = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = createHmac('sha256', secret).update(dataCheck).digest('hex');
  if (!safeEqual(calc, hash)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || nowSec - authDate > maxAgeSec) return null;
  const user = JSON.parse(params.get('user') ?? 'null') as { id: number; first_name?: string; username?: string; language_code?: string } | null;
  return user ? { ...user, authDate } : null;
}
export function signTelegramInitData(fields: Record<string, string>, botToken: string) {
  const dataCheck = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(dataCheck).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
/** TODO(provider): real bot token. The well-known dev token is only accepted in mock mode outside production. */
export const telegramBotToken = () => process.env.TELEGRAM_BOT_TOKEN || (process.env.NODE_ENV !== 'production' && (process.env.PROVIDER_MODE ?? 'mock') === 'mock' ? 'mock-bot-token' : '');
const TG_MAX_AGE_SEC = Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SEC ?? 3600);

export async function telegramLogin(ctx: Ctx, initData: string, country: string | undefined, meta: ReqMeta = {}) {
  const bot = telegramBotToken();
  if (!bot) throw new DomainError('UNAUTHORIZED', 'Telegram login not configured');
  const tg = validateTelegramInitData(initData, bot, TG_MAX_AGE_SEC);
  if (!tg) throw new DomainError('UNAUTHORIZED', 'invalid Telegram initData');
  let [u] = await ctx.db.select().from(users).where(eq(users.tgId, String(tg.id)));
  if (!u) {
    if (!country) throw new DomainError('VALIDATION', 'country required for first Telegram login');
    u = await screenAndCreate(ctx, { tgId: String(tg.id), country: country.toUpperCase(), locale: tg.language_code ?? 'en', displayName: tg.username ?? tg.first_name }, meta, 'user.signup_telegram');
  }
  return createSession(ctx, u, meta, false);
}

// ---------------------------------------------------------------- TOTP
export function checkTotp(u: Pick<User, 'totpSecretEnc'>, code: string) {
  if (!u.totpSecretEnc) return false;
  return authenticator.check(code, decrypt(u.totpSecretEnc));
}
/** Verify a TOTP and burn it: each (user, code, time-step) can be used once, so an intercepted code can't be replayed. */
export async function useTotp(ctx: Ctx, u: Pick<User, 'id' | 'totpSecretEnc'>, code: string): Promise<boolean> {
  if (!checkTotp(u, code)) return false;
  // Test suites perform many 2FA actions per 30 s window; never disable outside tests.
  if (process.env.TOTP_REPLAY_PROTECTION === 'off' && process.env.NODE_ENV !== 'production') return true;
  const step = Math.floor(ctx.now().getTime() / 30_000);
  const ins = await ctx.db.insert(idempotencyKeys).values({ scope: `totp:${u.id}`, key: `${code}:${step}`, requestHash: 'totp', status: 'done' }).onConflictDoNothing().returning();
  // The same code is also valid in the adjacent window; block it there too.
  if (ins.length) await ctx.db.insert(idempotencyKeys).values([{ scope: `totp:${u.id}`, key: `${code}:${step - 1}`, requestHash: 'totp', status: 'done' }, { scope: `totp:${u.id}`, key: `${code}:${step + 1}`, requestHash: 'totp', status: 'done' }]).onConflictDoNothing();
  return ins.length > 0;
}
export async function totpSetup(ctx: Ctx, userId: string) {
  const [u] = await ctx.db.select().from(users).where(eq(users.id, userId));
  if (u.totpEnabledAt) throw new DomainError('CONFLICT', '2FA already enabled');
  const secret = authenticator.generateSecret();
  await ctx.db.update(users).set({ totpSecretEnc: encrypt(secret) }).where(eq(users.id, userId));
  return { secret, otpauthUrl: authenticator.keyuri(u.email ?? u.phone ?? u.id, 'P2P Exchange', secret) };
}
export async function totpConfirm(ctx: Ctx, userId: string, code: string, meta: ReqMeta = {}) {
  const [u] = await ctx.db.select().from(users).where(eq(users.id, userId));
  if (!checkTotp(u, code)) throw new DomainError('TWO_FA_INVALID', 'invalid code');
  return runTx(ctx, async (t) => {
    await t.tx.update(users).set({ totpEnabledAt: ctx.now(), securityChangedAt: ctx.now() }).where(eq(users.id, userId));
    await audit(t.tx, { actorType: 'user', actorId: userId, action: 'user.2fa_enabled', subjectType: 'user', subjectId: userId, ip: meta.ip });
    return { enabled: true };
  });
}
/** 2FA re-prompt for sensitive actions (release, withdrawal, security changes). */
const TOTP_MAX_FAILS = Number(process.env.TOTP_MAX_FAILS ?? 5);
export async function require2fa(ctx: Ctx, user: User, code: string | undefined) {
  if (!user.totpEnabledAt) throw new DomainError('TWO_FA_REQUIRED', 'enable 2FA first');
  // Brute-force lockout: too many wrong codes in 15 minutes blocks 2FA-gated actions for this user.
  const since = new Date(ctx.now().getTime() - 15 * 60_000);
  const [f] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(idempotencyKeys).where(and(eq(idempotencyKeys.scope, `totpfail:${user.id}`), gt(idempotencyKeys.createdAt, since)));
  if (f.n >= TOTP_MAX_FAILS) throw new DomainError('RATE_LIMITED', 'too many invalid 2FA codes; try again later');
  if (!code || !(await useTotp(ctx, user, code))) {
    await ctx.db.insert(idempotencyKeys).values({ scope: `totpfail:${user.id}`, key: randomToken(9), requestHash: 'fail', status: 'done' });
    if (f.n + 1 >= TOTP_MAX_FAILS) await audit(ctx.db, { actorType: 'system', action: 'user.2fa_lockout', subjectType: 'user', subjectId: user.id });
    throw new DomainError('TWO_FA_INVALID', 'invalid or already used 2FA code');
  }
}
/** Housekeeping for spent TOTP codes and 2FA failure counters. */
export async function pruneTotpState(ctx: Ctx) {
  await ctx.db.delete(idempotencyKeys).where(and(sql`(${idempotencyKeys.scope} like 'totp:%' or ${idempotencyKeys.scope} like 'totpfail:%')`, lt(idempotencyKeys.createdAt, new Date(ctx.now().getTime() - 3600_000))));
}
export async function changePassword(ctx: Ctx, user: User, oldPw: string, newPw: string, totp: string | undefined, meta: ReqMeta = {}) {
  if (!user.passwordHash || !(await argon2.verify(user.passwordHash, oldPw))) throw new DomainError('UNAUTHORIZED', 'invalid password');
  if (user.totpEnabledAt) await require2fa(ctx, user, totp);
  await runTx(ctx, async (t) => {
    await t.tx.update(users).set({ passwordHash: await hashPassword(newPw), passwordChangedAt: ctx.now(), securityChangedAt: ctx.now() }).where(eq(users.id, user.id));
    await t.tx.update(sessions).set({ revokedAt: ctx.now() }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'user.password_changed', subjectType: 'user', subjectId: user.id, ip: meta.ip });
  });
}

// ---------------------------------------------------------------- passkeys (WebAuthn)
const rp = () => ({ rpID: process.env.WEBAUTHN_RP_ID ?? 'localhost', origin: process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:3000' });

async function saveChallenge(ctx: Ctx, subject: string, challenge: string) {
  await ctx.db.delete(webauthnChallenges).where(eq(webauthnChallenges.subject, subject));
  await ctx.db.insert(webauthnChallenges).values({ subject, challenge, expiresAt: new Date(ctx.now().getTime() + 5 * 60_000) });
}
async function takeChallenge(ctx: Ctx, subject: string) {
  const [c] = await ctx.db.delete(webauthnChallenges).where(and(eq(webauthnChallenges.subject, subject), gt(webauthnChallenges.expiresAt, ctx.now()))).returning();
  if (!c) throw new DomainError('UNAUTHORIZED', 'challenge expired');
  return c.challenge;
}

export async function passkeyRegistrationOptions(ctx: Ctx, subject: { kind: 'user' | 'admin'; id: string; name: string }) {
  const col = subject.kind === 'user' ? webauthnCredentials.userId : webauthnCredentials.adminId;
  const existing = await ctx.db.select().from(webauthnCredentials).where(eq(col, subject.id));
  const opts = await generateRegistrationOptions({
    rpName: 'P2P Exchange', rpID: rp().rpID, userName: subject.name, userID: new TextEncoder().encode(subject.id),
    excludeCredentials: existing.map((c) => ({ id: c.id })), authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  await saveChallenge(ctx, `${subject.kind}:${subject.id}:reg`, opts.challenge);
  return opts;
}
export async function passkeyRegister(ctx: Ctx, subject: { kind: 'user' | 'admin'; id: string }, response: any) {
  const expectedChallenge = await takeChallenge(ctx, `${subject.kind}:${subject.id}:reg`);
  const v = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: rp().origin, expectedRPID: rp().rpID, requireUserVerification: true })
    .catch((e: Error) => { throw new DomainError('UNAUTHORIZED', `passkey registration failed: ${e.message}`); });
  if (!v.verified || !v.registrationInfo) throw new DomainError('UNAUTHORIZED', 'passkey registration failed');
  const { credential } = v.registrationInfo;
  await runTx(ctx, async (t) => {
    await t.tx.insert(webauthnCredentials).values({
      id: credential.id, publicKey: Buffer.from(credential.publicKey).toString('base64url'), counter: credential.counter, transports: credential.transports ?? [],
      userId: subject.kind === 'user' ? subject.id : null, adminId: subject.kind === 'admin' ? subject.id : null,
    });
    await audit(t.tx, { actorType: subject.kind, actorId: subject.id, action: 'passkey.registered', subjectType: subject.kind, subjectId: subject.id });
  });
  return { verified: true };
}
export async function passkeyAuthOptions(ctx: Ctx, subjectKey: string) {
  const opts = await generateAuthenticationOptions({ rpID: rp().rpID, userVerification: 'required' });
  await saveChallenge(ctx, `auth:${subjectKey}`, opts.challenge);
  return opts;
}
/** Verifies a passkey assertion and returns the owner. */
export async function passkeyVerify(ctx: Ctx, subjectKey: string, response: any) {
  const expectedChallenge = await takeChallenge(ctx, `auth:${subjectKey}`);
  if (!response || typeof response.id !== 'string') throw new DomainError('UNAUTHORIZED', 'invalid passkey response');
  const [cred] = await ctx.db.select().from(webauthnCredentials).where(eq(webauthnCredentials.id, response.id));
  if (!cred) throw new DomainError('UNAUTHORIZED', 'unknown passkey');
  const v = await verifyAuthenticationResponse({
    response, expectedChallenge, expectedOrigin: rp().origin, expectedRPID: rp().rpID, requireUserVerification: true,
    credential: { id: cred.id, publicKey: Buffer.from(cred.publicKey, 'base64url'), counter: cred.counter, transports: (cred.transports ?? []) as any },
  }).catch((e: Error) => { throw new DomainError('UNAUTHORIZED', `passkey verification failed: ${e.message}`); });
  if (!v.verified) throw new DomainError('UNAUTHORIZED', 'passkey verification failed');
  await ctx.db.update(webauthnCredentials).set({ counter: v.authenticationInfo.newCounter }).where(eq(webauthnCredentials.id, cred.id));
  return { userId: cred.userId, adminId: cred.adminId };
}
export async function passkeyLogin(ctx: Ctx, subjectKey: string, response: any, meta: ReqMeta = {}) {
  const owner = await passkeyVerify(ctx, subjectKey, response);
  if (!owner.userId) throw new DomainError('UNAUTHORIZED', 'not a user passkey');
  const [u] = await ctx.db.select().from(users).where(eq(users.id, owner.userId));
  return createSession(ctx, u, meta, true);
}
