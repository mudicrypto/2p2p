import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { users, ads, chatMessages, notifications, eq, and } from '@p2p/db';
import { makeCtx, mkUser, sellAd, ensureSeed, uniq, sepa, fund } from './helpers';
import {
  setNickname, validateNickname, setAwayMode, follow, block, relationTo, listRelations, touchLastSeen, orderBook, createOrder, createAd, updateAd,
  referralInfo, signupEmail, setAntiPhishingCode, createPriceAlert, listPriceAlerts, checkPriceAlerts, deletePriceAlert,
  createOtcRequest, listOtcRequests, setOtcStatus, publicProfile, setBusinessHours, applyBusinessHours, withinBusinessHours, validateBusinessHours, type User,
} from '../src';

const ctx = makeCtx();
beforeAll(() => ensureSeed(ctx));
afterAll(() => ctx.close());

const book = (q: Partial<Parameters<typeof orderBook>[1]> = {}, viewer?: string) =>
  orderBook(ctx, { side: 'buy', asset: 'USDT', fiat: 'EUR', limit: 100, ...q }, viewer).then((r) => r.items);
const ids = (items: Array<{ id: string }>) => items.map((a) => a.id);

describe('P2P community features', () => {
  it('nicknames: validated, unique (case-insensitive), no impersonation', async () => {
    const a = await mkUser(ctx); const b = await mkUser(ctx);
    const name = `Trader ${uniq().slice(0, 8)}`;
    expect((await setNickname(ctx, a, name)).displayName).toBe(name);
    await expect(setNickname(ctx, b, name.toUpperCase())).rejects.toMatchObject({ code: 'CONFLICT' });
    for (const bad of ['ab', 'parley support', 'Official_Desk', 'user-abc123', 'x'.repeat(21), '-dash']) expect(() => validateNickname(bad)).toThrow();
    expect((await publicProfile(ctx, a.id)).displayName).toBe(name);
    expect((await setNickname(ctx, a, name)).displayName).toBe(name); // re-saving your own name is fine
  });

  it('away mode hides all ads and blocks new orders until switched off', async () => {
    const { maker, ad } = await sellAd(ctx, { price: '0.811' });
    const taker = await mkUser(ctx);
    await setAwayMode(ctx, maker, true);
    expect(ids(await book())).not.toContain(ad.id);
    await expect(createOrder(ctx, taker, { adId: ad.id, fiatAmount: '20' })).rejects.toMatchObject({ code: 'AD_UNAVAILABLE' });
    await setAwayMode(ctx, maker, false);
    expect(ids(await book())).toContain(ad.id);
  });

  it('block hides ads both ways and forbids trading; follow powers the "following" filter', async () => {
    const { maker, ad } = await sellAd(ctx, { price: '0.812' });
    const me = await mkUser(ctx);
    await follow(ctx, me, maker.id, true);
    expect(ids(await book({ followingOnly: true }, me.id))).toEqual([ad.id]);
    expect((await book({}, me.id)).find((a) => a.id === ad.id)?.following).toBe(true);
    expect(await relationTo(ctx.db, me.id, maker.id)).toEqual({ following: true, blocked: false });

    await block(ctx, me, maker.id, true); // blocking also unfollows
    expect(await relationTo(ctx.db, me.id, maker.id)).toEqual({ following: false, blocked: true });
    expect(ids(await book({}, me.id))).not.toContain(ad.id);
    expect(ids(await book({}))).toContain(ad.id); // others still see it
    await expect(createOrder(ctx, me, { adId: ad.id, fiatAmount: '20' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await listRelations(ctx, me, 'blocked')).map((r) => r.id)).toEqual([maker.id]);
    // The blocked side cannot see or trade with the blocker's ads either.
    await fund(ctx, me, 'USDT', '100');
    const pm = await sepa(ctx, me);
    const myAd = await createAd(ctx, me, { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '0.813', minAmount: '10', maxAmount: '50', totalAmount: '50', paymentMethodIds: [pm.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0, acceptReversible: false });
    expect(ids(await book({}, maker.id))).not.toContain(myAd.id);
    await block(ctx, me, maker.id, false);
    expect(ids(await book({}, me.id))).toContain(ad.id);
    await expect(follow(ctx, me, me.id, true)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('online status, online-only filter and nickname search', async () => {
    const { maker, ad } = await sellAd(ctx, { price: '0.814' });
    const nick = `Zed ${uniq().slice(0, 6)}`;
    await setNickname(ctx, maker, nick);
    expect(ids(await book({ onlineOnly: true }))).not.toContain(ad.id);
    await touchLastSeen(ctx.db, maker.id);
    const items = await book({ onlineOnly: true });
    expect(ids(items)).toContain(ad.id);
    expect(items.find((a) => a.id === ad.id)?.advertiser?.online).toBe(true);
    expect((await publicProfile(ctx, maker.id)).online).toBe(true);
    expect(ids(await book({ q: nick.slice(0, 6).toLowerCase() }))).toEqual([ad.id]);
    expect(await book({ q: '%' })).toEqual([]); // LIKE wildcards are matched literally
  });

  it('ad conditions: minimum account age and completed trades are enforced', async () => {
    const { maker, ad } = await sellAd(ctx, { price: '0.815' });
    await updateAd(ctx, maker, ad.id, { minAccountAgeDays: 60 });
    const young = await mkUser(ctx, { createdAt: new Date(Date.now() - 10 * 86400_000) });
    await expect(createOrder(ctx, young, { adId: ad.id, fiatAmount: '20' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await updateAd(ctx, maker, ad.id, { minAccountAgeDays: 0, minCompletedTrades: 5 });
    const old = await mkUser(ctx, { createdAt: new Date(Date.now() - 400 * 86400_000) });
    await expect(createOrder(ctx, old, { adId: ad.id, fiatAmount: '20' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await updateAd(ctx, maker, ad.id, { minCompletedTrades: 0 });
    expect((await createOrder(ctx, old, { adId: ad.id, fiatAmount: '20' })).status).toBe('AWAITING_PAYMENT');
  });

  it('auto-reply opens the chat; off-platform contact is not allowed in it; ads are editable', async () => {
    const { maker, ad } = await sellAd(ctx, { price: '0.816' });
    await expect(updateAd(ctx, maker, ad.id, { autoReply: 'message me on telegram @cashfast' })).rejects.toMatchObject({ code: 'VALIDATION' });
    const u = await updateAd(ctx, maker, ad.id, { autoReply: 'Hi! Send to the IBAN shown, include the reference.', terms: 'SEPA only', minAmount: '20', maxAmount: '300', price: '0.817' });
    expect(u.autoReply).toMatch(/^Hi!/);
    const [row] = await ctx.db.select().from(ads).where(eq(ads.id, ad.id));
    expect(row.terms).toBe('SEPA only');
    await expect(updateAd(ctx, maker, ad.id, { minAmount: '500' })).rejects.toMatchObject({ code: 'VALIDATION' }); // min > max
    const taker = await mkUser(ctx);
    const o = await createOrder(ctx, taker, { adId: ad.id, fiatAmount: '50' });
    const msgs = await ctx.db.select().from(chatMessages).where(eq(chatMessages.orderId, o.id));
    expect(msgs.map((m) => [m.senderId, m.body])).toEqual([[maker.id, 'Hi! Send to the IBAN shown, include the reference.']]);
  });

  it('referrals: code is created once; sign-ups with it are counted', async () => {
    const r = await mkUser(ctx);
    const info = await referralInfo(ctx, r);
    expect(info.code).toMatch(/^[A-Z2-9]{7}$/);
    expect((await referralInfo(ctx, r)).code).toBe(info.code);
    await signupEmail(ctx, { email: `${uniq()}@t.io`, password: 'correct horse battery', country: 'DE', ref: info.code! });
    await signupEmail(ctx, { email: `${uniq()}@t.io`, password: 'correct horse battery', country: 'DE', ref: 'NOPE123' }); // unknown code ignored
    expect((await referralInfo(ctx, r)).invited).toBe(1);
  });

  it('anti-phishing code: validated and stored', async () => {
    const u = await mkUser(ctx);
    await expect(setAntiPhishingCode(ctx, u, 'ab')).rejects.toMatchObject({ code: 'VALIDATION' });
    await setAntiPhishingCode(ctx, u, 'Blue Tiger 7');
    const [row] = await ctx.db.select({ c: users.antiPhishingCode }).from(users).where(eq(users.id, u.id));
    expect(row.c).toBe('Blue Tiger 7');
  });

  it('price alerts fire once when the best offer reaches the target', async () => {
    const u = await mkUser(ctx);
    const hi = await createPriceAlert(ctx, u, { side: 'buy', asset: 'USDT', fiat: 'EUR', price: '0.80' }); // below every offer
    const lo = await createPriceAlert(ctx, u, { side: 'buy', asset: 'USDT', fiat: 'EUR', price: '5' });    // any offer meets it
    await checkPriceAlerts(ctx);
    const list = await listPriceAlerts(ctx, u);
    expect(list.find((a) => a.id === lo.id)).toMatchObject({ active: false });
    expect(list.find((a) => a.id === lo.id)?.triggeredPrice).toBeTruthy();
    expect(list.find((a) => a.id === hi.id)).toMatchObject({ active: true, price: '0.8' });
    const n = await ctx.db.select().from(notifications).where(and(eq(notifications.userId, u.id), eq(notifications.type, 'price_alert')));
    expect(n).toHaveLength(1);
    await checkPriceAlerts(ctx);
    expect(await ctx.db.select().from(notifications).where(and(eq(notifications.userId, u.id), eq(notifications.type, 'price_alert')))).toHaveLength(1);
    await deletePriceAlert(ctx, u, hi.id);
    expect((await listPriceAlerts(ctx, u)).map((a) => a.id)).toEqual([lo.id]);
  });

  it('large-trade (OTC) requests: at most 3 open; the desk can mark them contacted', async () => {
    const u: User = await mkUser(ctx);
    const reqs: Array<{ id: string }> = [];
    for (let i = 0; i < 3; i++) reqs.push(await createOtcRequest(ctx, u, { side: 'buy', asset: 'USDT', fiat: 'EUR', fiatAmount: '250000', note: 'weekly' }));
    await expect(createOtcRequest(ctx, u, { side: 'buy', asset: 'USDT', fiat: 'EUR', fiatAmount: '1' })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await setOtcStatus(ctx, '00000000-0000-0000-0000-000000000001', reqs[0].id, 'contacted');
    const mine = await listOtcRequests(ctx, { userId: u.id });
    expect(mine.find((r) => r.id === reqs[0].id)?.status).toBe('contacted');
    expect((await listOtcRequests(ctx, { status: ['open'] })).some((r) => r.id === reqs[1].id)).toBe(true);
  });
});

describe('business hours', () => {
  const h = (start: string, end: string, days = [0, 1, 2, 3, 4, 5, 6], tz = 'UTC') => ({ tz, start, end, days });
  it('knows when a merchant is open, including overnight hours and time zones', () => {
    const at = (iso: string) => new Date(iso);
    expect(withinBusinessHours(h('09:00', '18:00'), at('2026-11-18T10:00:00Z'))).toBe(true);
    expect(withinBusinessHours(h('09:00', '18:00'), at('2026-11-18T18:00:00Z'))).toBe(false);
    expect(withinBusinessHours(h('09:00', '18:00', [1, 2, 3, 4, 5]), at('2026-11-22T10:00:00Z'))).toBe(false); // Sunday
    expect(withinBusinessHours(h('22:00', '06:00', [3]), at('2026-11-19T03:00:00Z'))).toBe(true);  // Wed night → Thu 03:00
    expect(withinBusinessHours(h('22:00', '06:00', [3]), at('2026-11-20T03:00:00Z'))).toBe(false); // Thu night not included
    expect(withinBusinessHours(h('09:00', '18:00', [0, 1, 2, 3, 4, 5, 6], 'Asia/Tokyo'), at('2026-11-18T01:00:00Z'))).toBe(true); // 10:00 in Tokyo
    expect(() => validateBusinessHours(h('9:00', '18:00'))).toThrow();
    expect(() => validateBusinessHours(h('09:00', '18:00', [], 'UTC'))).toThrow();
    expect(() => validateBusinessHours(h('09:00', '18:00', [1], 'Mars/Base'))).toThrow();
  });

  it('hides ads and blocks orders outside business hours; the worker reopens them', async () => {
    const { maker, ad } = await sellAd(ctx, { price: '0.818' });
    const taker = await mkUser(ctx);
    const nowMin = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
    const fmt = (m: number) => `${String(Math.floor(((m + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((m + 1440) % 1440) % 60).padStart(2, '0')}`;
    // Closed now: open window is 2–3 hours from now.
    expect((await setBusinessHours(ctx, maker, h(fmt(nowMin + 120), fmt(nowMin + 180)))).offHours).toBe(true);
    expect(ids(await book())).not.toContain(ad.id);
    await expect(createOrder(ctx, taker, { adId: ad.id, fiatAmount: '20' })).rejects.toMatchObject({ code: 'AD_UNAVAILABLE' });
    // Change the stored hours behind the scenes so they include now; the worker job flips the flag back.
    await ctx.db.update(users).set({ businessHours: h(fmt(nowMin - 60), fmt(nowMin + 60)) }).where(eq(users.id, maker.id));
    await applyBusinessHours(ctx);
    expect(ids(await book())).toContain(ad.id);
    expect((await publicProfile(ctx, maker.id)).offHours).toBe(false);
    await setBusinessHours(ctx, maker, null);
  });
});
