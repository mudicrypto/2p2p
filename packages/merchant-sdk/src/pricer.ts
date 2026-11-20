/**
 * Auto-pricing bot: keeps each fixed-price ad just ahead of the best competing price, bounded by a
 * floor/ceiling relative to a reference price. All arithmetic is bigint on decimal strings.
 */
import type { AdView, MerchantClient } from './client';

const SCALE_DEC = 18;
const SCALE = 10n ** BigInt(SCALE_DEC);
export function dec(s: string): bigint {
  const [i, f = ''] = s.split('.');
  return BigInt(i || '0') * SCALE + BigInt((f + '0'.repeat(SCALE_DEC)).slice(0, SCALE_DEC));
}
/** Format with at most `places` decimals (rounded half up), trailing zeros trimmed. */
export function fmt(v: bigint, places = 8): string {
  const unit = 10n ** BigInt(SCALE_DEC - places);
  const r = (v + unit / 2n) / unit;
  const s = r.toString().padStart(places + 1, '0');
  const frac = s.slice(-places).replace(/0+$/, '');
  return s.slice(0, -places) + (frac ? `.${frac}` : '');
}
const bps = (v: bigint, b: number) => (v * BigInt(10_000 + b)) / 10_000n;
const median = (xs: bigint[]) => { const s = [...xs].sort((a, b) => (a < b ? -1 : 1)); return s[Math.floor((s.length - 1) / 2)]; };

export interface AutoPricerOptions {
  /** Step to beat the best competitor by (bps). */ stepBps?: number;
  /** Bounds relative to the reference price (bps, may be negative), e.g. floor -50 / ceil +300. */ floorBps?: number; ceilBps?: number;
  /** Reference price provider (decimal string); default: median of the competing book. */ reference?: (asset: string, fiat: string) => Promise<string | null>;
  /** Fraction decimals to quote (defaults to 4). */ places?: number;
  intervalMs?: number;
  log?: (m: string) => void;
}
export interface RepriceResult { adId: string; from: string; to: string }

export class AutoPricer {
  private timer?: NodeJS.Timeout;
  constructor(private client: MerchantClient, private o: AutoPricerOptions = {}) {}

  async runOnce(): Promise<RepriceResult[]> {
    const step = this.o.stepBps ?? 5;
    const floorBps = this.o.floorBps ?? -100;
    const ceilBps = this.o.ceilBps ?? 300;
    const places = this.o.places ?? 4;
    const mine = (await this.client.ads()).filter((a) => a.priceType === 'fixed' && a.status === 'active');
    const myIds = new Set(mine.map((a) => a.id));
    const groups = new Map<string, AdView[]>();
    for (const a of mine) groups.set(`${a.side}|${a.asset}|${a.fiat}`, [...(groups.get(`${a.side}|${a.asset}|${a.fiat}`) ?? []), a]);
    const updates: Array<{ id: string; price: string }> = [];
    const out: RepriceResult[] = [];
    for (const [key, list] of groups) {
      const [side, asset, fiat] = key.split('|') as ['buy' | 'sell', string, string];
      // The book from the taker's view: my SELL ads compete in side=buy, my BUY ads in side=sell.
      const book = await this.client.book({ side: side === 'sell' ? 'buy' : 'sell', asset, fiat, limit: 100 });
      const comp = book.items.filter((i) => !myIds.has(i.id)).map((i) => dec(i.price));
      const refStr = this.o.reference ? await this.o.reference(asset, fiat) : null;
      const ref = refStr ? dec(refStr) : comp.length ? median(comp) : null;
      if (!ref) continue;
      const lo = bps(ref, floorBps); const hi = bps(ref, ceilBps);
      for (const ad of list) {
        let target: bigint;
        if (!comp.length) target = side === 'sell' ? hi : lo;
        else if (side === 'sell') target = bps(comp.reduce((m, x) => (x < m ? x : m)), -step); // undercut the cheapest seller
        else target = bps(comp.reduce((m, x) => (x > m ? x : m)), step); // outbid the highest buyer
        if (target < lo) target = lo;
        if (target > hi) target = hi;
        const to = fmt(target, places);
        if (dec(to) !== dec(ad.price)) { updates.push({ id: ad.id, price: to }); out.push({ adId: ad.id, from: ad.price, to }); }
      }
    }
    if (updates.length) {
      const r = await this.client.bulkUpdate(updates);
      for (const x of r.results) if (!x.ok) this.o.log?.(`reprice failed ${x.id}: ${x.error}`);
    }
    for (const r of out) this.o.log?.(`repriced ${r.adId}: ${r.from} -> ${r.to}`);
    return out;
  }

  start() {
    const tick = () => this.runOnce().catch((e) => this.o.log?.(`autopricer error: ${(e as Error).message}`));
    void tick();
    this.timer = setInterval(tick, this.o.intervalMs ?? 15_000);
  }
  stop() { if (this.timer) clearInterval(this.timer); }
}
