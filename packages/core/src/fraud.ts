/** Anti-fraud scoring (expanded in M8). */
import { orders, riskFlags, reputation, devices, and, eq, or, gt, sql, isNull, inArray, type DbOrTx } from '@p2p/db';
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
  // Amount vs history: first trade or > 5x the buyer's average.
  const [hist] = await db.select({ n: sql<number>`count(*)::int`, avg: sql<string>`coalesce(avg(${orders.usdValueCents}),0)::text` })
    .from(orders).where(and(eq(orders.buyerId, i.buyer.id), eq(orders.status, 'COMPLETED')));
  if (hist.n === 0 && i.usdCents > 100_000n) { score += 10; flags.push({ code: 'FIRST_TRADE_LARGE', severity: 'low' }); }
  else if (hist.n > 0 && i.usdCents > BigInt(Math.floor(Number(hist.avg))) * 5n) { score += 15; flags.push({ code: 'AMOUNT_SPIKE', severity: 'medium', details: { avg: hist.avg } }); }
  // Velocity: orders in the last hour.
  const [vel] = await db.select({ n: sql<number>`count(*)::int` }).from(orders)
    .where(and(or(eq(orders.buyerId, i.buyer.id), eq(orders.sellerId, i.buyer.id)), gt(orders.createdAt, new Date(now - 3600_000))));
  if (vel.n >= cfg.velocityOrdersPerHour) { score += 25; flags.push({ code: 'VELOCITY', severity: 'high', details: { lastHour: vel.n } }); }
  // Counterparty freeze reports and open high-severity flags.
  const [rep] = await db.select({ fr: reputation.freezeReports }).from(reputation).where(eq(reputation.userId, i.buyer.id));
  if ((rep?.fr ?? 0) > 0) { score += 20 * Math.min(rep!.fr, 3); flags.push({ code: 'COUNTERPARTY_FREEZE_REPORTS', severity: 'high', details: { reports: rep!.fr } }); }
  const open = await db.select({ code: riskFlags.code, sub: riskFlags.subjectId }).from(riskFlags)
    .where(and(eq(riskFlags.subjectType, 'user'), inArray(riskFlags.subjectId, [i.buyer.id, i.seller.id]), eq(riskFlags.severity, 'high'), isNull(riskFlags.resolvedAt)));
  if (open.length) score += 25;
  // Buyer and seller share a device -> collusion / self-trade.
  const shared = await db.execute<{ n: number }>(sql`select count(*)::int n from ${devices} a join ${devices} b on a.fingerprint = b.fingerprint where a.user_id = ${i.buyer.id} and b.user_id = ${i.seller.id}`);
  if ((shared.rows[0]?.n ?? 0) > 0) { score += 40; flags.push({ code: 'SHARED_DEVICE_COUNTERPARTIES', severity: 'high' }); }
  score = Math.min(100, score);
  return { score, manual: score >= cfg.manualConfirmScore, flags };
}
