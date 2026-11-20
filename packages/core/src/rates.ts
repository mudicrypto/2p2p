/**
 * Reference rates (spec 2b): at least 3 sources, median, reject outliers > 2% from the median.
 */
import { rates, ads, and, eq, sql } from '@p2p/db';
import { applyMargin, medianBig, type Asset } from '@p2p/shared';
import type { Ctx } from './context';
import type { DbOrTx } from '@p2p/db';

export const OUTLIER_BPS = 200n;
export const MIN_SOURCES = Number(process.env.RATES_MIN_SOURCES ?? 3);

export function aggregateQuotes(prices: bigint[]): { price: bigint; used: bigint[]; rejected: bigint[] } | null {
  if (prices.length < MIN_SOURCES) return null;
  const med = medianBig(prices);
  const used = prices.filter((p) => {
    const diff = p > med ? p - med : med - p;
    return diff * 10_000n <= med * OUTLIER_BPS;
  });
  if (used.length < Math.min(MIN_SOURCES, 2)) return null;
  return { price: medianBig(used), used, rejected: prices.filter((p) => !used.includes(p)) };
}

export async function refreshRate(ctx: Ctx, asset: Asset, fiat: string) {
  const quotes = (await Promise.all(ctx.providers.rateSources.map((s) => s.fetch(asset, fiat).catch(() => null)))).filter((q) => !!q);
  const agg = aggregateQuotes(quotes.map((q) => q!.price));
  if (!agg) return null;
  const sources = quotes.map((q) => ({ source: q!.source, price: q!.price.toString(), used: agg.used.includes(q!.price) }));
  await ctx.db.insert(rates).values({ asset, fiat, price: agg.price, sources }).onConflictDoUpdate({ target: [rates.asset, rates.fiat], set: { price: agg.price, sources, updatedAt: ctx.now() } });
  // Floating ads track the reference rate.
  await ctx.db.update(ads).set({ price: sql`round(${agg.price.toString()}::numeric * (10000 + ${ads.marginBps}) / 10000)`, updatedAt: ctx.now() })
    .where(and(eq(ads.asset, asset), eq(ads.fiat, fiat), eq(ads.priceType, 'floating')));
  return agg.price;
}

const MAX_AGE_MS = Number(process.env.RATE_MAX_AGE_MS ?? 10 * 60_000);

/** Aggregate live quotes in memory (no DB writes). */
export async function computeRate(ctx: Ctx, asset: Asset, fiat: string): Promise<bigint | null> {
  const quotes = (await Promise.all(ctx.providers.rateSources.map((s) => s.fetch(asset, fiat).catch(() => null)))).filter((q) => !!q);
  return aggregateQuotes(quotes.map((q) => q!.price))?.price ?? null;
}

/**
 * Reference price (scaled). Never writes from inside a caller's transaction: a stale/missing rate is computed
 * in memory and persisted on a separate connection afterwards (worker `rates.refresh` keeps rates fresh anyway).
 * Writing inside the order transaction would need a second pool connection while holding one (pool deadlock
 * under load) and could block on ad rows locked by the same transaction.
 */
export async function getReferencePrice(ctx: Ctx, db: DbOrTx, asset: Asset, fiat: string): Promise<bigint | null> {
  const [r] = await db.select().from(rates).where(and(eq(rates.asset, asset), eq(rates.fiat, fiat)));
  if (r && ctx.now().getTime() - r.updatedAt.getTime() < MAX_AGE_MS) return r.price;
  const inTx = db !== ctx.db;
  if (!inTx) return (await refreshRate(ctx, asset, fiat)) ?? r?.price ?? null;
  const live = await computeRate(ctx, asset, fiat);
  setImmediate(() => { void refreshRate(ctx, asset, fiat).catch(() => null); });
  return live ?? r?.price ?? null;
}
export const floatingPrice = (ref: bigint, marginBps: number) => applyMargin(ref, marginBps);
