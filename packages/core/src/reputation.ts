/** Reputation (spec 8): computed on events and nightly. Public profile data. */
import { orders, disputes, feedback, freezeReports, reputation, users, merchantProfiles, and, eq, or, gt, sql, desc, inArray } from '@p2p/db';
import { DomainError } from '@p2p/shared';
import type { Ctx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import type { User } from './auth';

export async function recomputeReputation(ctx: Ctx, userId: string) {
  const since = new Date(ctx.now().getTime() - 30 * 86400_000);
  const mine = or(eq(orders.buyerId, userId), eq(orders.sellerId, userId));
  const [agg] = await ctx.db.select({
    trades30d: sql<number>`count(*) filter (where ${orders.status} = 'COMPLETED' and ${orders.createdAt} > ${since.toISOString()})::int`,
    total: sql<number>`count(*) filter (where ${orders.status} = 'COMPLETED')::int`,
    terminal: sql<number>`count(*) filter (where ${orders.status} in ('COMPLETED','CANCELLED'))::int`,
    // Cancellations by the counterparty or timeouts caused by the other side do not hurt this user.
    myCancels: sql<number>`count(*) filter (where ${orders.status} = 'CANCELLED' and ${orders.buyerId} = ${userId})::int`,
    avgRelease: sql<number>`coalesce(avg(extract(epoch from (${orders.releasedAt} - ${orders.paidAt}))) filter (where ${orders.sellerId} = ${userId} and ${orders.releasedAt} is not null and ${orders.paidAt} is not null), 0)::int`,
    volume: sql<string>`coalesce(sum(${orders.usdValueCents}) filter (where ${orders.status} = 'COMPLETED' and ${orders.createdAt} > ${since.toISOString()}), 0)::text`,
  }).from(orders).where(mine);
  const [d] = await ctx.db.select({ n: sql<number>`count(*)::int`, lost: sql<number>`count(*) filter (where ${disputes.loserId} = ${userId})::int` })
    .from(disputes).innerJoin(orders, eq(orders.id, disputes.orderId)).where(mine);
  const [fb] = await ctx.db.select({ pos: sql<number>`count(*) filter (where ${feedback.positive})::int`, neg: sql<number>`count(*) filter (where not ${feedback.positive})::int` }).from(feedback).where(eq(feedback.toUser, userId));
  const [fr] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(freezeReports).innerJoin(orders, eq(orders.id, freezeReports.orderId))
    .where(and(eq(orders.buyerId, userId), inArray(freezeReports.status, ['approved', 'paid'])));
  const completionRateBps = agg.total + agg.myCancels === 0 ? 10000 : Math.floor((agg.total * 10000) / (agg.total + agg.myCancels));
  const disputeRateBps = agg.terminal === 0 ? 0 : Math.floor((d.n * 10000) / agg.terminal);
  const row = {
    userId, trades30d: agg.trades30d, tradesTotal: agg.total, completionRateBps, avgReleaseSec: agg.avgRelease, disputeRateBps,
    disputesLost: d.lost, freezeReports: fr.n, positiveFeedback: fb.pos, negativeFeedback: fb.neg, volume30dUsdCents: BigInt(agg.volume), updatedAt: ctx.now(),
  };
  await ctx.db.insert(reputation).values(row).onConflictDoUpdate({ target: reputation.userId, set: row });
  return row;
}

export async function recomputeAllReputation(ctx: Ctx) {
  const ids = await ctx.db.selectDistinct({ id: orders.buyerId }).from(orders).where(gt(orders.createdAt, new Date(ctx.now().getTime() - 60 * 86400_000)));
  const ids2 = await ctx.db.selectDistinct({ id: orders.sellerId }).from(orders).where(gt(orders.createdAt, new Date(ctx.now().getTime() - 60 * 86400_000)));
  const all = new Set([...ids, ...ids2].map((r) => r.id));
  for (const id of all) await recomputeReputation(ctx, id);
  return all.size;
}

export async function leaveFeedback(ctx: Ctx, user: User, orderId: string, positive: boolean, comment?: string) {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId));
  if (!o || (o.buyerId !== user.id && o.sellerId !== user.id)) throw new DomainError('NOT_FOUND', 'order not found');
  if (o.status !== 'COMPLETED') throw new DomainError('CONFLICT', 'feedback only after completion');
  const to = o.buyerId === user.id ? o.sellerId : o.buyerId;
  const r = await runTx(ctx, async (t) => {
    const ins = await t.tx.insert(feedback).values({ orderId, fromUser: user.id, toUser: to, positive, comment: comment?.slice(0, 500) }).onConflictDoNothing().returning();
    if (!ins.length) throw new DomainError('CONFLICT', 'feedback already left');
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'feedback.left', subjectType: 'order', subjectId: orderId, after: { positive } });
    return ins[0];
  });
  await recomputeReputation(ctx, to);
  return { id: r.id.toString(), positive: r.positive };
}

export async function publicProfile(ctx: Ctx, userId: string) {
  const [u] = await ctx.read.select({ id: users.id, displayName: users.displayName, kycTier: users.kycTier, createdAt: users.createdAt, isMerchant: users.isMerchant, status: users.status, country: users.country })
    .from(users).where(eq(users.id, userId));
  if (!u || u.status === 'banned') throw new DomainError('NOT_FOUND', 'user not found');
  const [rep] = await ctx.read.select().from(reputation).where(eq(reputation.userId, userId));
  const [m] = await ctx.read.select().from(merchantProfiles).where(eq(merchantProfiles.userId, userId));
  const recent = await ctx.read.select({ positive: feedback.positive, comment: feedback.comment, createdAt: feedback.createdAt }).from(feedback).where(eq(feedback.toUser, userId)).orderBy(desc(feedback.createdAt)).limit(20);
  const ageDays = Math.floor((ctx.now().getTime() - u.createdAt.getTime()) / 86400_000);
  return {
    id: u.id, displayName: u.displayName ?? `user-${u.id.slice(0, 6)}`, kycTier: u.kycTier, accountAgeDays: ageDays, isMerchant: u.isMerchant,
    verifiedBadge: !!m?.verifiedBadge, merchantLevel: m?.level ?? 0, country: u.country,
    trades30d: rep?.trades30d ?? 0, tradesTotal: rep?.tradesTotal ?? 0, completionRateBps: rep?.completionRateBps ?? 10000, avgReleaseSec: rep?.avgReleaseSec ?? 0,
    disputeRateBps: rep?.disputeRateBps ?? 0, freezeReports: rep?.freezeReports ?? 0, positiveFeedback: rep?.positiveFeedback ?? 0, negativeFeedback: rep?.negativeFeedback ?? 0,
    recentFeedback: recent,
  };
}
