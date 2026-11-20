import { parsePrice, type Asset } from '@p2p/shared';
import type { RateQuote, RateSource } from '../interfaces';
import { httpJson } from './http';

/** Public tickers (no keys). Each returns a scaled price for asset/fiat or null if unsupported. */
const fiatDecimalsOf = (f: string) => (['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'UGX', 'PYG'].includes(f) ? 0 : 2);
function quote(source: string, asset: Asset, fiat: string, px: string | number): RateQuote {
  const d = fiatDecimalsOf(fiat);
  const s = typeof px === 'number' ? px.toFixed(d + 8) : px;
  const [i, f = ''] = s.split('.');
  return { source, asset, fiat, price: parsePrice(`${i}.${f.slice(0, d + 8) || '0'}`, d), at: new Date() };
}
export class BinanceRateSource implements RateSource {
  readonly name = 'binance';
  async fetch(asset: Asset, fiat: string) {
    const sym = asset === 'USDT' ? `USDT${fiat}` : `${asset}${fiat}`;
    try {
      const r = await httpJson<{ price: string }>(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`);
      return quote(this.name, asset, fiat, r.price);
    } catch { return null; }
  }
}
export class KrakenRateSource implements RateSource {
  readonly name = 'kraken';
  async fetch(asset: Asset, fiat: string) {
    const pair = `${asset === 'BTC' ? 'XBT' : asset}${fiat}`;
    try {
      const r = await httpJson<{ result: Record<string, { c: [string] }> }>(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
      const v = Object.values(r.result ?? {})[0];
      return v ? quote(this.name, asset, fiat, v.c[0]) : null;
    } catch { return null; }
  }
}
export class CoinbaseRateSource implements RateSource {
  readonly name = 'coinbase';
  async fetch(asset: Asset, fiat: string) {
    try {
      const r = await httpJson<{ data: { amount: string } }>(`https://api.coinbase.com/v2/prices/${asset}-${fiat}/spot`);
      return quote(this.name, asset, fiat, r.data.amount);
    } catch { return null; }
  }
}
/** FX feed (fiat per USD) combined with USD crypto price — covers fiats exchanges do not list. */
export class FxCrossRateSource implements RateSource {
  readonly name = 'fx-cross';
  constructor(private usdSource: RateSource) {}
  async fetch(asset: Asset, fiat: string) {
    try {
      const usd = await this.usdSource.fetch(asset, 'USD');
      if (!usd) return null;
      const r = await httpJson<{ rates: Record<string, number> }>(`https://open.er-api.com/v6/latest/USD`);
      const fx = r.rates[fiat];
      if (!fx) return null;
      const fx8 = BigInt(Math.round(fx * 1e8));
      const d = fiatDecimalsOf(fiat);
      // usd.price is USD-cents scaled; convert to fiat minor scaled.
      const price = (usd.price * fx8 * 10n ** BigInt(d)) / (100n * 100_000_000n);
      return { source: this.name, asset, fiat, price, at: new Date() };
    } catch { return null; }
  }
}
