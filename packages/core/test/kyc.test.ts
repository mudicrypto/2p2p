import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { users, orders, ads, auditLog, countryRules, kycApplications, riskFlags, eq, and } from '@p2p/db';
import { makeCtx, mkUser, sellAd, ensureSeed, refresh } from './helpers';
import {
  startKyc, handleKycWebhook, getKycName, getLimits, setLimits, createOrder, balanceOf, userAcct, kycStatus, type User,
} from '../src';

const ctx = makeCtx();
beforeAll(() => ensureSeed(ctx));
afterAll(() => ctx.close());
const mocks = () => ctx.providers.mocks!;

async function verifiedTier0(country = 'DE'): Promise<User> {
  const u = await mkUser(ctx, { tier: 0, country });
  const now = new Date();
  await ctx.db.update(users).set({ emailVerifiedAt: now, phoneVerifiedAt: now, totpEnabledAt: now }).where(eq(users.id, u.id));
  return refresh(ctx, u);
}
async function approve(u: User, level: number, fullName = 'Ana Maria Silva') {
  const s = await startKyc(ctx, await refresh(ctx, u), level);
  const wh = mocks().kyc.simulateReview(s.providerRef, { status: 'approved', fullName, dob: '1990-01-01', country: u.country });
  return { s, wh, res: await handleKycWebhook(ctx, wh.body, wh.headers) };
}

describe('M4 KYC and limits', () => {
  it('tier-0 requirements gate level 1; level must be the next tier', async () => {
    const u = await mkUser(ctx, { tier: 0 });
    await expect(startKyc(ctx, u, 1)).rejects.toMatchObject({ code: 'TIER_REQUIRED' });
    const v = await verifiedTier0();
    await expect(startKyc(ctx, v, 2)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('upgrade via mock KYC webhook raises tier and limits; name stored encrypted; audit before/after', async () => {
    const u = await verifiedTier0();
    const before = await getLimits(ctx, ctx.db, u);
    const { res, s } = await approve(u, 1);
    expect(res.outcome).toBe('upgraded');
    const after = await refresh(ctx, u);
    expect(after.kycTier).toBe(1);
    const l1 = await getLimits(ctx, ctx.db, after);
    expect(l1.daily).toBeGreaterThan(before.daily);
    expect(l1.daily).toBe(1_000_000n);
    expect(await getKycName(ctx.db, u.id)).toBe('Ana Maria Silva');
    const [app] = await ctx.db.select().from(kycApplications).where(eq(kycApplications.providerRef, s.providerRef));
    expect(app.verifiedFullNameEnc).not.toContain('Ana');
    const [a] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.action, 'user.tier_changed'), eq(auditLog.subjectId, u.id)));
    expect(a.before).toEqual({ tier: 0 });
    expect((a.after as any).tier).toBe(1);
    expect((await kycStatus(ctx, u.id)).tier).toBe(1);
    expect((await approve(after, 2)).res.outcome).toBe('upgraded');
    expect((await refresh(ctx, u)).kycTier).toBe(2);
  });

  it('webhook replay is idempotent; bad signature rejected; stale lower approval never downgrades', async () => {
    const u = await verifiedTier0();
    const { wh } = await approve(u, 1);
    expect((await handleKycWebhook(ctx, wh.body, wh.headers)).outcome).toBe('replayed');
    await expect(handleKycWebhook(ctx, wh.body, { 'x-mock-signature': 'deadbeef' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await ctx.db.update(users).set({ kycTier: 2 }).where(eq(users.id, u.id));
    const s = await startKyc(ctx, await refresh(ctx, u), 3);
    // A fresh approval event for the old level-1 application must not lower the tier.
    const [old] = await ctx.db.select().from(kycApplications).where(and(eq(kycApplications.userId, u.id), eq(kycApplications.level, 1)));
    const stale = mocks().kyc.simulateReview(old.providerRef, { status: 'approved', fullName: 'Ana Maria Silva' });
    expect((await handleKycWebhook(ctx, stale.body, stale.headers)).outcome).toBe('approved_no_change');
    expect((await refresh(ctx, u)).kycTier).toBe(2);
    const rej = mocks().kyc.simulateReview(s.providerRef, { status: 'rejected', rejectReason: 'video call failed' });
    expect((await handleKycWebhook(ctx, rej.body, rej.headers)).outcome).toBe('rejected');
    expect((await refresh(ctx, u)).kycTier).toBe(2);
  });

  it('sanctions hit on tier upgrade freezes the user and blocks the upgrade', async () => {
    const u = await verifiedTier0();
    const { res } = await approve(u, 1, 'John Sanction');
    expect(res.outcome).toBe('sanctions_hit');
    const after = await refresh(ctx, u);
    expect(after.kycTier).toBe(0);
    expect(after.status).toBe('frozen');
    expect(after.sanctionsHit).toBe(true);
    const f = await ctx.db.select().from(riskFlags).where(and(eq(riskFlags.subjectId, u.id), eq(riskFlags.code, 'SANCTIONS_HIT')));
    expect(f).toHaveLength(1);
  });

  it('order over the tier limit is rejected inside the transaction (nothing persisted); upgrade unlocks it', async () => {
    const { maker, ad } = await sellAd(ctx);
    const buyer = await verifiedTier0();
    const escrowBefore = await balanceOf(ctx.db, userAcct(maker.id, 'USDT', 'escrow'));
    await expect(createOrder(ctx, buyer, { adId: ad.id, cryptoAmount: '600' })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    expect(await balanceOf(ctx.db, userAcct(maker.id, 'USDT', 'escrow'))).toBe(escrowBefore);
    const [a] = await ctx.db.select().from(ads).where(eq(ads.id, ad.id));
    expect(a.remainingAmount).toBe(ad.remainingAmount);
    expect(await ctx.db.select().from(orders).where(eq(orders.buyerId, buyer.id))).toHaveLength(0);
    await approve(buyer, 1);
    const o = await createOrder(ctx, await refresh(ctx, buyer), { adId: ad.id, cryptoAmount: '600' });
    expect(o.status).toBe('AWAITING_PAYMENT');
  });

  it('concurrent orders cannot jointly exceed the daily limit', async () => {
    const { ad } = await sellAd(ctx);
    const buyer = await verifiedTier0(); // tier 0: $500/day
    const res = await Promise.allSettled(Array.from({ length: 6 }, () => createOrder(ctx, buyer, { adId: ad.id, cryptoAmount: '150' })));
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    for (const r of res) if (r.status === 'rejected') expect((r.reason as any).code).toBe('LIMIT_EXCEEDED');
  });

  it('admin limit edits apply immediately and are audited', async () => {
    const adminId = '00000000-0000-0000-0000-000000000001';
    const orig = { dailyLimit: 50_000n, monthlyLimit: 500_000n, perOrderMax: 50_000n, withdrawDaily: 50_000n };
    await expect(setLimits(ctx, adminId, 0, { ...orig, perOrderMax: 60_000n })).rejects.toMatchObject({ code: 'VALIDATION' });
    await setLimits(ctx, adminId, 0, { ...orig, dailyLimit: 80_000n, perOrderMax: 80_000n });
    const u = await mkUser(ctx, { tier: 0 });
    expect((await getLimits(ctx, ctx.db, u)).daily).toBe(80_000n);
    const [a] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.action, 'limits.changed'), eq(auditLog.subjectId, '0:USD')));
    expect((a.before as any).dailyLimit).toBe('50000');
    await setLimits(ctx, adminId, 0, orig);
  });

  it('blocked country and tier0Allowed=false country cannot trade', async () => {
    const { ad } = await sellAd(ctx);
    await ctx.db.insert(countryRules).values({ country: 'XB', status: 'blocked' }).onConflictDoNothing();
    await ctx.db.insert(countryRules).values({ country: 'XT', tier0Allowed: false }).onConflictDoNothing();
    await ctx.db.insert(countryRules).values({ country: 'XO', tierOverrides: { minTierToTrade: 2 } }).onConflictDoNothing();
    const blocked = await mkUser(ctx, { tier: 3, country: 'XB' });
    await expect(createOrder(ctx, blocked, { adId: ad.id, cryptoAmount: '20' })).rejects.toMatchObject({ code: 'COUNTRY_BLOCKED' });
    const t0 = await mkUser(ctx, { tier: 0, country: 'XT' });
    await expect(createOrder(ctx, t0, { adId: ad.id, cryptoAmount: '20' })).rejects.toMatchObject({ code: 'TIER_REQUIRED' });
    const t1 = await mkUser(ctx, { tier: 1, country: 'XT' });
    expect((await createOrder(ctx, t1, { adId: ad.id, cryptoAmount: '20' })).status).toBe('AWAITING_PAYMENT');
    const o1 = await mkUser(ctx, { tier: 1, country: 'XO' });
    await expect(createOrder(ctx, o1, { adId: ad.id, cryptoAmount: '20' })).rejects.toMatchObject({ code: 'TIER_REQUIRED' });
  });
});
