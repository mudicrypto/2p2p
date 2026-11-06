import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fiatCurrencies, paymentMethodTypes, countryRules, users, eq, sql } from '@p2p/db';
import { DomainError } from '@p2p/shared';
import { makeCtx, mkUser, fund, ensureSeed, uniq } from './helpers';
import { addPaymentMethod, createAd, createOrder, markPaid, releaseOrder, signupEmail, aggregateQuotes, fiatDecimals, checkInvariants, type FieldSpec } from '../src';
import { PAYMENT_METHOD_CATALOG } from '../src/data/payment-methods';
import { ISO_CURRENCIES } from '../src/data/currencies';

const ctx = makeCtx();
beforeAll(() => ensureSeed(ctx));
afterAll(() => ctx.close());

const CANDIDATES: Record<string, string[]> = {
  iban: ['DE89370400440532013000'], bic: ['DEUTDEFF'], phone: ['+491511234567', '+79161234567'], handle: ['user@example.com', '@tester'], email: ['user@example.com'],
  accountNumber: ['12345678', '123456789', '12-3456-1234567-00'], bankName: ['Test Bank'], cardNumber: ['4111111111111111'], sortCode: ['12-34-56'],
  routingNumber: ['021000021'], swift: ['DEUTDEFF'], cashtag: ['$tester'], revtag: ['@tester'], pixKey: ['tester@pix.br'], clabe: ['012345678901234567'],
  cvuOrAlias: ['tester.alias'], cbu: ['0123456789012345678901'], nationalId: ['V12345678'], bankCode: ['0102'], vpa: ['tester@upi'], ifsc: ['HDFC0001234'],
  promptpayId: ['0812345678'], duitnowId: ['0123456789'], merchantName: ['Tester Shop'], proxy: ['+6591234567'], fpsId: ['1234567'], paparaNumber: ['1234567890'],
  alias: ['tester'], nuban: ['0123456789'], shapId: ['tester@shap'], payId: ['tester@example.com'], bsb: ['123-456'], last4: ['4242'], city: ['Lisbon'],
  meetingNotes: ['public place'], brand: ['x'], cvu: ['1'],
};
function sample(fields: FieldSpec[]) {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.optional) continue;
    const v = (CANDIDATES[f.name] ?? ['sample']).find((c) => !f.pattern || new RegExp(f.pattern).test(c));
    if (!v) throw new Error(`no sample for ${f.name} /${f.pattern}/`);
    out[f.name] = v;
  }
  return out;
}

describe('M9 global layer', () => {
  it('seeds every active ISO 4217 currency with correct minor units', async () => {
    const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(fiatCurrencies);
    expect(n).toBeGreaterThanOrEqual(150);
    expect(n).toBe(ISO_CURRENCIES.length);
    for (const [code, d] of [['JPY', 0], ['KWD', 3], ['BHD', 3], ['EUR', 2], ['CLP', 0], ['VND', 0], ['IDR', 2]] as const) expect(await fiatDecimals(ctx.db, code), code).toBe(d);
    const pmts = await ctx.db.select().from(paymentMethodTypes);
    expect(pmts.length).toBe(PAYMENT_METHOD_CATALOG.length);
    expect(pmts.find((p) => p.code === 'GIFT_CARD')?.enabled).toBe(false);
  });

  it('ads + orders work for every payment method × currency combination in the catalog', async () => {
    const combos = PAYMENT_METHOD_CATALOG.filter((m) => m.enabled !== false).flatMap((m) => m.currencies.map((c) => [m, c === '*' ? 'USD' : c] as const));
    expect(combos.length).toBeGreaterThan(100);
    for (const [m, fiat] of combos) {
      await ctx.db.update(fiatCurrencies).set({ enabled: true }).where(eq(fiatCurrencies.code, fiat));
      const seller = await mkUser(ctx, { tier: 2 });
      await fund(ctx, seller, 'USDT', '100');
      const pm = await addPaymentMethod(ctx, seller, { type: m.code, holderName: 'Global Tester', details: sample(m.fieldsSchema) });
      const d = await fiatDecimals(ctx.db, fiat);
      const ad = await createAd(ctx, seller, {
        side: 'sell', asset: 'USDT', fiat, priceType: 'fixed', price: '1000', minAmount: d === 0 ? '1' : '1', maxAmount: '100000000', totalAmount: '10',
        paymentMethodIds: [pm.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0, acceptReversible: !!m.reversible,
      });
      const buyer = await mkUser(ctx, { tier: 2 });
      const o = await createOrder(ctx, buyer, { adId: ad.id, cryptoAmount: '1' });
      await markPaid(ctx, buyer, o.id);
      const done = await releaseOrder(ctx, seller, o.id, undefined, { skip2fa: true });
      expect(done.status, `${m.code}/${fiat}`).toBe('COMPLETED');
      expect(done.holdUntil !== null, `${m.code} hold`).toBe(!!m.reversible);
    }
    expect((await checkInvariants(ctx.db)).ok).toBe(true);
  });

  it('disabled methods are rejected', async () => {
    const u = await mkUser(ctx, { tier: 2 });
    await expect(addPaymentMethod(ctx, u, { type: 'GIFT_CARD', holderName: 'x y', details: { brand: 'x' } })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('a blocked country (or one switched off by flag) cannot sign up or trade', async () => {
    const c = 'ZB';
    const existing = await mkUser(ctx, { tier: 1, country: c });
    await ctx.db.insert(countryRules).values({ country: c, status: 'blocked' }).onConflictDoUpdate({ target: countryRules.country, set: { status: 'blocked' } });
    await expect(signupEmail(ctx, { email: `${uniq()}@x.io`, password: 'longpassword1', country: c })).rejects.toMatchObject({ code: 'COUNTRY_BLOCKED' });
    const seller = await mkUser(ctx, { tier: 2 });
    await fund(ctx, seller, 'USDT', '10');
    const pm = await addPaymentMethod(ctx, seller, { type: 'SEPA', holderName: 'A B', details: { iban: 'DE89370400440532013000' } });
    const ad = await createAd(ctx, seller, { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '1', minAmount: '1', maxAmount: '10', totalAmount: '10', paymentMethodIds: [pm.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0, acceptReversible: false });
    await expect(createOrder(ctx, existing, { adId: ad.id, fiatAmount: '5' })).rejects.toMatchObject({ code: 'COUNTRY_BLOCKED' });
    const pmB = await addPaymentMethod(ctx, existing, { type: 'SEPA', holderName: 'A B', details: { iban: 'DE89370400440532013000' } }).catch((e) => e);
    if (!(pmB instanceof DomainError)) await expect(createAd(ctx, existing, { side: 'buy', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '1', minAmount: '1', maxAmount: '10', totalAmount: '10', paymentMethodIds: [pmB.id], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0, acceptReversible: false })).rejects.toMatchObject({ code: 'COUNTRY_BLOCKED' });
    // feature flag per country (launch switch)
    await ctx.db.insert(countryRules).values({ country: 'ZC', status: 'allowed', launchEnabled: false });
    await expect(signupEmail(ctx, { email: `${uniq()}@x.io`, password: 'longpassword1', country: 'ZC' })).rejects.toMatchObject({ code: 'COUNTRY_BLOCKED' });
    void users;
  });

  it('reference rate: median of >=3 sources, rejects outliers beyond 2%', () => {
    const p = (x: number) => BigInt(x) * 10n ** 8n;
    const r = aggregateQuotes([p(100), p(101), p(99), p(130)])!;
    expect(r.rejected).toEqual([p(130)]);
    expect(r.price).toBe(p(100));
    expect(aggregateQuotes([p(100), p(101)])).toBeNull();
  });
});
