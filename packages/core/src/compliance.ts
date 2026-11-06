import { countryRules, eq, type DbOrTx } from '@p2p/db';
import { DomainError } from '@p2p/shared';

export type CountryRule = typeof countryRules.$inferSelect;
const DEFAULT_RULE = (country: string): CountryRule => ({
  country, status: 'allowed', tier0Allowed: true, tierOverrides: {}, limitMultiplierBps: 10000,
  allowedPaymentMethods: null, requiredDisclosures: [], launchEnabled: true, updatedAt: new Date(0),
});

const cache = new Map<string, { at: number; v: CountryRule }>();
const TTL_MS = Number(process.env.CONFIG_CACHE_MS ?? 2000);
/** Country rules are read on every order; cached for CONFIG_CACHE_MS (admin edits take effect within that window). */
export async function getCountryRule(db: DbOrTx, country: string): Promise<CountryRule> {
  const code = country.toUpperCase();
  const c = cache.get(code);
  if (c && Date.now() - c.at < TTL_MS) return c.v;
  const [r] = await db.select().from(countryRules).where(eq(countryRules.country, code));
  const v = r ?? DEFAULT_RULE(code);
  cache.set(code, { at: Date.now(), v });
  return v;
}
export const clearCountryRuleCache = () => cache.clear();
/** Throws COUNTRY_BLOCKED if the country is blocked or not launched. */
export async function assertCountryAllowed(db: DbOrTx, country: string) {
  const r = await getCountryRule(db, country);
  if (r.status === 'blocked' || !r.launchEnabled) throw new DomainError('COUNTRY_BLOCKED', `service unavailable in ${country}`);
  return r;
}
