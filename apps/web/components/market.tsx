'use client';
/** Market extras on the Trade page: P2P vs market price chart and a guide for a first trade. */
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, LineChart, X } from 'lucide-react';
import { Card } from '@p2p/ui';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';

type Pt = { at: string; bestAsk: string | null; bestBid: string | null; market: string | null };
const W = 640, H = 140, P = 6;

/** Best P2P price vs the market rate over the last 24 hours (snapshots every 5 minutes). */
export function PriceChart({ asset, fiat, side }: { asset: string; fiat: string; side: 'buy' | 'sell' }) {
  const { t, num } = useI18n();
  const [pts, setPts] = useState<Pt[] | null>(null);
  useEffect(() => { setPts(null); api<{ points: Pt[] }>(`/market/history?asset=${asset}&fiat=${fiat}&hours=24`).then((r) => setPts(r.points)).catch(() => setPts([])); }, [asset, fiat]);
  const key = side === 'buy' ? 'bestAsk' : 'bestBid';
  const series = useMemo(() => {
    if (!pts?.length) return null;
    const xs = pts.map((p) => new Date(p.at).getTime());
    const p2p = pts.map((p) => (p[key] === null ? null : Number(p[key])));
    const mkt = pts.map((p) => (p.market === null ? null : Number(p.market)));
    const vals = [...p2p, ...mkt].filter((v): v is number => v !== null);
    if (vals.length < 2) return null;
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || hi * 0.01 || 1;
    const x0 = xs[0], x1 = xs[xs.length - 1] === x0 ? x0 + 1 : xs[xs.length - 1];
    const path = (ys: Array<number | null>) => ys.map((y, i) => (y === null ? '' : `${i && ys[i - 1] !== null ? 'L' : 'M'}${(P + ((xs[i] - x0) / (x1 - x0)) * (W - 2 * P)).toFixed(1)},${(P + (1 - (y - lo) / span) * (H - 2 * P)).toFixed(1)}`)).join('');
    const last = p2p.filter((v) => v !== null).at(-1) ?? null, lastM = mkt.filter((v) => v !== null).at(-1) ?? null;
    return { p2p: path(p2p), mkt: path(mkt), last, lastM, premium: last !== null && lastM ? ((last - lastM) / lastM) * 100 : null };
  }, [pts, key]);
  if (pts === null) return null;
  return (
    <Card className="p-4 sm:p-6" data-testid="price-chart">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 text-[17px] font-semibold"><LineChart size={17} />{t('ui.chartTitle', { asset, fiat })}</div>
        {series?.premium !== null && series?.premium !== undefined && <span className="text-sm text-muted-foreground">{t('ui.chartPremium', { pct: `${series.premium >= 0 ? '+' : ''}${series.premium.toFixed(2)}%` })}</span>}
      </div>
      {!series ? <p className="py-6 text-center text-sm text-muted-foreground">{t('ui.chartEmpty')}</p> : <>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-36 w-full" preserveAspectRatio="none" role="img" aria-label={t('ui.chartTitle', { asset, fiat })}>
          <path d={series.mkt} fill="none" stroke="currentColor" className="text-muted-foreground" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <path d={series.p2p} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-primary" />{t(side === 'buy' ? 'ui.chartBestAsk' : 'ui.chartBestBid')}{series.last !== null && <b className="num text-foreground">{num(String(series.last), 8)}</b>}</span>
          <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-muted-foreground" />{t('ui.chartMarket')}{series.lastM !== null && <b className="num text-foreground">{num(String(series.lastM), 8)}</b>}</span>
          <span>{t('ui.chart24h')}</span>
        </div>
      </>}
    </Card>
  );
}

const GUIDE_KEY = 'guide.firstTrade.dismissed';
/** Four-step guide shown until the user dismisses it or completes a trade. */
export function FirstTradeGuide({ show }: { show: boolean }) {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem(GUIDE_KEY) === '1'); } catch { setHidden(false); } }, []);
  if (!show || hidden) return null;
  const steps = ['ui.guide1', 'ui.guide2', 'ui.guide3', 'ui.guide4'];
  return (
    <Card className="relative p-5 sm:p-6" data-testid="first-trade-guide">
      <button type="button" aria-label={t('common.cancel')} className="absolute end-4 top-4 text-muted-foreground hover:text-foreground" onClick={() => { setHidden(true); try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* ignore */ } }} data-testid="guide-close"><X size={18} /></button>
      <div className="text-[17px] font-semibold">{t('ui.guideTitle')}</div>
      <ol className="mt-3 grid gap-3 sm:grid-cols-4">
        {steps.map((k, i) => (
          <li key={k} className="flex items-start gap-3 rounded-2xl bg-muted/60 p-3 text-sm">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-primary-foreground">{i + 1}</span>
            <span>{t(k)}</span>
            {i < steps.length - 1 && <ArrowRight size={14} className="mt-1.5 hidden shrink-0 text-muted-foreground sm:block rtl:-scale-x-100" />}
          </li>
        ))}
      </ol>
    </Card>
  );
}
