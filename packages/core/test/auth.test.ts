import { describe, it, expect, afterAll } from 'vitest';
import { authenticator } from 'otplib';
import { auditLog, countryRules, riskFlags, eq, and } from '@p2p/db';
import { makeCtx, uniq } from './helpers';
import {
  signupEmail, verifyEmail, login, authenticate, startPhoneVerification, verifyPhone, totpSetup, totpConfirm,
  telegramLogin, signTelegramInitData, validateTelegramInitData, trackDevice, encrypt, decrypt, redactPii, passkeyRegistrationOptions,
} from '../src';

const ctx = makeCtx();
afterAll(() => ctx.close());

describe('auth', () => {
  it('sign up, verify email, phone, enable 2FA, log in with 2FA', async () => {
    const email = `${uniq()}@example.com`;
    const { user, emailToken } = await signupEmail(ctx, { email, password: 'correct horse battery', country: 'DE' }, { ip: '1.1.1.1' });
    expect(user.status).toBe('active');
    expect(ctx.providers.mocks!.notifier.last('email_verify')!.to).toBe(email);
    expect((await verifyEmail(ctx, emailToken)).emailVerifiedAt).toBeTruthy();
    await expect(verifyEmail(ctx, emailToken)).rejects.toThrow();

    const phone = `+49${Math.floor(Math.random() * 1e10)}`;
    const { devCode } = await startPhoneVerification(ctx, user.id, phone);
    await expect(verifyPhone(ctx, user.id, phone, '000000' === devCode ? '111111' : '000000')).rejects.toThrow();
    expect((await verifyPhone(ctx, user.id, phone, devCode!)).phoneVerifiedAt).toBeTruthy();

    const { secret } = await totpSetup(ctx, user.id);
    await totpConfirm(ctx, user.id, authenticator.generate(secret));
    await expect(login(ctx, { email, password: 'correct horse battery' })).rejects.toMatchObject({ code: 'TWO_FA_REQUIRED' });
    await expect(login(ctx, { email, password: 'wrong' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const s = await login(ctx, { email, password: 'correct horse battery', totp: authenticator.generate(secret) }, { ip: '1.1.1.1', userAgent: 'vitest', fingerprint: uniq('fp') });
    const a = await authenticate(ctx, s.token);
    expect(a?.user.id).toBe(user.id);
    expect(a?.session.mfaAt).toBeTruthy();
    const audits = await ctx.db.select().from(auditLog).where(eq(auditLog.subjectId, user.id));
    expect(audits.map((x) => x.action)).toEqual(expect.arrayContaining(['user.signup_email', 'user.email_verified', 'user.phone_verified', 'user.2fa_enabled']));
  });

  it('blocked countries cannot sign up', async () => {
    await ctx.db.insert(countryRules).values({ country: 'KP', status: 'blocked' }).onConflictDoNothing();
    await expect(signupEmail(ctx, { email: `${uniq()}@x.io`, password: 'longpassword1', country: 'KP' })).rejects.toMatchObject({ code: 'COUNTRY_BLOCKED' });
  });

  it('sanctions screening at signup freezes hits', async () => {
    const { user } = await signupEmail(ctx, { email: `sanctioned${uniq()}@x.io`, password: 'longpassword1', country: 'US' });
    expect(user.status).toBe('frozen');
    expect(user.sanctionsHit).toBe(true);
  });

  it('telegram initData validation', async () => {
    const tgUser = JSON.stringify({ id: Math.floor(Math.random() * 1e9), first_name: 'A', username: uniq('tg') });
    const init = signTelegramInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: tgUser, query_id: 'q' }, 'mock-bot-token');
    expect(validateTelegramInitData(init, 'other-token')).toBeNull();
    expect(validateTelegramInitData(init.replace('first_name', 'first_nam3'), 'mock-bot-token')).toBeNull();
    const s1 = await telegramLogin(ctx, init, 'BR');
    const s2 = await telegramLogin(ctx, init, undefined);
    expect(s1.user.id).toBe(s2.user.id);
    const old = signTelegramInitData({ auth_date: String(Math.floor(Date.now() / 1000) - 90000), user: tgUser }, 'mock-bot-token');
    await expect(telegramLogin(ctx, old, 'BR')).rejects.toThrow();
  });

  it('multi-account device flag', async () => {
    const fp = uniq('shared-fp');
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const { user } = await signupEmail(ctx, { email: `${uniq()}@x.io`, password: 'longpassword1', country: 'FR' });
      await trackDevice(ctx, user.id, { fingerprint: fp, ip: '9.9.9.9' });
      ids.push(user.id);
    }
    const flags = await ctx.db.select().from(riskFlags).where(and(eq(riskFlags.code, 'MULTI_ACCOUNT_DEVICE'), eq(riskFlags.subjectId, ids[0])));
    expect(flags).toHaveLength(1);
  });

  it('passkey registration options are generated', async () => {
    const { user } = await signupEmail(ctx, { email: `${uniq()}@x.io`, password: 'longpassword1', country: 'FR' });
    const o = await passkeyRegistrationOptions(ctx, { kind: 'user', id: user.id, name: user.email! });
    expect(o.challenge).toBeTruthy();
    expect(o.rp.id).toBe('localhost');
  });

  it('envelope encryption + PII redaction', () => {
    const c = encrypt('Ana María Silva');
    expect(c).not.toContain('Ana');
    expect(decrypt(c)).toBe('Ana María Silva');
    expect(encrypt('x')).not.toBe(encrypt('x'));
    expect(redactPii('mail ana@example.com phone +4915112345678')).toBe('mail a***@example.com phone +49***78');
  });
});
