import { clearLimitsCache } from './limits';
/**
 * KYC tier upgrades (spec 5, M4). The provider (Sumsub; mock in dev) reviews the applicant and calls our
 * webhook. Approved levels raise users.kyc_tier after a person-level sanctions screen with the verified
 * name. Tier 3 additionally needs the merchant security deposit (added in M13).
 */
import { kycApplications, users, idempotencyKeys, limitsConfig, and, eq, desc, type DbOrTx } from '@p2p/db';
import { DomainError, KYC_TIERS, type KycTier } from '@p2p/shared';
import type { KycLevel } from '@p2p/providers';
import type { Ctx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import { encrypt, decrypt } from './crypto';
import { flag } from './risk';
import { getCountryRule } from './compliance';
import type { User } from './auth';

export async function startKyc(ctx: Ctx, user: User, level: number) {
  if (user.status !== 'active') throw new DomainError('ACCOUNT_FROZEN', 'account not active');
  if (![1, 2, 3].includes(level)) throw new DomainError('VALIDATION', 'level must be 1, 2 or 3');
  if (level !== user.kycTier + 1) throw new DomainError('VALIDATION', `next level is ${user.kycTier + 1}`);
  if (level === 1 && (!user.emailVerifiedAt || !user.phoneVerifiedAt || !user.totpEnabledAt)) {
    throw new DomainError('TIER_REQUIRED', 'tier 0 requirements first: verified email, verified phone and 2FA');
  }
  const session = await ctx.providers.kyc.createApplicant(user.id, level as KycLevel);
  return runTx(ctx, async (t) => {
    const [app] = await t.tx.insert(kycApplications).values({ userId: user.id, provider: ctx.providers.kyc.name, providerRef: session.providerRef, level, status: 'pending' }).returning();
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'kyc.started', subjectType: 'kyc_application', subjectId: app.id, after: { level } });
    return { applicationId: app.id, providerRef: session.providerRef, accessToken: session.accessToken, url: session.url, level };
  });
}

export async function kycStatus(ctx: Ctx, userId: string) {
  const apps = await ctx.db.select({ id: kycApplications.id, level: kycApplications.level, status: kycApplications.status, rejectReason: kycApplications.rejectReason, createdAt: kycApplications.createdAt, reviewedAt: kycApplications.reviewedAt })
    .from(kycApplications).where(eq(kycApplications.userId, userId)).orderBy(desc(kycApplications.createdAt)).limit(20);
  const [u] = await ctx.db.select({ tier: users.kycTier }).from(users).where(eq(users.id, userId));
  return { tier: u?.tier ?? 0, applications: apps };
}

export type KycWebhookOutcome = 'replayed' | 'unknown_applicant' | 'upgraded' | 'approved_no_change' | 'sanctions_hit' | 'rejected' | 'pending';

/** Verifies signature, dedupes on the provider event id, applies the review result. */
export async function handleKycWebhook(ctx: Ctx, rawBody: string, headers: Record<string, string | undefined>): Promise<{ outcome: KycWebhookOutcome }> {
  const kyc = ctx.providers.kyc;
  if (!kyc.verifyWebhook(rawBody, headers)) throw new DomainError('UNAUTHORIZED', 'bad webhook signature');
  const r = kyc.parseWebhook(rawBody);
  const screen = r.status === 'approved' && r.fullName
    ? await ctx.providers.personScreen.screenPerson({ fullName: r.fullName, dob: r.dob, country: r.country ?? 'XX' })
    : null;
  return runTx(ctx, async (t) => {
    // Dedupe on the provider event id inside the same tx: a failed apply leaves no key behind.
    const fresh = await t.tx.insert(idempotencyKeys).values({ scope: 'webhook:kyc', key: r.eventId, requestHash: r.providerRef, status: 'done', responseCode: 200 })
      .onConflictDoNothing().returning();
    if (!fresh.length) return { outcome: 'replayed' as const };
    const [app] = await t.tx.select().from(kycApplications).where(and(eq(kycApplications.provider, kyc.name), eq(kycApplications.providerRef, r.providerRef))).for('update');
    if (!app) return { outcome: 'unknown_applicant' as const };
    const [user] = await t.tx.select().from(users).where(eq(users.id, app.userId)).for('update');
    const now = ctx.now();
    if (r.status === 'rejected') {
      await t.tx.update(kycApplications).set({ status: 'rejected', rejectReason: r.rejectReason ?? null, reviewedAt: now }).where(eq(kycApplications.id, app.id));
      await audit(t.tx, { actorType: 'system', action: 'kyc.rejected', subjectType: 'kyc_application', subjectId: app.id, after: { reason: r.rejectReason } });
      t.emit({ type: 'kyc.rejected', userIds: [user.id], payload: { level: app.level, reason: r.rejectReason } });
      return { outcome: 'rejected' as const };
    }
    if (r.status !== 'approved') {
      await t.tx.update(kycApplications).set({ status: r.status }).where(eq(kycApplications.id, app.id));
      return { outcome: 'pending' as const };
    }
    await t.tx.update(kycApplications).set({
      status: screen?.hit ? 'manual_review' : 'approved', reviewedAt: now, country: r.country ?? app.country,
      verifiedFullNameEnc: r.fullName ? encrypt(r.fullName) : app.verifiedFullNameEnc, dobEnc: r.dob ? encrypt(r.dob) : app.dobEnc,
    }).where(eq(kycApplications.id, app.id));
    if (screen?.hit) {
      await t.tx.update(users).set({ status: 'frozen', sanctionsHit: true }).where(eq(users.id, user.id));
      await flag(t.tx, 'user', user.id, 'SANCTIONS_HIT', 'high', { lists: screen.lists, stage: 'tier_upgrade' });
      await audit(t.tx, { actorType: 'system', action: 'user.sanctions_hit', subjectType: 'user', subjectId: user.id, before: { status: user.status }, after: { status: 'frozen', lists: screen.lists, level: app.level } });
      return { outcome: 'sanctions_hit' as const };
    }
    // Never downgrade on a stale/lower approval; frozen users are not upgraded.
    if (user.status !== 'active' || app.level <= user.kycTier) {
      await audit(t.tx, { actorType: 'system', action: 'kyc.approved', subjectType: 'kyc_application', subjectId: app.id, after: { level: app.level, tierUnchanged: user.kycTier } });
      return { outcome: 'approved_no_change' as const };
    }
    await t.tx.update(users).set({ kycTier: app.level }).where(eq(users.id, user.id));
    await audit(t.tx, { actorType: 'system', action: 'user.tier_changed', subjectType: 'user', subjectId: user.id, before: { tier: user.kycTier }, after: { tier: app.level, applicationId: app.id } });
    t.emit({ type: 'kyc.approved', userIds: [user.id], payload: { tier: app.level } });
    return { outcome: 'upgraded' as const };
  });
}

/** Decrypted verified full name from the latest approved application (payer-name matching, M8/M10). */
export async function getKycName(db: DbOrTx, userId: string): Promise<string | null> {
  const [app] = await db.select({ n: kycApplications.verifiedFullNameEnc }).from(kycApplications)
    .where(and(eq(kycApplications.userId, userId), eq(kycApplications.status, 'approved'))).orderBy(desc(kycApplications.reviewedAt)).limit(1);
  return app?.n ? decrypt(app.n) : null;
}

/** Country tier rules: tier0Allowed=false or tierOverrides.minTierToTrade block low-tier trading. */
export async function assertTierAllowed(db: DbOrTx, user: Pick<User, 'country' | 'kycTier'>) {
  const rule = await getCountryRule(db, user.country);
  const override = Number((rule.tierOverrides as Record<string, unknown>)?.minTierToTrade ?? 0) || 0;
  const minTier = Math.max(rule.tier0Allowed ? 0 : 1, override);
  if (user.kycTier < minTier) throw new DomainError('TIER_REQUIRED', `tier ${minTier}+ required to trade in ${user.country}`);
}

export interface LimitValues { dailyLimit: bigint; monthlyLimit: bigint; perOrderMax: bigint; withdrawDaily: bigint }
/** Admin edit of limits_config (USD-cent row is authoritative). Audited with before/after. */
export async function setLimits(ctx: Ctx, adminId: string, tier: number, v: LimitValues, asset = 'USD') {
  clearLimitsCache();
  setTimeout(clearLimitsCache, 0);
  if (!KYC_TIERS.includes(tier as KycTier)) throw new DomainError('VALIDATION', 'invalid tier');
  for (const x of Object.values(v)) if (x < 0n) throw new DomainError('VALIDATION', 'limits must be non-negative');
  if (v.perOrderMax > v.dailyLimit || v.dailyLimit > v.monthlyLimit) throw new DomainError('VALIDATION', 'require perOrder <= daily <= monthly');
  return runTx(ctx, async (t) => {
    const [before] = await t.tx.select().from(limitsConfig).where(and(eq(limitsConfig.tier, tier), eq(limitsConfig.asset, asset))).for('update');
    const [after] = await t.tx.insert(limitsConfig).values({ tier, asset, ...v })
      .onConflictDoUpdate({ target: [limitsConfig.tier, limitsConfig.asset], set: { ...v, updatedAt: ctx.now() } }).returning();
    await audit(t.tx, { actorType: 'admin', actorId: adminId, action: 'limits.changed', subjectType: 'limits_config', subjectId: `${tier}:${asset}`, before: before ?? null, after });
    return after;
  });
  // (cache) admin edits take effect immediately on this instance

}
