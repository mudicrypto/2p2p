/**
 * Telegram alerts: link a Telegram chat to an account with a one-time code (t.me/<bot>?start=<code>),
 * then every notification also arrives in Telegram. Updates come from the bot webhook.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { telegramLinks, users, and, eq, gt, ne, sql } from '@p2p/db';
import { DomainError } from '@p2p/shared';
import type { Ctx } from './context';
import { audit } from './audit';
import { randomToken } from './crypto';
import { telegramBotToken } from './auth';
import type { User } from './auth';

const botUsername = () => process.env.TELEGRAM_BOT_USERNAME ?? '';
const realBot = () => !!telegramBotToken() && !/^(disabled-|mock-)/.test(telegramBotToken()) && !!botUsername();
export const telegramAlertsEnabled = () => realBot();
/** Secret Telegram sends back in X-Telegram-Bot-Api-Secret-Token (derived from the bot token, so nothing extra to store). */
export const telegramWebhookSecret = () => createHmac('sha256', telegramBotToken() || 'none').update('parley-webhook').digest('hex').slice(0, 48);
export const checkWebhookSecret = (got?: string) => {
  const want = Buffer.from(telegramWebhookSecret()); const g = Buffer.from(got ?? '');
  return g.length === want.length && timingSafeEqual(g, want);
};

export async function telegramStatus(ctx: Ctx, user: User) {
  const [u] = await ctx.db.select({ tgId: users.tgId }).from(users).where(eq(users.id, user.id));
  return { available: realBot(), linked: !!u?.tgId, bot: botUsername() || null };
}
export async function createTelegramLink(ctx: Ctx, user: User) {
  if (!realBot()) throw new DomainError('UNAVAILABLE', 'Telegram alerts are not configured');
  const code = randomToken(12).replace(/[^A-Za-z0-9]/g, 'x').slice(0, 16);
  await ctx.db.delete(telegramLinks).where(eq(telegramLinks.userId, user.id));
  await ctx.db.insert(telegramLinks).values({ code, userId: user.id, expiresAt: new Date(ctx.now().getTime() + 15 * 60_000) });
  return { code, url: `https://t.me/${botUsername()}?start=${code}`, expiresInMin: 15 };
}
/** Unlinking is allowed only for accounts that can still sign in another way (email). */
export async function unlinkTelegram(ctx: Ctx, user: User) {
  const [u] = await ctx.db.select({ email: users.email }).from(users).where(eq(users.id, user.id));
  if (!u?.email) throw new DomainError('CONFLICT', 'this account signs in with Telegram; it cannot be unlinked');
  await ctx.db.update(users).set({ tgId: null }).where(eq(users.id, user.id));
  await audit(ctx.db, { actorType: 'user', actorId: user.id, action: 'telegram.unlinked', subjectType: 'user', subjectId: user.id });
  return { linked: false };
}

type TgUpdate = { message?: { chat?: { id?: number | string; type?: string }; text?: string } };
/** Bot webhook: "/start <code>" links the chat, "/stop" unlinks it. Replies go straight to the chat. */
export async function handleTelegramUpdate(ctx: Ctx, update: TgUpdate) {
  const chatId = update.message?.chat?.id; const text = (update.message?.text ?? '').trim();
  if (!chatId || update.message?.chat?.type !== 'private') return { ok: true };
  const reply = (template: string) => ctx.providers.notifier.send({ channel: 'telegram', to: String(chatId), template, params: {}, locale: 'en' }).catch(() => null);
  const m = /^\/start(?:\s+([A-Za-z0-9]{8,32}))?$/.exec(text);
  if (m?.[1]) {
    const [l] = await ctx.db.select().from(telegramLinks).where(and(eq(telegramLinks.code, m[1]), gt(telegramLinks.expiresAt, ctx.now())));
    if (!l) { await reply('tg_link_invalid'); return { ok: true }; }
    const [other] = await ctx.db.select({ id: users.id }).from(users).where(and(eq(users.tgId, String(chatId)), ne(users.id, l.userId)));
    if (other) { await reply('tg_link_taken'); return { ok: true }; }
    await ctx.db.update(users).set({ tgId: String(chatId) }).where(eq(users.id, l.userId));
    await ctx.db.delete(telegramLinks).where(eq(telegramLinks.code, m[1]));
    await audit(ctx.db, { actorType: 'user', actorId: l.userId, action: 'telegram.linked', subjectType: 'user', subjectId: l.userId });
    await reply('tg_linked');
  } else if (text === '/stop') {
    // Only unlink accounts that still have email sign-in (Telegram-only accounts keep their login).
    await ctx.db.update(users).set({ tgId: null }).where(and(eq(users.tgId, String(chatId)), sql`${users.email} is not null`));
    await reply('tg_unlinked');
  } else await reply('tg_help');
  return { ok: true };
}
