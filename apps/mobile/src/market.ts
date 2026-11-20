/** Indicative prices from the public order book (best offer); float-free valuation. No price history exists in the API. */
import { api } from './native';
import { fromScaled, toScaled } from './decimal';

export const MARKET_ASSETS = ['BTC', 'ETH', 'USDT'] as const;
export interface Quote { asset: string; fiat: string; price: string | null }
export async function getQuotes(fiat: string): Promise<Quote[]> {
  return Promise.all(MARKET_ASSETS.map(async (asset) => {
    const r = await api.book({ side: 'buy', asset, fiat }).catch(() => ({ items: [] as any[] }));
    return { asset, fiat, price: r.items[0]?.price ?? null };
  }));
}
export function valuate(balances: Record<string, Record<string, string>>, quotes: Quote[] | null): { total: string; complete: boolean } | null {
  if (!quotes) return null;
  let sum = 0n; let complete = true;
  for (const [asset, b] of Object.entries(balances)) {
    const amt = toScaled(b.available ?? '0') + toScaled(b.escrow ?? '0') + toScaled(b.hold ?? '0');
    if (amt === 0n) continue;
    const q = quotes.find((x) => x.asset === asset);
    if (!q?.price) { complete = false; continue; }
    sum += (amt * toScaled(q.price)) / 10n ** 8n;
  }
  return { total: fromScaled(sum, 2), complete };
}
