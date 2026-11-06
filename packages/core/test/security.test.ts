import { describe, it, expect, afterAll, beforeEach, afterEach } from 'vitest';
import { authenticator } from 'otplib';
import { makeCtx, mkUser, refresh } from './helpers';
import { totpSetup, totpConfirm, require2fa, telegramBotToken } from '../src';
import { createProviders, assertNoMocksInProduction } from '@p2p/providers';

const ctx = makeCtx();
afterAll(() => ctx.close());

describe('M15 security hardening', () => {
  beforeEach(() => { process.env.TOTP_REPLAY_PROTECTION = 'on'; });
  afterEach(() => { process.env.TOTP_REPLAY_PROTECTION = 'off'; });
  it('a TOTP code cannot be replayed', async () => {
    const u = await mkUser(ctx);
    const { secret } = await totpSetup(ctx, u.id);
    await totpConfirm(ctx, u.id, authenticator.generate(secret));
    const user = await refresh(ctx, u);
    const code = authenticator.generate(secret);
    await require2fa(ctx, user, code);
    await expect(require2fa(ctx, user, code)).rejects.toMatchObject({ code: 'TWO_FA_INVALID' });
  });
  it('production refuses mock providers and the dev Telegram token', () => {
    const env = { ...process.env };
    try {
      process.env.NODE_ENV = 'production'; delete process.env.ALLOW_MOCK_PROVIDERS; delete process.env.TELEGRAM_BOT_TOKEN;
      expect(() => createProviders('mock')).toThrow(/mock providers/);
      expect(() => createProviders('real')).toThrow(/custody/);
      expect(telegramBotToken()).toBe('');
      process.env.ALLOW_MOCK_PROVIDERS = '1';
      expect(() => assertNoMocksInProduction(createProviders('mock'))).not.toThrow();
    } finally { process.env = env; }
  });
});
