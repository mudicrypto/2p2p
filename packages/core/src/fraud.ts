/** Anti-fraud scoring (expanded in M8). */
import { orders, riskFlags, reputation, devices, and, eq, gt, sql, isNull, type DbOrTx } from '@p2p/db';
import type { Ctx } from './context';
import { getConfig } from './config';
import type { OrderRiskInput, RiskFlagSpec } from './risk';

export async function scoreOrderFull(ctx: Ctx, db: DbOrTx, i: OrderRiskInput) {
  const cfg = await getConfig(db, 'risk');
  const flags: RiskFlagSpec[] = [];
  let score = 0;
  const now = ctx.now().getTime();
  const ageH = (d: Date) => (now - d.getTime()) / 3600_000;
  if (ageH(i.buyer.createdAt) < 48) score += 15;
  if (ageH(i.seller.createdAt) < 48) score += 10;
  if (i.buyer.kycTier === 0) score += 10;
  if (i.paymentRisk === 'high') score += 20; else if (i.paymentRisk === 'medium') score += 8;
  if (i.reversible) score += 15;
  // All history signals in ONE round trip (this runs inside every order-creation transaction).
  const since = new Date(now - 3600_000).toISOString();
  const r = await db.execute<{ hist_n: number; hist_avg: string; vel_n: number; freeze: number; high_flags: number; shared: number }>(sql`
    select
      (select count(*)::int from ${orders} where buyer_id = ${i.buyer.id} and status = 'COMPLETED') as hist_n,
      (select coalesce(avg(usd_value_cents), 0)::text from ${orders} where buyer_id = ${i.buyer.id} and status = 'COMPLETED') as hist_avg,
      (select count(*)::int from ${orders} where (buyer_id = ${i.buyer.id} or seller_id = ${i.buyer.id}) and created_at > ${since}) as vel_n,
      (select coalesce(max(freeze_reports), 0)::int from ${reputation} where user_id = ${i.buyer.id}) as freeze,
      (select count(*)::int from ${riskFlags} where subject_type = 'user' and subject_id in (${i.buyer.id}, ${i.seller.id}) and severity = 'high' and resolved_at is null) as high_flags,
      (select count(*)::int from ${devices} a join ${devices} b on a.fingerprint = b.fingerprint where a.user_id = ${i.buyer.id} and b.user_id = ${i.seller.id}) as shared`);
  const h = r.rows[0];
  // Amount vs history: first trade or > 5x the buyer's average.
  if (h.hist_n === 0 && i.usdCents > 100_000n) { score += 10; flags.push({ code: 'FIRST_TRADE_LARGE', severity: 'low' }); }
  else if (h.hist_n > 0 && i.usdCents > BigInt(Math.floor(Number(h.hist_avg))) * 5n) { score += 15; flags.push({ code: 'AMOUNT_SPIKE', severity: 'medium', details: { avg: h.hist_avg } }); }
  // Velocity: orders in the last hour.
  if (h.vel_n >= cfg.velocityOrdersPerHour) { score += 25; flags.push({ code: 'VELOCITY', severity: 'high', details: { lastHour: h.vel_n } }); }
  // Counterparty freeze reports and open high-severity flags.
  if (h.freeze > 0) { score += 20 * Math.min(h.freeze, 3); flags.push({ code: 'COUNTERPARTY_FREEZE_REPORTS', severity: 'high', details: { reports: h.freeze } }); }
  if (h.high_flags > 0) score += 25;
  // Buyer and seller share a device -> collusion / self-trade.
  if (h.shared > 0) { score += 40; flags.push({ code: 'SHARED_DEVICE_COUNTERPARTIES', severity: 'high' }); }
  score = Math.min(100, score);
  // Any high-severity signal forces the manual-confirmation path regardless of the numeric score.
  return { score, manual: score >= cfg.manualConfirmScore || flags.some((f) => f.severity === 'high'), flags };
}

// ---------------------------------------------------------------- velocity & account-level risk (M8)
import { auditLog, loginEvents, users, disputes, freezeReports, lt } from '@p2p/db';
import { DomainError } from '@p2p/shared';
import { flag } from './risk';

export const VELOCITY = {
  signupsPerIpPerHour: Number(process.env.RISK_SIGNUPS_PER_IP_HOUR ?? 3),
  failedLoginsPerIpPer15m: Number(process.env.RISK_FAILED_LOGINS_15M ?? 10),
};

/** Called after a signup: many accounts from one IP in an hour => flag all of them. */
export async function checkSignupVelocity(db: DbOrTx, userId: string, ip?: string, now = new Date()) {
  if (!ip) return;
  const rows = await db.select({ id: auditLog.subjectId }).from(auditLog)
    .where(and(eq(auditLog.ip, ip), sql`${auditLog.action} like 'user.signup_%'`, gt(auditLog.createdAt, new Date(now.getTime() - 3600_000))));
  if (rows.length > VELOCITY.signupsPerIpPerHour) {
    for (const r of rows) if (r.id) await flag(db, 'user', r.id, 'SIGNUP_IP_VELOCITY', 'medium', { ip, count: rows.length });
  }
}
/** Brute-force guard: too many failed logins from an IP in 15 minutes. */
export async function assertLoginVelocity(db: DbOrTx, ip?: string, now = new Date()) {
  if (!ip) return;
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(loginEvents)
    .where(and(eq(loginEvents.ip, ip), eq(loginEvents.success, false), gt(loginEvents.createdAt, new Date(now.getTime() - 15 * 60_000))));
  if (r.n >= VELOCITY.failedLoginsPerIpPer15m) throw new DomainError('RATE_LIMITED', 'too many failed logins; try later');
}

/** User risk score 0-100 (shown to admins; feeds order scoring through open flags). */
export async function userRiskScore(ctx: Ctx, userId: string) {
  const [u] = await ctx.db.select().from(users).where(eq(users.id, userId));
  if (!u) return { score: 0, factors: [] as string[] };
  const factors: string[] = [];
  let score = 0;
  const ageH = (ctx.now().getTime() - u.createdAt.getTime()) / 3600_000;
  if (ageH < 48) { score += 15; factors.push('new_account'); }
  if (u.kycTier === 0) { score += 10; factors.push('tier0'); }
  if (u.sanctionsHit) { score += 100; factors.push('sanctions'); }
  const fl = await ctx.db.select({ code: riskFlags.code, sev: riskFlags.severity }).from(riskFlags)
    .where(and(eq(riskFlags.subjectType, 'user'), eq(riskFlags.subjectId, userId), isNull(riskFlags.resolvedAt)));
  for (const f of fl) { score += f.sev === 'high' ? 25 : f.sev === 'medium' ? 10 : 3; factors.push(f.code); }
  const [rep] = await ctx.db.select().from(reputation).where(eq(reputation.userId, userId));
  if (rep?.disputesLost) { score += 10 * rep.disputesLost; factors.push('disputes_lost'); }
  if (rep?.freezeReports) { score += 20 * rep.freezeReports; factors.push('freeze_reports'); }
  const [{ n: devShared }] = await ctx.db.select({ n: sql<number>`count(distinct b.user_id)::int` }).from(sql`${devices} a join ${devices} b on a.fingerprint = b.fingerprint and b.user_id <> a.user_id`).where(sql`a.user_id = ${userId}`);
  if (devShared > 0) { score += 15; factors.push('shared_device'); }
  void disputes; void freezeReports; void lt;
  return { score: Math.min(100, score), factors: [...new Set(factors)] };
}
