import { countryRules, eq, type DbOrTx } from '@p2p/db';
import { DomainError } from '@p2p/shared';

export type CountryRule = typeof countryRules.$inferSelect;
const DEFAULT_RULE = (country: string): CountryRule => ({
  country, status: 'allowed', tier0Allowed: true, tierOverrides: {}, limitMultiplierBps: 10000,
  allowedPaymentMethods: null, requiredDisclosures: [], launchEnabled: true, updatedAt: new Date(0),
});

export async function getCountryRule(db: DbOrTx, country: string): Promise<CountryRule> {
  const [r] = await db.select().from(countryRules).where(eq(countryRules.country, country.toUpperCase()));
  return r ?? DEFAULT_RULE(country.toUpperCase());
}
/** Throws COUNTRY_BLOCKED if the country is blocked or not launched. */
export async function assertCountryAllowed(db: DbOrTx, country: string) {
  const r = await getCountryRule(db, country);
  if (r.status === 'blocked' || !r.launchEnabled) throw new DomainError('COUNTRY_BLOCKED', `service unavailable in ${country}`);
  return r;
}
