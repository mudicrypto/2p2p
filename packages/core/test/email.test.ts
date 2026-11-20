import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { systemConfig, users, eq } from '@p2p/db';
import { renderEmail } from '@p2p/providers';
import { makeCtx, ensureSeed, mkUser } from './helpers';
import { adminSetEmail, adminClearEmail, adminEmailStatus, adminTestEmail, wireEmail, emailSettings, requestPasswordReset, resendVerificationEmail } from '../src';

const ctx = makeCtx();
beforeAll(async () => { await ensureSeed(ctx); await ctx.db.delete(systemConfig).where(eq(systemConfig.key, 'secret.email')); wireEmail(ctx); });
afterAll(async () => { await ctx.db.delete(systemConfig).where(eq(systemConfig.key, 'secret.email')); await ctx.close(); });
afterEach(() => vi.unstubAllGlobals());
const admin = randomUUID();
const outbox = () => ctx.providers.mocks!.notifier.outbox;

describe('email delivery (Resend)', () => {
  it('without a key, emails stay in test mode', async () => {
    const u = await mkUser(ctx);
    await ctx.db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, u.id));
    const r = await resendVerificationEmail(ctx, { ...u, emailVerifiedAt: null });
    expect(r.token).toBeTruthy();
    expect(outbox().at(-1)).toMatchObject({ to: u.email, template: 'email_verify' });
    expect((await adminEmailStatus(ctx)).configured).toBe(false);
  });

  it('admin key is validated, stored encrypted, never shown, and used to send through Resend', async () => {
    await expect(adminSetEmail(ctx, admin, { apiKey: 'not-a-key' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(adminSetEmail(ctx, admin, { from: 'bad sender' })).rejects.toMatchObject({ code: 'VALIDATION' });
    const key = 're_test_ABCDEFGHIJKLMNOP1234';
    const st = await adminSetEmail(ctx, admin, { apiKey: key, from: 'parley <no-reply@parley.markets>' });
    expect(st).toMatchObject({ configured: true, keySource: 'admin panel', key: 're_te…1234' });
    const [row] = await ctx.db.select().from(systemConfig).where(eq(systemConfig.key, 'secret.email'));
    expect(JSON.stringify(row.value)).not.toContain(key);
    expect((await emailSettings(ctx)).key).toBe(key);

    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }); });
    const u = await mkUser(ctx);
    const before = outbox().length;
    await requestPasswordReset(ctx, u.email!.toUpperCase());
    expect(outbox().length).toBe(before); // went to Resend, not the test outbox
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(`Bearer ${key}`);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ from: 'parley <no-reply@parley.markets>', to: [u.email], subject: 'Reset your parley password' });
    expect(body.html).toContain('/reset-password?token=');

    // Resend's own error message reaches the admin panel.
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ name: 'validation_error', message: 'The parley.markets domain is not verified.' }), { status: 403 }));
    await expect(adminTestEmail(ctx, 'me@example.com')).rejects.toMatchObject({ code: 'UNAVAILABLE', message: expect.stringContaining('not verified') });
    expect((await adminEmailStatus(ctx)).lastError).toContain('not verified');

    await adminClearEmail(ctx, admin);
    expect((await adminEmailStatus(ctx)).configured).toBe(false);
  });

  it('email layout: subject, button and escaped text', () => {
    const e = renderEmail({ channel: 'email', to: 'a@b.c', template: 'email_verify', params: { link: 'https://parley.markets/verify-email?token=x"y' } });
    expect(e.subject).toBe('Confirm your email for parley');
    expect(e.html).toContain('Confirm email');
    expect(e.html).toContain('token=x&quot;y');
    expect(e.html).not.toContain('{link}');
    expect(e.text).toContain('https://parley.markets/verify-email?token=x"y');
  });
});
