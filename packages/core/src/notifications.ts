/** In-app notifications + external channels (Telegram, email). */
import { notifications, users, and, eq, isNull, desc, lt, type DbOrTx } from '@p2p/db';
import type { Ctx, TxCtx } from './context';

export async function notify(t: TxCtx | Ctx, db: DbOrTx, userId: string, type: string, payload: Record<string, unknown>) {
  const [n] = await db.insert(notifications).values({ userId, type, payload }).returning({ id: notifications.id });
  const deliver = async () => {
    t.events.publish({ type: 'notification', userIds: [userId], payload: { id: n.id.toString(), kind: type, ...payload } });
    const [u] = await t.db.select({ tgId: users.tgId, email: users.email, emailOk: users.emailVerifiedAt, locale: users.locale }).from(users).where(eq(users.id, userId));
    if (!u) return;
    const msg = { template: type, params: payload, locale: u.locale };
    // External channels are best-effort; failures never affect the trade.
    if (u.tgId) await t.providers.notifier.send({ channel: 'telegram', to: u.tgId, ...msg }).catch(() => null);
    if (u.email && u.emailOk && EMAIL_TYPES.has(type)) await t.providers.notifier.send({ channel: 'email', to: u.email, ...msg }).catch(() => null);
  };
  if ('afterCommit' in t) t.afterCommit(deliver); else await deliver();
}
const EMAIL_TYPES = new Set(['order_completed', 'order_disputed', 'dispute_resolved', 'withdrawal_status', 'deposit_credited', 'security_alert']);

export async function listNotifications(db: DbOrTx, userId: string, before?: bigint) {
  const conds = [eq(notifications.userId, userId)];
  if (before) conds.push(lt(notifications.id, before));
  return db.select().from(notifications).where(and(...conds)).orderBy(desc(notifications.id)).limit(50);
}
export async function markNotificationsRead(db: DbOrTx, userId: string) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
