import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminUsers, reputation, users, eq } from '@p2p/db';
import { makeCtx, mkUser, fund, sepa, ensureSeed, uniq } from './helpers';
import {
  applyMerchant, lockSecurityDeposit, reviewMerchant, releaseSecurityDeposit, recomputeMerchantLevels, computeMerchantLevel, getMerchantProfile,
  createApiKey, revokeApiKey, verifyMerchantRequest, signMerchantRequest, createAd, createOrder, balanceOf, userAcct, CONFIG_DEFAULTS, type User,
} from '../src';

const ctx = makeCtx();
let adminId: string;
beforeAll(async () => {
  await ensureSeed(ctx);
  adminId = (await ctx.db.insert(adminUsers).values({ email: `${uniq()}@admin.io`, passwordHash: 'x', roles: ['compliance'] }).returning())[0].id;
});
afterAll(() => ctx.close());

async function approvedMerchant(): Promise<User> {
  const u = await mkUser(ctx, { tier: 3 });
  await fund(ctx, u, 'USDT', '20000');
  await applyMerchant(ctx, u, { businessName: 'Acme OTC', country: 'DE', expectedMonthlyVolumeUsd: 1_000_000 });
  await lockSecurityDeposit(ctx, u, 'USDT', '6000', undefined, { skip2fa: true });
  await reviewMerchant(ctx, adminId, u.id, { approve: true, note: 'docs ok' });
  return u;
}
const signed = (keyId: string, secret: string, method: string, path: string, body = '', ts = String(Date.now())) =>
  ({ keyId, timestamp: ts, signature: signMerchantRequest(secret, ts, method, path, body), method, path, body });

describe('M13 merchant program', () => {
  it('application -> deposit -> approval; rules enforced', async () => {
    const t2 = await mkUser(ctx, { tier: 1 });
    await expect(applyMerchant(ctx, t2, { businessName: 'X', country: 'DE', expectedMonthlyVolumeUsd: 1 })).rejects.toMatchObject({ code: 'TIER_REQUIRED' });
    const u = await mkUser(ctx, { tier: 2 });
    await fund(ctx, u, 'USDT', '10000');
    await applyMerchant(ctx, u, { businessName: 'Beta Ltd', country: 'DE', expectedMonthlyVolumeUsd: 50_000 });
    await expect(reviewMerchant(ctx, adminId, u.id, { approve: true, note: 'x' })).rejects.toMatchObject({ code: 'TIER_REQUIRED' });
    await ctx.db.update(users).set({ kycTier: 3 }).where(eq(users.id, u.id));
    await expect(reviewMerchant(ctx, adminId, u.id, { approve: true, note: 'x' })).rejects.toMatchObject({ code: 'CONFLICT' }); // no deposit
    await expect(lockSecurityDeposit(ctx, u, 'USDT', '100', undefined, { skip2fa: true })).rejects.toMatchObject({ code: 'VALIDATION' }); // below minimum
    await lockSecurityDeposit(ctx, u, 'USDT', '5000', undefined, { skip2fa: true });
    expect(await balanceOf(ctx.db, userAcct(u.id, 'USDT', 'security_deposit'))).toBe(5_000_000_000n);
    expect(await balanceOf(ctx.db, userAcct(u.id, 'USDT'))).toBe(5_000_000_000n);
    const r = await reviewMerchant(ctx, adminId, u.id, { approve: true, note: 'video call ok' });
    expect(r).toMatchObject({ status: 'approved', level: 1 });
    expect((await getMerchantProfile(ctx, u.id))?.verifiedBadge).toBe(true);
    // Exit: deposit returned, merchant suspended.
    await releaseSecurityDeposit(ctx, adminId, u.id);
    expect(await balanceOf(ctx.db, userAcct(u.id, 'USDT'))).toBe(10_000_000_000n);
    expect((await getMerchantProfile(ctx, u.id))?.status).toBe('suspended');
  });

  it('levels follow 30d volume and lower the maker fee', async () => {
    expect(computeMerchantLevel(CONFIG_DEFAULTS.merchants.levels, 0n)).toBe(1);
    expect(computeMerchantLevel(CONFIG_DEFAULTS.merchants.levels, 20_000_000n)).toBe(2);
    expect(computeMerchantLevel(CONFIG_DEFAULTS.merchants.levels, 200_000_000n)).toBe(3);
    const m = await approvedMerchant();
    await ctx.db.insert(reputation).values({ userId: m.id, volume30dUsdCents: 150_000_000n }).onConflictDoUpdate({ target: reputation.userId, set: { volume30dUsdCents: 150_000_000n } });
    await recomputeMerchantLevels(ctx);
    expect((await getMerchantProfile(ctx, m.id))?.level).toBe(3);
    const pm = await sepa(ctx, m);
    const ad = await createAd(ctx, m, { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '1', minAmount: '10', maxAmount: '10000', totalAmount: '5000', paymentMethodIds: [pm.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0, acceptReversible: false });
    const buyer = await mkUser(ctx, { tier: 2 });
    const o = await createOrder(ctx, buyer, { adId: ad.id, cryptoAmount: '1000' });
    expect(o.feeAmount).toBe(400_000n); // 4 bps at level 3 instead of 10 bps
  });

  it('HMAC verification: good, bad sig, stale, replay, missing scope, revoked', async () => {
    const m = await approvedMerchant();
    const outsider = await mkUser(ctx, { tier: 3 });
    await expect(createApiKey(ctx, outsider, ['ads:read'], undefined, { skip2fa: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(createApiKey(ctx, m, ['root'], undefined, { skip2fa: true })).rejects.toMatchObject({ code: 'VALIDATION' });
    const k = await createApiKey(ctx, m, ['ads:read', 'orders:read'], undefined, { skip2fa: true });
    const ok = signed(k.keyId, k.secret, 'GET', '/v1/merchant/ads');
    expect((await verifyMerchantRequest(ctx, ok, 'ads:read')).user.id).toBe(m.id);
    await expect(verifyMerchantRequest(ctx, ok, 'ads:read')).rejects.toMatchObject({ code: 'UNAUTHORIZED' }); // replay
    await expect(verifyMerchantRequest(ctx, { ...signed(k.keyId, k.secret, 'GET', '/v1/merchant/ads'), signature: 'ab'.repeat(32) }, 'ads:read')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(verifyMerchantRequest(ctx, signed(k.keyId, 'wrong-secret', 'GET', '/v1/merchant/ads'), 'ads:read')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(verifyMerchantRequest(ctx, signed(k.keyId, k.secret, 'GET', '/v1/merchant/ads', '', String(Date.now() - 60_000)), 'ads:read')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    // body is covered by the signature
    const s = signed(k.keyId, k.secret, 'POST', '/v1/merchant/ads', '{"a":1}');
    await expect(verifyMerchantRequest(ctx, { ...s, body: '{"a":2}' }, 'ads:read')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(verifyMerchantRequest(ctx, signed(k.keyId, k.secret, 'POST', '/v1/merchant/orders/x/release'), 'orders:release')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await revokeApiKey(ctx, m, k.keyId);
    await expect(verifyMerchantRequest(ctx, signed(k.keyId, k.secret, 'GET', '/v1/merchant/ads'), 'ads:read')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
