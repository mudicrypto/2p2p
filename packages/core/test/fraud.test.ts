import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { kycApplications, riskFlags, orders, users, and, eq } from '@p2p/db';
import { makeCtx, mkUser, sellAd, ensureSeed, uniq } from './helpers';
import {
  namesMatch, createOrder, markPaid, handleIncomingPayment, trackDevice, signupEmail, login, encrypt, balanceOf, userAcct, userRiskScore, sendChatMessage, getLimits, type User,
} from '../src';

const ctx = makeCtx();
beforeAll(() => ensureSeed(ctx));
afterAll(() => ctx.close());

async function kycName(u: User, name: string) {
  await ctx.db.insert(kycApplications).values({ userId: u.id, provider: 'mock', providerRef: uniq('ref'), level: 1, status: 'approved', verifiedFullNameEnc: encrypt(name), reviewedAt: new Date() });
}
const flagsOf = async (type: string, id: string) => (await ctx.db.select().from(riskFlags).where(and(eq(riskFlags.subjectType, type), eq(riskFlags.subjectId, id)))).map((f) => f.code);
const pay = (o: any, payerName: string, extra: Partial<{ amount: bigint; reference: string }> = {}) =>
  handleIncomingPayment(ctx, o.id, { providerRef: uniq('p'), rail: 'SEPA_INSTANT', fiat: o.fiat, amount: extra.amount ?? o.fiatAmount, reference: extra.reference ?? `Payment ${o.referenceCode}`, payerName, receivedAt: new Date() });

describe('M8 simulated fraud suite', () => {
  it('name matching handles case, order, diacritics, initials, Cyrillic; rejects third parties', () => {
    expect(namesMatch('Ana María Silva', 'SILVA ANA MARIA')).toBe(true);
    expect(namesMatch('João da Silva Santos', 'JOAO SILVA SANTOS')).toBe(true);
    expect(namesMatch('John Michael Smith', 'J SMITH')).toBe(false); // only one full token
    expect(namesMatch('John Smith', 'SMITH J')).toBe(false);
    expect(namesMatch('John Michael Smith', 'JOHN M SMITH')).toBe(true);
    expect(namesMatch('Иван Петров', 'IVAN PETROV')).toBe(true);
    expect(namesMatch('Ana Silva', 'Carlos Pereira')).toBe(false);
    expect(namesMatch('Ana Silva', 'Ana Pereira')).toBe(false);
    expect(namesMatch('Mr. Ahmed Khan', 'AHMED KHAN')).toBe(true);
  });

  it('third-party payment: flags buyer + order, opens a dispute automatically, never auto-releases', async () => {
    const { ad } = await sellAd(ctx);
    const buyer = await mkUser(ctx, { tier: 1 });
    await kycName(buyer, 'Ana Maria Silva');
    const o = await createOrder(ctx, buyer, { adId: ad.id, fiatAmount: '92' });
    const r = await pay(o, 'Carlos Pereira');
    expect(r.outcome).toBe('third_party_flagged');
    expect(r.match).toMatchObject({ amountMatch: true, referenceMatch: true, nameMatch: false });
    expect(await flagsOf('order', o.id)).toContain('THIRD_PARTY_PAYMENT');
    expect(await flagsOf('user', buyer.id)).toContain('THIRD_PARTY_PAYMENT');
    const [after] = await ctx.db.select().from(orders).where(eq(orders.id, o.id));
    expect(after.status).toBe('DISPUTED');
    expect(await balanceOf(ctx.db, userAcct(buyer.id, 'USDT'))).toBe(0n);
  });

  it('full match (amount + reference + payer name) auto-releases; wrong amount or missing reference does not', async () => {
    const { ad } = await sellAd(ctx);
    const buyer = await mkUser(ctx, { tier: 1 });
    await kycName(buyer, 'Ana María Silva');
    const o = await createOrder(ctx, buyer, { adId: ad.id, fiatAmount: '46' });
    expect((await pay(o, 'SILVA ANA MARIA', { amount: o.fiatAmount - 1n })).outcome).toBe('mismatch');
    expect((await pay(o, 'SILVA ANA MARIA', { reference: 'no ref' })).outcome).toBe('mismatch');
    const r = await pay(o, 'SILVA ANA MARIA');
    expect(r.outcome).toBe('auto_released');
    const [after] = await ctx.db.select().from(orders).where(eq(orders.id, o.id));
    expect(after).toMatchObject({ status: 'COMPLETED', autoConfirmed: true });
  });

  it('multiple accounts on one device: flags every account; shared-device counterparties force manual confirmation', async () => {
    const fp = uniq('fp');
    const accts: User[] = [];
    for (let i = 0; i < 3; i++) { const u = await mkUser(ctx, { tier: 1 }); await trackDevice(ctx, u.id, { fingerprint: fp }); accts.push(u); }
    for (const u of accts) expect(await flagsOf('user', u.id)).toContain('MULTI_ACCOUNT_DEVICE');
    const { maker, ad } = await sellAd(ctx);
    const buyer = await mkUser(ctx, { tier: 1 });
    const fp2 = uniq('fp');
    await trackDevice(ctx, maker.id, { fingerprint: fp2 });
    await trackDevice(ctx, buyer.id, { fingerprint: fp2 });
    const o = await createOrder(ctx, buyer, { adId: ad.id, fiatAmount: '50' });
    expect(await flagsOf('order', o.id)).toContain('SHARED_DEVICE_COUNTERPARTIES');
    expect(o.manualConfirmRequired).toBe(true);
    await kycName(buyer, 'Test Buyer');
    const r = await pay(o, 'TEST BUYER');
    expect(r.outcome).toBe('confirmed_manual'); // paid, but the seller must release manually
    expect((await userRiskScore(ctx, accts[0].id)).factors).toContain('MULTI_ACCOUNT_DEVICE');
  });

  it('velocity abuse: order bursts, signup bursts from one IP, login brute force', async () => {
    const buyer = await mkUser(ctx, { tier: 3 });
    let last: any;
    for (let i = 0; i < 11; i++) {
      const { ad } = await sellAd(ctx);
      last = await createOrder(ctx, buyer, { adId: ad.id, fiatAmount: '20' }).catch((e) => e);
      if (i < 9 && last?.id) await ctx.db.update(orders).set({ status: 'CANCELLED' }).where(eq(orders.id, last.id)); // keep under max open orders
    }
    expect(await flagsOf('order', last.id)).toContain('VELOCITY');
    expect(last.riskScore).toBeGreaterThanOrEqual(25);

    const ip = `203.0.113.${Math.floor(Math.random() * 200)}`;
    const made: string[] = [];
    for (let i = 0; i < 5; i++) made.push((await signupEmail(ctx, { email: `${uniq()}@x.io`, password: 'longpassword1', country: 'DE' }, { ip })).user.id);
    expect(await flagsOf('user', made[0])).toContain('SIGNUP_IP_VELOCITY');

    const bip = `198.51.100.${Math.floor(Math.random() * 200)}`;
    for (let i = 0; i < 10; i++) await login(ctx, { email: 'nobody@x.io', password: 'bad' }, { ip: bip }).catch(() => null);
    await expect(login(ctx, { email: 'nobody@x.io', password: 'bad' }, { ip: bip })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('new-account cooldown lowers limits for 48h; off-platform chat is flagged', async () => {
    const young = await mkUser(ctx, { tier: 1, createdAt: new Date() });
    const old = await mkUser(ctx, { tier: 1 });
    expect((await getLimits(ctx, ctx.db, young)).daily).toBeLessThan((await getLimits(ctx, ctx.db, old)).daily);
    const { ad } = await sellAd(ctx);
    const o = await createOrder(ctx, old, { adId: ad.id, fiatAmount: '20' });
    await expect(sendChatMessage(ctx, old, o.id, 'pay me outside the platform, telegram @cashfast')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await flagsOf('user', old.id)).toContain('OFF_PLATFORM_CHAT');
    void markPaid; void users;
  });
});
