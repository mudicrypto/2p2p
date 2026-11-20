import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { orders, users, eq } from '@p2p/db';
import { makeCtx, mkUser, sellAd, ensureSeed, uniq } from './helpers';
import {
  promoteAd, orderBook, merchantStats, bulkAds, merchantPage, snapshotPrices, priceHistory, createOrder, setNickname, balanceOf, userAcct, setConfig,
  createTelegramLink, handleTelegramUpdate, telegramStatus, unlinkTelegram, checkWebhookSecret, telegramWebhookSecret,
} from '../src';

const ctx = makeCtx();
beforeAll(() => ensureSeed(ctx));
afterAll(() => ctx.close());

describe('merchant growth tools', () => {
  it('promoted ads: charged per day, shown in promoted slots only when they match the filters', async () => {
    await setConfig(ctx.db, 'promotion', { pricePerDayUsdt: '2', maxDays: 30, slots: 2 });
    const { maker, ad } = await sellAd(ctx, { price: '0.99' });
    const before = await balanceOf(ctx.db, userAcct(maker.id, 'USDT'));
    const r = await promoteAd(ctx, maker, ad.id, 3);
    expect(r.charged).toBe('6');
    expect(before - (await balanceOf(ctx.db, userAcct(maker.id, 'USDT')))).toBe(6_000_000n);
    const book = await orderBook(ctx, { side: 'buy', asset: 'USDT', fiat: 'EUR', limit: 100 });
    expect(book.promoted.map((a) => a.id)).toContain(ad.id);
    expect(book.promoted.find((a) => a.id === ad.id)).toMatchObject({ promoted: true });
    const usd = await orderBook(ctx, { side: 'buy', asset: 'USDT', fiat: 'USD', limit: 100 });
    expect(usd.promoted.map((a) => a.id)).not.toContain(ad.id);
    await expect(promoteAd(ctx, maker, ad.id, 31)).rejects.toMatchObject({ code: 'VALIDATION' });
    const poor = await mkUser(ctx);
    await expect(promoteAd(ctx, poor, ad.id, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' }); // not their ad
  });

  it('merchant analytics: per-ad orders, completion and volume', async () => {
    const { maker, ad } = await sellAd(ctx, { price: '0.9' });
    const b = await mkUser(ctx);
    const o1 = await createOrder(ctx, b, { adId: ad.id, fiatAmount: '90' });
    await createOrder(ctx, b, { adId: ad.id, fiatAmount: '45' });
    await ctx.db.update(orders).set({ status: 'COMPLETED', paidAt: new Date(Date.now() - 120_000), releasedAt: new Date(), usdValueCents: 9800n }).where(eq(orders.id, o1.id));
    const s = await merchantStats(ctx, maker, 30);
    const row = s.perAd.find((r) => r.adId === ad.id)!;
    expect(row).toMatchObject({ orders: 2, completed: 1, completionRateBps: 5000, fiatVolume: '90', cryptoVolume: '100', usdVolume: '98.00' });
    expect(row.avgReleaseSec).toBeGreaterThanOrEqual(119);
    expect(s.totals.orders).toBe(2);
  });

  it('bulk ad actions report per-ad results', async () => {
    const { maker, ad } = await sellAd(ctx, { price: '0.91' });
    const { ad: other } = await sellAd(ctx, { price: '0.92' });
    const r = await bulkAds(ctx, maker, [ad.id, other.id], { action: 'pause' });
    expect(r.results).toEqual([{ adId: ad.id, ok: true }, { adId: other.id, ok: false, error: 'NOT_FOUND' }]);
    expect((await bulkAds(ctx, maker, [ad.id], { action: 'price', price: '0.915' })).results[0].ok).toBe(true);
    expect((await bulkAds(ctx, maker, [ad.id], { action: 'margin', marginBps: 50 })).results[0]).toMatchObject({ ok: false, error: 'VALIDATION' });
    expect((await bulkAds(ctx, maker, [ad.id], { action: 'resume' })).results[0].ok).toBe(true);
  });

  it('pay-with-link page finds a merchant by nickname and lists their live ads', async () => {
    const { maker, ad } = await sellAd(ctx, { price: '0.93' });
    const nick = `Shop ${uniq().slice(-6)}`;
    await setNickname(ctx, maker, nick);
    const p = await merchantPage(ctx, nick.toLowerCase());
    expect(p.profile.id).toBe(maker.id);
    expect(p.ads.map((a) => a.id)).toEqual([ad.id]);
    await expect(merchantPage(ctx, 'nobody-here-xyz')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('price history snapshots best prices per market', async () => {
    await sellAd(ctx, { price: '0.94' });
    await snapshotPrices(ctx);
    const h = await priceHistory(ctx, 'USDT', 'EUR', 1);
    expect(h.points.length).toBeGreaterThan(0);
    expect(Number(h.points.at(-1)!.bestAsk)).toBeGreaterThan(0);
  });
});

describe('Telegram alerts', () => {
  const env = { ...process.env };
  afterAll(() => { process.env.TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN; process.env.TELEGRAM_BOT_USERNAME = env.TELEGRAM_BOT_USERNAME; });
  it('links a chat with a one-time code, refuses taken chats, unlinks', async () => {
    process.env.TELEGRAM_BOT_USERNAME = '';
    const u = await mkUser(ctx);
    expect((await telegramStatus(ctx, u)).available).toBe(false);
    await expect(createTelegramLink(ctx, u)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    process.env.TELEGRAM_BOT_TOKEN = '123:real-looking'; process.env.TELEGRAM_BOT_USERNAME = 'parley_test_bot';
    expect(checkWebhookSecret(telegramWebhookSecret())).toBe(true);
    expect(checkWebhookSecret('nope')).toBe(false);
    const { code, url } = await createTelegramLink(ctx, u);
    expect(url).toBe(`https://t.me/parley_test_bot?start=${code}`);
    const chat = String(Date.now());
    await handleTelegramUpdate(ctx, { message: { chat: { id: chat, type: 'private' }, text: `/start ${code}` } });
    expect((await ctx.db.select({ t: users.tgId }).from(users).where(eq(users.id, u.id)))[0].t).toBe(chat);
    // The code is single-use; another account can't take the same chat.
    const v = await mkUser(ctx);
    const l2 = await createTelegramLink(ctx, v);
    await handleTelegramUpdate(ctx, { message: { chat: { id: chat, type: 'private' }, text: `/start ${l2.code}` } });
    expect((await ctx.db.select({ t: users.tgId }).from(users).where(eq(users.id, v.id)))[0].t).toBeNull();
    expect((await unlinkTelegram(ctx, u)).linked).toBe(false);
  });
});
