/** Order chat with attachments (virus-scanned, private storage). */
import { chatMessages, orders, and, eq, gt, asc } from '@p2p/db';
import { DomainError } from '@p2p/shared';
import { randomToken } from './crypto';
import type { Ctx } from './context';
import { runTx } from './context';
import { filterChat } from './chat-filter';
import { flag } from './risk';
import { notify } from './notifications';
import type { User } from './auth';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

async function participantOrder(ctx: Ctx, userId: string, orderId: string) {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId));
  if (!o || (o.buyerId !== userId && o.sellerId !== userId)) throw new DomainError('NOT_FOUND', 'order not found');
  return o;
}

/** Upload: magic-byte type check, size limit, virus scan, then store under a private random key. */
export async function uploadAttachment(ctx: Ctx, user: User, orderId: string, body: Buffer, contentType: string) {
  await participantOrder(ctx, user.id, orderId);
  if (body.length === 0 || body.length > MAX_BYTES) throw new DomainError('VALIDATION', 'file too large (max 10MB)');
  const sniffed = sniff(body);
  if (!sniffed || !ALLOWED.has(sniffed) || sniffed !== contentType) throw new DomainError('VALIDATION', 'unsupported file type');
  const scan = await ctx.providers.scanner.scan(body);
  if (!scan.clean) throw new DomainError('VALIDATION', 'file rejected by virus scan');
  const key = `orders/${orderId}/${randomToken(18)}`;
  await ctx.providers.storage.put(key, body, sniffed);
  return { key, contentType: sniffed };
}
export function sniff(b: Buffer): string | null {
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (b.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}

export async function sendChatMessage(ctx: Ctx, user: User, orderId: string, body: string, attachmentKey?: string) {
  const o = await participantOrder(ctx, user.id, orderId);
  if (attachmentKey && !attachmentKey.startsWith(`orders/${orderId}/`)) throw new DomainError('VALIDATION', 'invalid attachment');
  const text = body.trim();
  if (!text && !attachmentKey) throw new DomainError('VALIDATION', 'empty message');
  const f = filterChat(text);
  if (f.blocked) {
    // Stored (hidden) for arbiters, flagged, never delivered to the counterparty.
    await flag(ctx.db, 'user', user.id, 'OFF_PLATFORM_CHAT', 'medium', { orderId, reasons: f.reasons });
    await ctx.db.insert(chatMessages).values({ orderId, senderId: user.id, body: text, flagged: true });
    throw new DomainError('FORBIDDEN', 'message blocked: keep communication and payment on-platform', { reasons: f.reasons });
  }
  return runTx(ctx, async (t) => {
    const [m] = await t.tx.insert(chatMessages).values({ orderId, senderId: user.id, body: text, attachmentKey, attachmentStatus: attachmentKey ? 'clean' : null }).returning();
    const other = o.buyerId === user.id ? o.sellerId : o.buyerId;
    t.emit({ type: 'chat.message', orderId, payload: presentMessage(m) });
    await notify(t, t.tx, other, 'chat_message', { orderId });
    return presentMessage(m);
  });
}

export function presentMessage(m: typeof chatMessages.$inferSelect) {
  return { id: m.id.toString(), orderId: m.orderId, senderId: m.senderId, body: m.body, attachmentKey: m.attachmentKey, system: m.system, createdAt: m.createdAt };
}
export async function listChat(ctx: Ctx, user: User, orderId: string, afterId?: bigint) {
  await participantOrder(ctx, user.id, orderId);
  const conds = [eq(chatMessages.orderId, orderId), eq(chatMessages.flagged, false)];
  if (afterId) conds.push(gt(chatMessages.id, afterId));
  const rows = await ctx.db.select().from(chatMessages).where(and(...conds)).orderBy(asc(chatMessages.id)).limit(500);
  return rows.map(presentMessage);
}
export async function readAttachment(ctx: Ctx, user: User, orderId: string, key: string) {
  await participantOrder(ctx, user.id, orderId);
  if (!key.startsWith(`orders/${orderId}/`)) throw new DomainError('NOT_FOUND', 'not found');
  const body = await ctx.providers.storage.get(key);
  if (!body) throw new DomainError('NOT_FOUND', 'not found');
  return { body, contentType: sniff(body) ?? 'application/octet-stream' };
}
