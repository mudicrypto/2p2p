import { fiatCurrencies, eq, type DbOrTx } from '@p2p/db';

const cache = new Map<string, number>();
/** ISO 4217 minor units, from fiat_currencies (seeded) with an Intl fallback. */
export async function fiatDecimals(db: DbOrTx, code: string): Promise<number> {
  const c = cache.get(code);
  if (c !== undefined) return c;
  const [row] = await db.select({ m: fiatCurrencies.minorUnits }).from(fiatCurrencies).where(eq(fiatCurrencies.code, code));
  let d = row?.m;
  if (d === undefined) {
    try { d = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2; } catch { d = 2; }
  }
  cache.set(code, d);
  return d;
}
export async function getFiat(db: DbOrTx, code: string) {
  const [row] = await db.select().from(fiatCurrencies).where(eq(fiatCurrencies.code, code));
  return row ?? null;
}
