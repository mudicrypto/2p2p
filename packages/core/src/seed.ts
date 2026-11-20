/** Idempotent seed: fiat currencies, payment method catalog, default limits, country rules. */
import { fiatCurrencies, paymentMethodTypes, limitsConfig, type DbOrTx, sql } from '@p2p/db';
import { DEFAULT_TIER_LIMITS_USD_CENTS, KYC_TIERS } from '@p2p/shared';
import { ISO_CURRENCIES, ENABLED_FIATS } from './data/currencies';
import { PAYMENT_METHOD_CATALOG } from './data/payment-methods';

export async function seed(db: DbOrTx) {
  for (let i = 0; i < ISO_CURRENCIES.length; i += 100) {
    const chunk = ISO_CURRENCIES.slice(i, i + 100).map(([code, name, minor]) => ({ code, name, minorUnits: minor, enabled: ENABLED_FIATS.has(code) }));
    await db.insert(fiatCurrencies).values(chunk).onConflictDoUpdate({ target: fiatCurrencies.code, set: { name: sql`excluded.name`, minorUnits: sql`excluded.minor_units` } });
  }
  for (const m of PAYMENT_METHOD_CATALOG) {
    await db.insert(paymentMethodTypes).values(m).onConflictDoUpdate({ target: paymentMethodTypes.code, set: {
      name: m.name, region: m.region, countries: m.countries, currencies: m.currencies, fieldsSchema: m.fieldsSchema, reversible: m.reversible ?? false,
      riskLevel: m.riskLevel ?? 'low', verifierAvailable: m.verifierAvailable ?? false, enabled: m.enabled ?? true, optIn: m.optIn ?? false, holdHours: m.holdHours ?? 0,
    } });
  }
  for (const tier of KYC_TIERS) {
    const d = DEFAULT_TIER_LIMITS_USD_CENTS[tier];
    await db.insert(limitsConfig).values({ tier, asset: 'USD', dailyLimit: d.daily, monthlyLimit: d.monthly, perOrderMax: d.perOrder, withdrawDaily: d.withdrawDaily }).onConflictDoNothing();
  }
}
