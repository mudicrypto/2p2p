import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { notifications, riskFlags, eq, and } from '@p2p/db';
import { makeCtx, mkUser, sellAd, ensureSeed } from './helpers';
import { createOrder, markPaid, releaseOrder, sendChatMessage, listChat, uploadAttachment, readAttachment, filterChat, leaveFeedback, publicProfile } from '../src';

const ctx = makeCtx();
beforeAll(() => ensureSeed(ctx));
afterAll(() => ctx.close());
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

describe('M3 chat, notifications, reputation', () => {
  it('chat filter blocks off-platform pushes in several languages', () => {
    for (const bad of ['call me +49 151 1234 5678', 'msg me on t . me/scammer', 'add @super_trader on telegram', 'lets pay outside the platform', 'whatsapp me', 'напиши мне в телеграм', 'pagamos fora da plataforma'])
      expect(filterChat(bad).blocked, bad).toBe(true);
    for (const ok of ['sent the payment, ref P2PABCD1234', 'please wait 5 minutes', 'Bank: Sparkasse, amount 92 EUR']) expect(filterChat(ok).blocked, ok).toBe(false);
  });

  it('chat with attachments, blocked messages hidden and flagged, notifications + reputation + feedback', async () => {
    const { maker, ad } = await sellAd(ctx);
    const buyer = await mkUser(ctx, { tier: 1 });
    const o = await createOrder(ctx, buyer, { adId: ad.id, fiatAmount: '50' });
    const up = await uploadAttachment(ctx, buyer, o.id, PNG, 'image/png');
    await expect(uploadAttachment(ctx, buyer, o.id, Buffer.from('MZ\x90\x00 not an image'), 'image/png')).rejects.toMatchObject({ code: 'VALIDATION' });
    await sendChatMessage(ctx, buyer, o.id, 'paid, receipt attached', up.key);
    await expect(sendChatMessage(ctx, buyer, o.id, 'add me on whatsapp')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const chat = await listChat(ctx, maker, o.id);
    expect(chat.map((c) => c.body)).toEqual(['paid, receipt attached']);
    expect((await readAttachment(ctx, maker, o.id, up.key)).contentType).toBe('image/png');
    const stranger = await mkUser(ctx);
    await expect(listChat(ctx, stranger, o.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await ctx.db.select().from(riskFlags).where(and(eq(riskFlags.subjectId, buyer.id), eq(riskFlags.code, 'OFF_PLATFORM_CHAT')))).toHaveLength(1);

    await markPaid(ctx, buyer, o.id);
    await releaseOrder(ctx, maker, o.id, undefined, { skip2fa: true });
    const types = (await ctx.db.select().from(notifications).where(eq(notifications.userId, maker.id))).map((n) => n.type);
    expect(types).toEqual(expect.arrayContaining(['order_created', 'chat_message', 'order_paid', 'order_completed']));
    await leaveFeedback(ctx, buyer, o.id, true, 'fast release');
    await expect(leaveFeedback(ctx, buyer, o.id, true)).rejects.toMatchObject({ code: 'CONFLICT' });
    const p = await publicProfile(ctx, maker.id);
    expect(p).toMatchObject({ trades30d: 1, completionRateBps: 10000, positiveFeedback: 1, kycTier: 2 });
    expect(p.recentFeedback[0].comment).toBe('fast release');
  });
});
