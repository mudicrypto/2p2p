'use client';
import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * Indicative prices from the public P2P order book (best offer to buy each asset).
 * There is no price-history API, so we never show synthetic % changes or sparklines.
 */
export const MARKET_ASSETS = ['BTC', 'ETH', 'USDT'] as const;
export interface Quote { asset: string; fiat: string; price: string | null; offers: number }
const cache = new Map<string, { at: number; p: Promise<Quote[]> }>();
const TTL = 30_000;

async function fetchQuotes(fiat: string): Promise<Quote[]> {
  return Promise.all(MARKET_ASSETS.map(async (asset) => {
    const r = await api<{ items: any[] }>(`/ads?side=buy&asset=${asset}&fiat=${fiat}&limit=20`).catch(() => ({ items: [] }));
    return { asset, fiat, price: r.items[0]?.price ?? null, offers: r.items.length };
  }));
}
export function getQuotes(fiat: string) {
  const c = cache.get(fiat);
  if (c && Date.now() - c.at < TTL) return c.p;
  const p = fetchQuotes(fiat);
  cache.set(fiat, { at: Date.now(), p });
  return p;
}
export function useQuotes(fiat: string) {
  const [q, setQ] = useState<Quote[] | null>(null);
  useEffect(() => {
    let on = true;
    const load = () => getQuotes(fiat).then((x) => on && setQ(x));
    void load();
    const i = setInterval(load, TTL);
    return () => { on = false; clearInterval(i); };
  }, [fiat]);
  return q;
}
/** Display currency for valuations (per browser). */
export function useDisplayFiat(): [string, (f: string) => void] {
  const [f, setF] = useState('USD');
  useEffect(() => { try { const v = localStorage.getItem('displayFiat'); if (v) setF(v); } catch { /* ignore */ } }, []);
  return [f, (v: string) => { setF(v); try { localStorage.setItem('displayFiat', v); } catch { /* ignore */ } }];
}

/** Float-free valuation: sum(amount × price) with 8-dp fixed point. */
const D = 8n; const P = 10n ** D;
const sc = (v: string) => { const [i, f = ''] = String(v ?? '0').split('.'); return BigInt(i || '0') * P + BigInt((f + '00000000').slice(0, 8) || '0'); };
export function valuate(balances: Record<string, Record<string, string>>, quotes: Quote[] | null): { total: string; complete: boolean } | null {
  if (!quotes) return null;
  let sum = 0n; let complete = true;
  for (const [asset, b] of Object.entries(balances)) {
    const amt = sc(b.available ?? '0') + sc(b.escrow ?? '0') + sc(b.hold ?? '0');
    if (amt === 0n) continue;
    const q = quotes.find((x) => x.asset === asset);
    if (!q?.price) { complete = false; continue; }
    sum += (amt * sc(q.price)) / P;
  }
  const i = sum / P; const f = (sum % P).toString().padStart(8, '0').slice(0, 2);
  return { total: `${i}.${f}`, complete };
}
