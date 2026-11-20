import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { users, orders, chatMessages, notifications, eq, and } from '@p2p/db';
import { makeCtx, mkUser, sellAd, ensureSeed, uniq } from './helpers';
import {
  saveSearch, listSavedSearches, deleteSavedSearch, sendReleaseReminders, trustScore, translateChatMessage, payReferralRewards,
  referralRewardsInfo, rewardsBalance, createOrder, markPaid, signupEmail, verifyEmail, referralInfo, publicProfile, postTx, systemAcct, balanceOf, userAcct,
  runTx, setConfig, sendChatMessage,
} from '../src';

const ctx = makeCtx();
beforeAll(() => ensureSeed(ctx));
afterAll(() => ctx.close());

describe('P2P parity features', () => {
  it('saved searches: keeps known filters only, max 10 per user', async () => {
    const u = await mkUser(ctx);
    const s = await saveSearch(ctx, u, ' EUR via SEPA ', { side: 'buy', asset: 'USDT', fiat: 'EUR', paymentType: 'SEPA', onlineOnly: true, evil: 'x', merchantOnly: false });
    expect(s.name).toBe('EUR via SEPA');
    expect(s.params).toEqual({ side: 'buy', asset: 'USDT', fiat: 'EUR', paymentType: 'SEPA', onlineOnly: 'true' });
    await expect(saveSearch(ctx, u, 'x', { side: 'buy' })).rejects.toMatchObject({ code: 'VALIDATION' });
    for (let i = 0; i < 9; i++) await saveSearch(ctx, u, `s${i}`, { side: 'sell', asset: 'BTC', fiat: 'USD' });
    await expect(saveSearch(ctx, u, 'eleventh', { side: 'sell', asset: 'BTC', fiat: 'USD' })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    const other = await mkUser(ctx);
    await deleteSavedSearch(ctx, other, s.id); // someone else's: no effect
    expect(await listSavedSearches(ctx, u)).toHaveLength(10);
    await deleteSavedSearch(ctx, u, s.id);
    expect(await listSavedSearches(ctx, u)).toHaveLength(9);
  });

  it('release reminders: seller is nudged at 10 and 30 minutes after "paid", once each', async () => {
    const { maker, ad } = await sellAd(ctx, { price: '0.83' });
    const buyer = await mkUser(ctx);
    const o = await createOrder(ctx, buyer, { adId: ad.id, fiatAmount: '50' });
    await markPaid(ctx, buyer, o.id);
    const count = async () => (await ctx.db.select().from(notifications).where(and(eq(notifications.userId, maker.id), eq(notifications.type, 'release_reminder')))).filter((n) => (n.payload as any).orderId === o.id).length;
    await sendReleaseReminders(ctx);
    expect(await count()).toBe(0); // just paid
    await ctx.db.update(orders).set({ paidAt: new Date(Date.now() - 11 * 60_000) }).where(eq(orders.id, o.id));
    await sendReleaseReminders(ctx); await sendReleaseReminders(ctx);
    expect(await count()).toBe(1);
    await ctx.db.update(orders).set({ paidAt: new Date(Date.now() - 31 * 60_000) }).where(eq(orders.id, o.id));
    await sendReleaseReminders(ctx); await sendReleaseReminders(ctx);
    expect(await count()).toBe(2);
    const sys = await ctx.db.select().from(chatMessages).where(and(eq(chatMessages.orderId, o.id), eq(chatMessages.system, true)));
    expect(sys.filter((m) => m.body.startsWith('Reminder:'))).toHaveLength(2);
  });

  it('trust score: explainable parts, new accounts low, strong history high, freeze reports cut it', () => {
    const fresh = trustScore({ tradesTotal: 0, completionRateBps: 10000, disputeRateBps: 0, positiveFeedback: 0, negativeFeedback: 0, accountAgeDays: 0, kycTier: 0, verifiedBadge: false, freezeReports: 0 });
    expect(fresh).toMatchObject({ score: 0, level: 'new' });
    const pro = trustScore({ tradesTotal: 500, completionRateBps: 9950, disputeRateBps: 20, positiveFeedback: 300, negativeFeedback: 2, accountAgeDays: 400, kycTier: 2, verifiedBadge: true, freezeReports: 0 });
    expect(pro.score).toBeGreaterThanOrEqual(90);
    expect(pro.level).toBe('excellent');
    expect(Object.values(pro.parts).reduce((a, b) => a + b, 0)).toBe(pro.score);
    const reported = trustScore({ tradesTotal: 500, completionRateBps: 9950, disputeRateBps: 20, positiveFeedback: 300, negativeFeedback: 2, accountAgeDays: 400, kycTier: 2, verifiedBadge: true, freezeReports: 2 });
    expect(reported.score).toBe(pro.score - 30);
  });

  it('passport includes the trust score', async () => {
    const u = await mkUser(ctx, { tier: 1 });
    const p = await publicProfile(ctx, u.id);
    expect(p.trust.parts.verification).toBe(5);
    expect(typeof p.trust.score).toBe('number');
  });

  it('chat translation: only participants, never flagged messages, disabled without a service', async () => {
    const { maker, ad } = await sellAd(ctx, { price: '0.84' });
    const buyer = await mkUser(ctx);
    const o = await createOrder(ctx, buyer, { adId: ad.id, fiatAmount: '20' });
    const m = await sendChatMessage(ctx, maker, o.id, 'Hola, ya puedes pagar');
    const saved = ctx.providers.translator;
    try {
      ctx.providers.translator = undefined;
      await expect(translateChatMessage(ctx, buyer, o.id, m.id, 'en')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      ctx.providers.translator = { name: 'test', translate: async (t, l) => `[${l}] ${t}` };
      expect((await translateChatMessage(ctx, buyer, o.id, m.id, 'en')).text).toBe('[en] Hola, ya puedes pagar');
      const outsider = await mkUser(ctx);
      await expect(translateChatMessage(ctx, outsider, o.id, m.id, 'en')).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(translateChatMessage(ctx, buyer, o.id, m.id, 'en; drop')).rejects.toMatchObject({ code: 'VALIDATION' });
    } finally { ctx.providers.translator = saved; }
  });

  it('invite rewards: paid once after a qualifying trade with someone else, waiting while the fund is empty', async () => {
    await setConfig(ctx.db, 'referral', { enabled: true, rewardAsset: 'USDT', rewardAmount: '5', minTradeUsdCents: 2000 });
    const inviter = await mkUser(ctx);
    const { code } = await referralInfo(ctx, inviter);
    const s = await signupEmail(ctx, { email: `${uniq()}@t.io`, password: 'correct horse battery', country: 'DE', ref: code! });
    await verifyEmail(ctx, s.emailToken);
    const invitee = (await ctx.db.select().from(users).where(eq(users.id, s.user.id)))[0];
    const { ad } = await sellAd(ctx, { price: '0.85' });
    // A trade below the minimum value doesn't count.
    const o = await createOrder(ctx, invitee, { adId: ad.id, fiatAmount: '10' });
    await ctx.db.update(orders).set({ status: 'COMPLETED', usdValueCents: 1000n, releasedAt: new Date() }).where(eq(orders.id, o.id));
    await payReferralRewards(ctx);
    expect((await referralRewardsInfo(ctx, inviter)).pending).toBe('0');
    const o2 = await createOrder(ctx, invitee, { adId: ad.id, fiatAmount: '40' });
    await ctx.db.update(orders).set({ status: 'COMPLETED', usdValueCents: 4500n, releasedAt: new Date() }).where(eq(orders.id, o2.id));
    // Empty the fund first, so the reward has to wait.
    const fundNow = await rewardsBalance(ctx, 'USDT');
    if (fundNow > 0n) await runTx(ctx, (t) => postTx(t.tx, { type: 'adjustment', refType: 'test', idempotencyKey: `t:${uniq()}`, postings: [{ account: systemAcct('USDT', 'rewards'), amount: -fundNow }, { account: systemAcct('USDT', 'custody'), amount: fundNow }] }));
    await payReferralRewards(ctx);
    expect(await referralRewardsInfo(ctx, inviter)).toMatchObject({ pending: '5', earned: '0' });
    await runTx(ctx, (t) => postTx(t.tx, { type: 'adjustment', refType: 'test', idempotencyKey: `t:${uniq()}`, postings: [{ account: systemAcct('USDT', 'custody'), amount: -100_000_000n }, { account: systemAcct('USDT', 'rewards'), amount: 100_000_000n }] }));
    const before = await balanceOf(ctx.db, userAcct(inviter.id, 'USDT'));
    await payReferralRewards(ctx); await payReferralRewards(ctx);
    expect(await referralRewardsInfo(ctx, inviter)).toMatchObject({ pending: '0', earned: '5' });
    expect(await balanceOf(ctx.db, userAcct(inviter.id, 'USDT')) - before).toBe(5_000_000n);
    const n = await ctx.db.select().from(notifications).where(and(eq(notifications.userId, inviter.id), eq(notifications.type, 'referral_reward')));
    expect(n).toHaveLength(1);
  });
});

describe('confirmed email', () => {
  it('is required to post ads, place orders and withdraw (switchable by admins)', async () => {
    const { createAd, requestWithdrawal, setConfig: set } = await import('../src');
    const s = await signupEmail(ctx, { email: `${uniq()}@t.io`, password: 'correct horse battery', country: 'DE' });
    await ctx.db.update(users).set({ kycTier: 2 }).where(eq(users.id, s.user.id));
    const u = (await ctx.db.select().from(users).where(eq(users.id, s.user.id)))[0];
    const { ad } = await sellAd(ctx, { price: '0.86' });
    await expect(createOrder(ctx, u, { adId: ad.id, fiatAmount: '20' })).rejects.toMatchObject({ code: 'EMAIL_UNVERIFIED' });
    await expect(createAd(ctx, u, { side: 'buy', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '0.9', minAmount: '10', maxAmount: '100', totalAmount: '100', paymentMethodIds: [], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0 } as never)).rejects.toMatchObject({ code: 'EMAIL_UNVERIFIED' });
    await expect(requestWithdrawal(ctx, u, { asset: 'USDT', network: 'TRON', address: 'TXYZ', amount: '1' })).rejects.toMatchObject({ code: 'EMAIL_UNVERIFIED' });
    // Admins can switch the rule off.
    await set(ctx.db, 'accounts', { requireVerifiedEmail: false });
    try { expect((await createOrder(ctx, u, { adId: ad.id, fiatAmount: '20' })).id).toBeTruthy(); }
    finally { await set(ctx.db, 'accounts', { requireVerifiedEmail: true }); }
    await verifyEmail(ctx, s.emailToken);
  });
});
