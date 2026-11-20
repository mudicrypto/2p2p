/**
 * Features matched from large P2P venues: saved searches, release reminders, trust score,
 * chat translation, and invite rewards paid from a rewards fund.
 */
import { savedSearches, referralRewards, orders, chatMessages, and, eq, lt, sql, desc } from '@p2p/db';
import { DomainError, assetDecimals, toMinor, fromMinor, type Asset } from '@p2p/shared';
import type { Ctx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import { getConfig } from './config';
import { notify } from './notifications';
import { postTx, balanceOf, systemAcct, userAcct } from './ledger';
import { presentMessage } from './chat';
import type { User } from './auth';

// ---------------------------------------------------------------- saved searches
const SEARCH_KEYS = ['side', 'asset', 'fiat', 'paymentType', 'region', 'merchantOnly', 'minTier', 'onlineOnly', 'followingOnly', 'q', 'sort', 'amount'] as const;
const MAX_SAVED = 10;
export async function listSavedSearches(ctx: Ctx, user: User) {
  return ctx.db.select().from(savedSearches).where(eq(savedSearches.userId, user.id)).orderBy(desc(savedSearches.createdAt));
}
export async function saveSearch(ctx: Ctx, user: User, name: string, params: Record<string, unknown>) {
  const n = name.trim().slice(0, 40);
  if (!n) throw new DomainError('VALIDATION', 'name required');
  const clean: Record<string, string> = {};
  for (const k of SEARCH_KEYS) { const v = params[k]; if (v !== undefined && v !== null && v !== '' && v !== false) clean[k] = String(v).slice(0, 60); }
  if (!clean.side || !clean.asset || !clean.fiat) throw new DomainError('VALIDATION', 'side, asset and fiat are required');
  const [{ c }] = await ctx.db.select({ c: sql<number>`count(*)::int` }).from(savedSearches).where(eq(savedSearches.userId, user.id));
  if (c >= MAX_SAVED) throw new DomainError('LIMIT_EXCEEDED', `at most ${MAX_SAVED} saved searches`);
  const [r] = await ctx.db.insert(savedSearches).values({ userId: user.id, name: n, params: clean }).returning();
  return r;
}
export async function deleteSavedSearch(ctx: Ctx, user: User, id: string) {
  await ctx.db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, user.id)));
  return { ok: true };
}

// ---------------------------------------------------------------- release reminders
/** Worker: nudge sellers who haven't released after the buyer marked the order paid (in-app, email/push, and a chat line). */
export async function sendReleaseReminders(ctx: Ctx) {
  const { afterMin } = await getConfig(ctx.db, 'releaseReminders');
  let sent = 0;
  for (let i = 0; i < afterMin.length; i++) {
    const cutoff = new Date(ctx.now().getTime() - afterMin[i] * 60_000);
    const due = await ctx.db.select({ id: orders.id, sellerId: orders.sellerId }).from(orders)
      .where(and(eq(orders.status, 'PAID'), eq(orders.releaseReminders, i), lt(orders.paidAt, cutoff))).limit(200);
    for (const o of due) {
      await runTx(ctx, async (t) => {
        const upd = await t.tx.update(orders).set({ releaseReminders: i + 1 }).where(and(eq(orders.id, o.id), eq(orders.releaseReminders, i), eq(orders.status, 'PAID'))).returning({ id: orders.id });
        if (!upd.length) return; // released or reminded meanwhile
        const [m] = await t.tx.insert(chatMessages).values({ orderId: o.id, senderId: null, system: true, body: `Reminder: the buyer marked this order as paid ${afterMin[i]} minutes ago. Seller, check your account and release the crypto if the money has arrived, or open an appeal if it hasn't.` }).returning();
        t.emit({ type: 'chat.message', orderId: o.id, payload: presentMessage(m) });
        await notify(t, t.tx, o.sellerId, 'release_reminder', { orderId: o.id, minutes: afterMin[i] });
        sent++;
      });
    }
  }
  return { sent };
}

// ---------------------------------------------------------------- trust score
export interface TrustInput { tradesTotal: number; completionRateBps: number; disputeRateBps: number; positiveFeedback: number; negativeFeedback: number; accountAgeDays: number; kycTier: number; verifiedBadge: boolean; freezeReports: number }
/**
 * 0–100 score from real history only. Each part is shown to users so the number is explainable.
 * New accounts start low and earn trust through completed trades, age, verification and good feedback.
 */
export function trustScore(p: TrustInput) {
  const fb = p.positiveFeedback + p.negativeFeedback;
  const parts = {
    history: Math.round(Math.min(1, Math.log10(1 + p.tradesTotal) / 2) * 25),                // 100 trades → full
    completion: p.tradesTotal ? Math.round(Math.max(0, (p.completionRateBps - 8000) / 2000) * 20) : 0, // 80%→0, 100%→20
    feedback: fb ? Math.round((p.positiveFeedback / fb) * Math.min(1, fb / 10) * 15) : 0,
    age: Math.round(Math.min(1, p.accountAgeDays / 180) * 15),
    verification: Math.min(3, p.kycTier) * 5 + (p.verifiedBadge ? 5 : 0) - (p.kycTier >= 3 && p.verifiedBadge ? 5 : 0), // max 15
    disputes: p.tradesTotal ? Math.round(Math.max(0, 1 - p.disputeRateBps / 500) * 10) : 0,    // 5%+ disputes → 0
  };
  const penalty = Math.min(30, p.freezeReports * 15);
  const score = Math.max(0, Math.min(100, Object.values(parts).reduce((a, b) => a + b, 0) - penalty));
  const level = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 35 ? 'fair' : 'new';
  return { score, level, parts, penalty };
}

// ---------------------------------------------------------------- chat translation
const tcache = new Map<string, string>();
export const translationEnabled = (ctx: Ctx) => !!ctx.providers.translator;
export async function translateChatMessage(ctx: Ctx, user: User, orderId: string, messageId: string, target: string) {
  const tr = ctx.providers.translator;
  if (!tr) throw new DomainError('UNAVAILABLE', 'translation is not configured');
  if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(target)) throw new DomainError('VALIDATION', 'bad language');
  const [o] = await ctx.db.select({ b: orders.buyerId, s: orders.sellerId }).from(orders).where(eq(orders.id, orderId));
  if (!o || (o.b !== user.id && o.s !== user.id)) throw new DomainError('NOT_FOUND', 'order not found');
  const [m] = await ctx.db.select().from(chatMessages).where(and(eq(chatMessages.id, BigInt(messageId)), eq(chatMessages.orderId, orderId), eq(chatMessages.flagged, false)));
  if (!m || !m.body) throw new DomainError('NOT_FOUND', 'message not found');
  const key = `${m.id}:${target}`;
  let text = tcache.get(key);
  if (!text) {
    text = (await tr.translate(m.body.slice(0, 2000), target)).slice(0, 4000);
    if (tcache.size > 5000) tcache.clear();
    tcache.set(key, text);
  }
  return { id: messageId, target, text };
}

// ---------------------------------------------------------------- invite rewards
export const rewardsBalance = (ctx: Ctx, asset: string) => balanceOf(ctx.db, systemAcct(asset, 'rewards'));
/** Admin: move collected fees into the rewards fund that pays invite rewards. */
export async function fundRewards(ctx: Ctx, adminId: string, asset: Asset, amount: bigint, idempotencyKey: string) {
  if (amount <= 0n) throw new DomainError('VALIDATION', 'amount must be positive');
  const r = await runTx(ctx, async (t) => {
    const r = await postTx(t.tx, { type: 'adjustment', refType: 'rewards_topup', refId: adminId, idempotencyKey: `rewards:topup:${idempotencyKey}`, postings: [
      { account: systemAcct(asset, 'fee'), amount: -amount }, { account: systemAcct(asset, 'rewards'), amount },
    ] });
    if (!r.replayed) await audit(t.tx, { actorType: 'admin', actorId: adminId, action: 'rewards.funded', subjectType: 'system', subjectId: `rewards:${asset}`, after: { asset, amount } });
    return r;
  });
  await payReferralRewards(ctx); // pay anything that was waiting for funds
  return r;
}

/**
 * Worker: an invitee qualifies with their first completed trade worth at least minTradeUsdCents
 * with someone other than their inviter. One reward per invitee; waits as "pending" while the fund is empty.
 */
export async function payReferralRewards(ctx: Ctx) {
  const cfg = await getConfig(ctx.db, 'referral');
  if (!cfg.enabled) return { paid: 0, pending: 0 };
  const asset = cfg.rewardAsset as Asset;
  const amount = toMinor(cfg.rewardAmount, assetDecimals(asset));
  // New qualifiers → pending rows.
  const q = await ctx.db.execute<{ referee: string; referrer: string; order_id: string }>(sql`
    select distinct on (u.id) u.id referee, u.referred_by referrer, o.id order_id
    from users u join orders o on (o.buyer_id = u.id or o.seller_id = u.id)
    where u.referred_by is not null and o.status = 'COMPLETED' and o.usd_value_cents >= ${cfg.minTradeUsdCents}
      and o.buyer_id <> u.referred_by and o.seller_id <> u.referred_by
      and not exists (select 1 from referral_rewards r where r.referee_id = u.id)
    order by u.id, o.released_at asc nulls last limit 500`);
  for (const r of q.rows) await ctx.db.insert(referralRewards).values({ refereeId: r.referee, referrerId: r.referrer, orderId: r.order_id, asset, amount }).onConflictDoNothing();
  // Pay pending ones while the fund lasts.
  const pending = await ctx.db.select().from(referralRewards).where(eq(referralRewards.status, 'pending')).orderBy(referralRewards.createdAt).limit(500);
  let paid = 0;
  for (const p of pending) {
    const ok = await runTx(ctx, async (t) => {
      const [row] = await t.tx.select().from(referralRewards).where(and(eq(referralRewards.refereeId, p.refereeId), eq(referralRewards.status, 'pending'))).for('update');
      if (!row) return false;
      if ((await balanceOf(t.tx, systemAcct(row.asset, 'rewards'))) < row.amount) return false;
      await postTx(t.tx, { type: 'referral_reward', refType: 'referral', refId: row.refereeId, idempotencyKey: `referral:${row.refereeId}:reward`, postings: [
        { account: systemAcct(row.asset, 'rewards'), amount: -row.amount }, { account: userAcct(row.referrerId, row.asset), amount: row.amount },
      ] });
      await t.tx.update(referralRewards).set({ status: 'paid', paidAt: ctx.now() }).where(eq(referralRewards.refereeId, row.refereeId));
      await audit(t.tx, { actorType: 'system', actorId: null, action: 'referral.reward_paid', subjectType: 'user', subjectId: row.referrerId, after: { referee: row.refereeId, asset: row.asset, amount: row.amount } });
      await notify(t, t.tx, row.referrerId, 'referral_reward', { asset: row.asset, amount: fromMinor(row.amount, assetDecimals(row.asset as Asset), { trim: true }) });
      return true;
    });
    if (!ok) break; // fund empty: the rest stay pending
    paid++;
  }
  return { paid, pending: pending.length - paid };
}

/** Rewards summary for the invite page. */
export async function referralRewardsInfo(ctx: Ctx, user: User) {
  const cfg = await getConfig(ctx.db, 'referral');
  const rows = await ctx.db.select({ status: referralRewards.status, asset: referralRewards.asset, amount: referralRewards.amount }).from(referralRewards).where(eq(referralRewards.referrerId, user.id));
  const sum = (s: string) => rows.filter((r) => r.status === s).reduce((a, r) => a + r.amount, 0n);
  const d = assetDecimals(cfg.rewardAsset as Asset);
  return { enabled: cfg.enabled, rewardAsset: cfg.rewardAsset, rewardAmount: cfg.rewardAmount, minTradeUsd: (cfg.minTradeUsdCents / 100).toFixed(0), earned: fromMinor(sum('paid'), d, { trim: true }), pending: fromMinor(sum('pending'), d, { trim: true }) };
}
