/**
 * P2P community features (parity with major P2P venues):
 * nicknames, online status, "take a break" (away) mode, follow / block, referrals, anti-phishing code,
 * price alerts and large-trade (OTC) requests.
 */
import { randomBytes } from 'node:crypto';
import { users, userFollows, userBlocks, priceAlerts, otcRequests, ads, and, eq, or, sql, desc, inArray, type DbOrTx } from '@p2p/db';
import { DomainError, parsePrice, formatPrice } from '@p2p/shared';
import type { Ctx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import { notify } from './notifications';
import { fiatDecimals } from './fiat';
import type { User } from './auth';

// ---------------------------------------------------------------- nickname
const NICK_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,18}[\p{L}\p{N}]$/u;
/** Words that would let someone impersonate the platform or its staff. */
const RESERVED = ['admin', 'parley', 'support', 'official', 'moderator', 'arbiter', 'staff', 'system', 'security', 'helpdesk'];
export function validateNickname(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!NICK_RE.test(name)) throw new DomainError('VALIDATION', 'nickname: 3–20 letters, digits, spaces, dot, dash or underscore');
  const flat = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (RESERVED.some((w) => flat.includes(w))) throw new DomainError('VALIDATION', 'nickname not allowed');
  if (/^user-?[0-9a-f]{6}$/i.test(name)) throw new DomainError('VALIDATION', 'nickname not allowed');
  return name;
}
export async function setNickname(ctx: Ctx, user: User, raw: string) {
  const name = validateNickname(raw);
  const [taken] = await ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.displayName}) = ${name.toLowerCase()}`);
  if (taken && taken.id !== user.id) throw new DomainError('CONFLICT', 'nickname already taken');
  return runTx(ctx, async (t) => {
    await t.tx.update(users).set({ displayName: name }).where(eq(users.id, user.id));
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'user.nickname', subjectType: 'user', subjectId: user.id, before: { displayName: user.displayName }, after: { displayName: name } });
    return { displayName: name };
  });
}

// ---------------------------------------------------------------- online status
const ONLINE_MS = 5 * 60_000;
const lastTouch = new Map<string, number>();
/** Records activity at most once a minute per user (called by the auth guard). */
export async function touchLastSeen(db: DbOrTx, userId: string, now = Date.now()) {
  if (now - (lastTouch.get(userId) ?? 0) < 60_000) return;
  lastTouch.set(userId, now);
  if (lastTouch.size > 50_000) lastTouch.clear();
  await db.update(users).set({ lastSeenAt: new Date(now) }).where(eq(users.id, userId));
}
export const isOnline = (lastSeenAt: Date | null | undefined, now = Date.now()) => !!lastSeenAt && now - lastSeenAt.getTime() < ONLINE_MS;

// ---------------------------------------------------------------- away mode ("take a break")
export async function setAwayMode(ctx: Ctx, user: User, away: boolean) {
  await ctx.db.update(users).set({ awayMode: away }).where(eq(users.id, user.id));
  await audit(ctx.db, { actorType: 'user', actorId: user.id, action: 'user.away_mode', subjectType: 'user', subjectId: user.id, after: { away } });
  await refreshBooksOf(ctx, [user.id]);
  return { away };
}

// ---------------------------------------------------------------- follow / block
async function assertOther(ctx: Ctx, me: string, other: string) {
  if (me === other) throw new DomainError('VALIDATION', 'cannot do this to yourself');
  const [u] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.id, other));
  if (!u) throw new DomainError('NOT_FOUND', 'user not found');
}
export async function follow(ctx: Ctx, user: User, otherId: string, on: boolean) {
  await assertOther(ctx, user.id, otherId);
  if (on) await ctx.db.insert(userFollows).values({ followerId: user.id, followeeId: otherId }).onConflictDoNothing();
  else await ctx.db.delete(userFollows).where(and(eq(userFollows.followerId, user.id), eq(userFollows.followeeId, otherId)));
  await refreshBooksOf(ctx, [otherId]);
  return relationTo(ctx.db, user.id, otherId);
}
export async function block(ctx: Ctx, user: User, otherId: string, on: boolean) {
  await assertOther(ctx, user.id, otherId);
  if (on) {
    await ctx.db.insert(userBlocks).values({ blockerId: user.id, blockedId: otherId }).onConflictDoNothing();
    await ctx.db.delete(userFollows).where(and(eq(userFollows.followerId, user.id), eq(userFollows.followeeId, otherId)));
  } else await ctx.db.delete(userBlocks).where(and(eq(userBlocks.blockerId, user.id), eq(userBlocks.blockedId, otherId)));
  await audit(ctx.db, { actorType: 'user', actorId: user.id, action: on ? 'user.block' : 'user.unblock', subjectType: 'user', subjectId: otherId });
  await refreshBooksOf(ctx, [user.id, otherId]);
  return relationTo(ctx.db, user.id, otherId);
}
/** Tell every market these users have live ads in to refresh (drops cached books, pushes 'book' to open pages). */
async function refreshBooksOf(ctx: Ctx, userIds: string[]) {
  const rows = await ctx.db.selectDistinct({ asset: ads.asset, fiat: ads.fiat }).from(ads).where(and(inArray(ads.userId, userIds), inArray(ads.status, ['active', 'paused'])));
  for (const r of rows) ctx.events.publish({ type: 'book.updated', room: `ads:${r.asset}:${r.fiat}`, payload: {} });
}
/** True if either user blocked the other. */
export async function isBlockedBetween(db: DbOrTx, a: string, b: string) {
  const [r] = await db.select({ x: userBlocks.blockerId }).from(userBlocks)
    .where(or(and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)), and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)))).limit(1);
  return !!r;
}
export async function relationTo(db: DbOrTx, me: string, other: string) {
  const [f] = await db.select({ x: userFollows.followerId }).from(userFollows).where(and(eq(userFollows.followerId, me), eq(userFollows.followeeId, other)));
  const [b] = await db.select({ x: userBlocks.blockerId }).from(userBlocks).where(and(eq(userBlocks.blockerId, me), eq(userBlocks.blockedId, other)));
  return { following: !!f, blocked: !!b };
}
/** People I follow / people I blocked, with display names. */
export async function listRelations(ctx: Ctx, user: User, kind: 'following' | 'blocked') {
  const rows = kind === 'following'
    ? await ctx.db.select({ id: users.id, displayName: users.displayName, lastSeenAt: users.lastSeenAt, since: userFollows.createdAt }).from(userFollows).innerJoin(users, eq(users.id, userFollows.followeeId)).where(eq(userFollows.followerId, user.id)).orderBy(desc(userFollows.createdAt))
    : await ctx.db.select({ id: users.id, displayName: users.displayName, lastSeenAt: users.lastSeenAt, since: userBlocks.createdAt }).from(userBlocks).innerJoin(users, eq(users.id, userBlocks.blockedId)).where(eq(userBlocks.blockerId, user.id)).orderBy(desc(userBlocks.createdAt));
  return rows.map((r) => ({ id: r.id, displayName: r.displayName ?? `user-${r.id.slice(0, 6)}`, online: isOnline(r.lastSeenAt), since: r.since }));
}
/** Ids the viewer must not see in the book (blocked either way) and ids they follow. */
export async function viewerSets(db: DbOrTx, viewerId: string) {
  const blocks = await db.select({ a: userBlocks.blockerId, b: userBlocks.blockedId }).from(userBlocks).where(or(eq(userBlocks.blockerId, viewerId), eq(userBlocks.blockedId, viewerId)));
  const hidden = new Set(blocks.map((r) => (r.a === viewerId ? r.b : r.a)));
  const follows = await db.select({ id: userFollows.followeeId }).from(userFollows).where(eq(userFollows.followerId, viewerId));
  return { hidden, following: new Set(follows.map((r) => r.id)) };
}

// ---------------------------------------------------------------- anti-phishing code
export async function setAntiPhishingCode(ctx: Ctx, user: User, code: string | null) {
  const c = code?.trim() || null;
  if (c && !/^[\p{L}\p{N} _-]{4,20}$/u.test(c)) throw new DomainError('VALIDATION', 'anti-phishing code: 4–20 letters or digits');
  await ctx.db.update(users).set({ antiPhishingCode: c }).where(eq(users.id, user.id));
  await audit(ctx.db, { actorType: 'user', actorId: user.id, action: 'user.anti_phishing', subjectType: 'user', subjectId: user.id, after: { set: !!c } });
  return { set: !!c };
}

// ---------------------------------------------------------------- referrals
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newRefCode = () => Array.from(randomBytes(7), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
export async function referralInfo(ctx: Ctx, user: User) {
  let [u] = await ctx.db.select({ code: users.referralCode }).from(users).where(eq(users.id, user.id));
  let code = u?.code;
  for (let i = 0; !code && i < 5; i++) {
    const c = newRefCode();
    try { await ctx.db.update(users).set({ referralCode: c }).where(and(eq(users.id, user.id), sql`${users.referralCode} is null`)); } catch { continue; }
    [u] = await ctx.db.select({ code: users.referralCode }).from(users).where(eq(users.id, user.id)); code = u?.code;
  }
  const [{ invited }] = await ctx.db.select({ invited: sql<number>`count(*)::int` }).from(users).where(eq(users.referredBy, user.id));
  const [{ traded }] = await ctx.db.select({ traded: sql<number>`count(distinct ${users.id})::int` }).from(users)
    .where(and(eq(users.referredBy, user.id), sql`exists (select 1 from orders o where (o.buyer_id = ${users.id} or o.seller_id = ${users.id}) and o.status = 'COMPLETED')`));
  return { code, invited, traded };
}
/** Links a new account to its referrer (ignored when the code is unknown). */
export async function applyReferral(db: DbOrTx, newUserId: string, code?: string | null) {
  const c = code?.trim().toUpperCase();
  if (!c || !/^[A-Z2-9]{7}$/.test(c)) return;
  const [ref] = await db.select({ id: users.id }).from(users).where(eq(users.referralCode, c));
  if (ref && ref.id !== newUserId) await db.update(users).set({ referredBy: ref.id }).where(and(eq(users.id, newUserId), sql`${users.referredBy} is null`));
}

// ---------------------------------------------------------------- price alerts
const MAX_ALERTS = 20;
export async function createPriceAlert(ctx: Ctx, user: User, input: { side: 'buy' | 'sell'; asset: string; fiat: string; price: string }) {
  const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(priceAlerts).where(and(eq(priceAlerts.userId, user.id), eq(priceAlerts.active, true)));
  if (n >= MAX_ALERTS) throw new DomainError('LIMIT_EXCEEDED', `at most ${MAX_ALERTS} active alerts`);
  const fd = await fiatDecimals(ctx.db, input.fiat);
  const [a] = await ctx.db.insert(priceAlerts).values({ userId: user.id, side: input.side, asset: input.asset, fiat: input.fiat, targetPrice: parsePrice(input.price, fd) }).returning();
  return presentAlert(a, fd);
}
export async function listPriceAlerts(ctx: Ctx, user: User) {
  const rows = await ctx.db.select().from(priceAlerts).where(eq(priceAlerts.userId, user.id)).orderBy(desc(priceAlerts.createdAt)).limit(50);
  const fds = new Map<string, number>();
  for (const r of rows) if (!fds.has(r.fiat)) fds.set(r.fiat, await fiatDecimals(ctx.db, r.fiat));
  return rows.map((r) => presentAlert(r, fds.get(r.fiat) ?? 2));
}
export async function deletePriceAlert(ctx: Ctx, user: User, id: string) {
  await ctx.db.delete(priceAlerts).where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, user.id)));
  return { ok: true };
}
function presentAlert(a: typeof priceAlerts.$inferSelect, fd: number) {
  return { id: a.id, side: a.side, asset: a.asset, fiat: a.fiat, price: formatPrice(a.targetPrice, fd), active: a.active, triggeredAt: a.triggeredAt, triggeredPrice: a.triggeredPrice === null ? null : formatPrice(a.triggeredPrice, fd) };
}
/**
 * Worker job: fire alerts whose target is met by the current best offer.
 * Buy alert: best sell offer price <= target. Sell alert: best buy offer price >= target.
 */
export async function checkPriceAlerts(ctx: Ctx) {
  const pending = await ctx.db.select().from(priceAlerts).where(eq(priceAlerts.active, true)).limit(5000);
  const best = new Map<string, bigint | null>();
  let fired = 0;
  for (const a of pending) {
    const key = `${a.side}:${a.asset}:${a.fiat}`;
    if (!best.has(key)) {
      const adSide = a.side === 'buy' ? 'sell' : 'buy';
      const [r] = await ctx.db.select({ p: a.side === 'buy' ? sql<string>`min(${ads.price})` : sql<string>`max(${ads.price})` }).from(ads)
        .innerJoin(users, eq(users.id, ads.userId))
        .where(and(eq(ads.asset, a.asset), eq(ads.fiat, a.fiat), eq(ads.side, adSide), eq(ads.status, 'active'), sql`${ads.remainingAmount} > 0`, eq(users.status, 'active'), eq(users.awayMode, false)));
      best.set(key, r?.p ? BigInt(r.p) : null);
    }
    const p = best.get(key);
    if (p === null || p === undefined) continue;
    const hit = a.side === 'buy' ? p <= a.targetPrice : p >= a.targetPrice;
    if (!hit) continue;
    await ctx.db.update(priceAlerts).set({ active: false, triggeredAt: ctx.now(), triggeredPrice: p }).where(and(eq(priceAlerts.id, a.id), eq(priceAlerts.active, true)));
    const fd = await fiatDecimals(ctx.db, a.fiat);
    await notify(ctx, ctx.db, a.userId, 'price_alert', { side: a.side, asset: a.asset, fiat: a.fiat, price: formatPrice(p, fd), target: formatPrice(a.targetPrice, fd) });
    fired++;
  }
  return { checked: pending.length, fired };
}

// ---------------------------------------------------------------- large trades (OTC desk)
export async function createOtcRequest(ctx: Ctx, user: User, input: { side: 'buy' | 'sell'; asset: string; fiat: string; fiatAmount: string; note?: string }) {
  const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(otcRequests).where(and(eq(otcRequests.userId, user.id), eq(otcRequests.status, 'open')));
  if (n >= 3) throw new DomainError('LIMIT_EXCEEDED', 'you already have open large-trade requests');
  const [r] = await ctx.db.insert(otcRequests).values({ userId: user.id, side: input.side, asset: input.asset, fiat: input.fiat, fiatAmount: input.fiatAmount, note: (input.note ?? '').slice(0, 1000) }).returning();
  await audit(ctx.db, { actorType: 'user', actorId: user.id, action: 'otc.requested', subjectType: 'otc_request', subjectId: r.id, after: { side: r.side, asset: r.asset, fiat: r.fiat, fiatAmount: r.fiatAmount } });
  return r;
}
export async function listOtcRequests(ctx: Ctx, opts: { userId?: string; status?: string[] } = {}) {
  const conds = [] as ReturnType<typeof eq>[];
  if (opts.userId) conds.push(eq(otcRequests.userId, opts.userId));
  if (opts.status?.length) conds.push(inArray(otcRequests.status, opts.status));
  return ctx.db.select({ r: otcRequests, email: users.email, displayName: users.displayName }).from(otcRequests).innerJoin(users, eq(users.id, otcRequests.userId))
    .where(conds.length ? and(...conds) : undefined).orderBy(desc(otcRequests.createdAt)).limit(200)
    .then((rows) => rows.map(({ r, email, displayName }) => ({ ...r, email, displayName })));
}
export async function setOtcStatus(ctx: Ctx, adminId: string, id: string, status: 'open' | 'contacted' | 'closed') {
  const [r] = await ctx.db.update(otcRequests).set({ status, updatedAt: ctx.now() }).where(eq(otcRequests.id, id)).returning();
  if (!r) throw new DomainError('NOT_FOUND', 'request not found');
  await audit(ctx.db, { actorType: 'admin', actorId: adminId, action: 'otc.status', subjectType: 'otc_request', subjectId: id, after: { status } });
  if (status === 'contacted') await notify(ctx, ctx.db, r.userId, 'otc_update', { requestId: id, status });
  return r;
}
