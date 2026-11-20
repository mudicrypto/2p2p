import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { orders, eq } from '@p2p/db';
import { makeCtx, mkUser, sellAd, ensureSeed, uniq } from './helpers';
import {
  createOrder, markPaid, releaseOrder, uploadAttachment, listReceiptChecks, sendChatMessage, listChat, presentOrder, getOrderFor,
  scamWarning, receiptMetadata,
} from '../src';

const ctx = makeCtx();
beforeAll(() => ensureSeed(ctx));
afterAll(() => ctx.close());

const png = (extra = '') => Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'), Buffer.from(extra, 'latin1')]);
const jpeg = (extra: string) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.from(extra, 'latin1'), Buffer.from([0xff, 0xd9])]);

describe('trade safety', () => {
  it('receipt metadata: editing software and embedded dates', () => {
    expect(receiptMetadata(jpeg('Exif\0\0 Adobe Photoshop 25.1 (Windows) 2026:11:01 10:00:00'))).toMatchObject({ editor: 'Photoshop' });
    expect(receiptMetadata(jpeg('Exif\0\0 2026:11:01 10:00:00')).earliest?.toISOString()).toBe('2026-11-01T10:00:00.000Z');
    expect(receiptMetadata(png()).editor).toBeUndefined();
  });

  it('receipt checks: duplicate files, edited images and old images are flagged; reader compares the amount and names', async () => {
    const { maker, ad } = await sellAd(ctx, { price: '0.86' });
    const buyer = await mkUser(ctx);
    const o1 = await createOrder(ctx, buyer, { adId: ad.id, fiatAmount: '20' });
    const unique = png(uniq());
    const first = await uploadAttachment(ctx, buyer, o1.id, unique, 'image/png');
    const o2 = await createOrder(ctx, buyer, { adId: ad.id, fiatAmount: '30' });
    await uploadAttachment(ctx, buyer, o2.id, unique, 'image/png'); // same file reused on another order
    await uploadAttachment(ctx, buyer, o2.id, jpeg(`${uniq()} Snapseed 2001:01:01 00:00:00`), 'image/jpeg');
    const r1 = await listReceiptChecks(ctx, maker.id, o1.id);
    expect(r1.receipts.find((r) => r.fileKey === first.key)?.flags).toEqual([]);
    const r2 = await listReceiptChecks(ctx, maker.id, o2.id);
    expect(r2.receipts.map((r) => r.flags).sort()).toEqual([['duplicate_receipt'], ['edited:Snapseed', 'older_than_order']].sort());
    // Seller uploads aren't payment proofs.
    await uploadAttachment(ctx, maker, o2.id, png(uniq()), 'image/png');
    expect((await listReceiptChecks(ctx, buyer.id, o2.id)).receipts).toHaveLength(2);
    const outsider = await mkUser(ctx);
    await expect(listReceiptChecks(ctx, outsider.id, o2.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const saved = ctx.providers.receiptReader;
    try {
      ctx.providers.receiptReader = { read: async () => ({ amount: '25.00', payeeName: 'Someone Else' }) };
      await uploadAttachment(ctx, buyer, o1.id, png(uniq()), 'image/png');
      const flags = (await listReceiptChecks(ctx, maker.id, o1.id)).receipts.flatMap((r) => r.flags);
      expect(flags).toEqual(expect.arrayContaining(['amount_mismatch', 'payee_mismatch']));
    } finally { ctx.providers.receiptReader = saved; }
  });

  it('scam phrases are delivered with a caution, normal messages are not', async () => {
    expect(scamWarning('please release first, my bank is slow')).toBe('release_first');
    expect(scamWarning('The payment is pending at my bank')).toBe('payment_pending');
    expect(scamWarning('refund it to my other account please')).toBe('other_account');
    expect(scamWarning('my brother will pay')).toBe('third_party');
    expect(scamWarning('you must pay a verification fee')).toBe('fake_fee');
    expect(scamWarning('Hi, sending the SEPA transfer now')).toBeNull();
    const { maker, ad } = await sellAd(ctx, { price: '0.87' });
    const buyer = await mkUser(ctx);
    const o = await createOrder(ctx, buyer, { adId: ad.id, fiatAmount: '20' });
    await sendChatMessage(ctx, buyer, o.id, 'Can you release first? payment is pending');
    const msgs = await listChat(ctx, maker, o.id);
    expect(msgs.at(-1)).toMatchObject({ warning: 'release_first' });
  });

  it('seller sees buyer risk signals; release records the payer-name answer', async () => {
    const { maker, ad } = await sellAd(ctx, { price: '0.88' });
    const buyer = await mkUser(ctx, { tier: 0, createdAt: new Date() });
    const o = await createOrder(ctx, buyer, { adId: ad.id, fiatAmount: '20' });
    const sellerView = await presentOrder(ctx, await getOrderFor(ctx, maker.id, o.id), maker.id);
    expect(sellerView.buyerSignals).toEqual(expect.arrayContaining(['new_account', 'first_trade', 'unverified']));
    expect(sellerView.buyerVerifiedName).toBeNull();
    const buyerView = await presentOrder(ctx, await getOrderFor(ctx, buyer.id, o.id), buyer.id);
    expect(buyerView.buyerSignals).toBeUndefined();

    await markPaid(ctx, buyer, o.id);
    await releaseOrder(ctx, maker, o.id, undefined, { skip2fa: true, payerNameConfirmed: true });
    const [row] = await ctx.db.select().from(orders).where(eq(orders.id, o.id));
    expect(row).toMatchObject({ status: 'COMPLETED', payerNameConfirmed: true });
  });
});
