'use client';
/** P2P offers: filter bar (side, asset, currency, payment methods, regions, filter) + offers table. Used on Home and /p2p. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, ChevronRight, Clock, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { AssetIcon, Avatar, Button, Input, PayChip, Select, Skeleton, cn } from '@p2p/ui';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { socket } from '../lib/socket';
import { REGION_KEYS, typesForRegion } from '../lib/regions';
import { useL } from './nav';
import { TradeDialog } from './trade-dialog';

const ASSETS = ['USDT', 'BTC', 'ETH'];
export interface OfferFilters { side: 'buy' | 'sell'; asset: string; fiat: string; paymentType: string; region: string; amount: string; merchantOnly: boolean }

export function Offers({ initial, compact, onChange }: { initial?: Partial<OfferFilters>; compact?: boolean; onChange?: (f: OfferFilters) => void }) {
  const { t, num, money, pct } = useI18n();
  const L = useL();
  const [f, setF] = useState<OfferFilters>({ side: 'buy', asset: 'USDT', fiat: 'USD', paymentType: '', region: '', amount: '', merchantOnly: false, ...initial });
  const [types, setTypes] = useState<Array<{ code: string; name: string; countries?: string[] }>>([]);
  const [fiats, setFiats] = useState<string[]>(['EUR', 'USD']);
  const [items, setItems] = useState<any[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [more, setMore] = useState(!!initial?.amount || !!initial?.merchantOnly);
  const [spin, setSpin] = useState(false);
  const set = (p: Partial<OfferFilters>) => setF((x) => ({ ...x, ...p }));
  useEffect(() => { onChange?.(f); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [f]);
  useEffect(() => { api<Array<{ code: string }>>('/fiats').then((r) => r.length && setFiats(r.map((x) => x.code))).catch(() => {}); }, []);
  useEffect(() => { api<any[]>(`/payment-method-types?fiat=${f.fiat}`).then(setTypes).catch(() => setTypes([])); }, [f.fiat]);

  const load = useCallback(async (append = false) => {
    const q = new URLSearchParams({ side: f.side, asset: f.asset, fiat: f.fiat, limit: compact ? '6' : '20' });
    if (f.amount) q.set('amount', f.amount);
    if (f.paymentType) q.set('paymentType', f.paymentType);
    if (f.merchantOnly) q.set('merchantOnly', 'true');
    if (append && cursor) q.set('cursor', cursor);
    setSpin(true);
    const r = await api<{ items: any[]; nextCursor: string | null }>(`/ads?${q}`).catch(() => ({ items: [], nextCursor: null }));
    setItems((prev) => (append ? [...(prev ?? []), ...r.items] : r.items));
    setCursor(r.nextCursor);
    setTimeout(() => setSpin(false), 400);
  }, [f.side, f.asset, f.fiat, f.amount, f.paymentType, f.merchantOnly, cursor, compact]);
  useEffect(() => { setItems(null); void load(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [f.side, f.asset, f.fiat, f.amount, f.paymentType, f.merchantOnly]);
  useEffect(() => {
    const s = socket();
    s.emit('join', `ads:${f.asset}:${f.fiat}`);
    const on = () => void load(false);
    s.on('book', on);
    return () => { s.off('book', on); };
  }, [f.asset, f.fiat, load]);

  const regionTypes = useMemo(() => typesForRegion(types, f.region), [types, f.region]);
  const shown = useMemo(() => (items ?? []).filter((ad) => !regionTypes || ad.paymentTypes.some((p: string) => regionTypes.has(p))), [items, regionTypes]);
  const typeName = (c: string) => types.find((x) => x.code === c)?.name;
  const pill = (on: boolean) => cn('flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition-colors', on ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground');

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex rounded-xl border border-border bg-card p-1">
          {(['buy', 'sell'] as const).map((s) => (
            <button key={s} type="button" onClick={() => set({ side: s })} data-testid={`side-${s}`}
              className={cn('h-9 min-w-20 rounded-lg px-4 text-sm font-bold transition-colors', f.side === s ? (s === 'buy' ? 'bg-buy text-[#04130d]' : 'bg-sell text-white') : 'text-muted-foreground hover:text-foreground')}>
              {t(s === 'buy' ? 'market.buy' : 'market.sell')}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {ASSETS.map((a) => <button key={a} type="button" onClick={() => set({ asset: a })} className={pill(f.asset === a)}><AssetIcon asset={a} size={20} />{a}</button>)}
        </div>
        <select data-testid="asset" value={f.asset} onChange={(e) => set({ asset: e.target.value })} className="sr-only" aria-label={t('market.asset')}>{ASSETS.map((a) => <option key={a}>{a}</option>)}</select>
        <div className="flex w-full flex-wrap gap-2 sm:ms-auto sm:w-auto">
          <Select data-testid={compact ? undefined : 'fiat'} aria-label={t('market.fiat')} value={f.fiat} onChange={(e) => set({ fiat: e.target.value, paymentType: '' })} className="h-10 w-24 bg-card font-semibold">{fiats.map((x) => <option key={x}>{x}</option>)}</Select>
          <Select aria-label={t('market.paymentMethod')} value={f.paymentType} onChange={(e) => set({ paymentType: e.target.value })} className="h-10 min-w-0 flex-1 bg-card sm:w-48 sm:flex-none">
            <option value="">{t('ui.allMethods')}</option>{types.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </Select>
          <Select aria-label={t('ui.regions')} value={f.region} onChange={(e) => set({ region: e.target.value })} className="h-10 min-w-0 flex-1 bg-card sm:w-40 sm:flex-none">
            <option value="">{t('ui.allRegions')}</option>{REGION_KEYS.map((r) => <option key={r} value={r}>{t(`ui.region_${r}`)}</option>)}
          </Select>
          {!compact && <Button type="button" variant="outline" className="h-10 bg-card" onClick={() => setMore(!more)} aria-expanded={more}><SlidersHorizontal size={15} />{t('ui.filter')}</Button>}
        </div>
      </div>
      {more && !compact && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
          <div className="relative w-full sm:w-60">
            <Input inputMode="decimal" aria-label={t('market.amount')} value={f.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^\d.]/g, '') })} placeholder={t('market.amount')} className="pe-14" />
            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{f.fiat}</span>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={f.merchantOnly} onChange={(e) => set({ merchantOnly: e.target.checked })} /><BadgeCheck size={15} className="text-info" />{t('market.merchantOnly')}
          </label>
          <Button variant="ghost" size="icon" className="ms-auto" aria-label={t('ui.refresh')} onClick={() => load(false)}><RefreshCw size={16} className={cn(spin && 'animate-spin')} /></Button>
        </div>
      )}

      {/* Table */}
      <div data-testid={compact ? 'offers-widget' : 'book'}>
        <div className="hidden grid-cols-[2.1fr_1.2fr_1.6fr_1.5fr_1fr_auto] gap-4 px-5 pb-2 text-xs font-medium text-muted-foreground lg:grid">
          <span>{t('ui.merchant')}</span><span>{t('market.price')} ({f.fiat})</span><span>{t('market.available')} / {t('market.limits')}</span><span>{t('market.paymentMethod')}</span><span>{t('profile.completion')}</span><span className="w-24 text-end">{t('ui.action')}</span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {items === null && <div className="space-y-px">{Array.from({ length: compact ? 3 : 5 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-none" />)}</div>}
          {items && shown.length === 0 && <div className="p-12 text-center text-sm text-muted-foreground">{t('market.empty')}</div>}
          {shown.map((ad) => (
            <div key={ad.id} data-testid={compact ? 'offer-row' : 'ad-row'} className="grid grid-cols-2 items-center gap-x-4 gap-y-3 border-b border-border p-4 transition-colors last:border-0 hover:bg-muted/40 lg:grid-cols-[2.1fr_1.2fr_1.6fr_1.5fr_1fr_auto] lg:px-5 lg:py-3.5">
              <div className="col-span-2 flex items-center gap-3 lg:col-span-1">
                <Avatar name={ad.advertiser.displayName} seed={ad.advertiser.id} size={40} />
                <div className="min-w-0">
                  <Link href={L(`/profile/${ad.advertiser.id}`)} className="flex items-center gap-1 truncate font-semibold hover:text-primary">{ad.advertiser.displayName}{ad.advertiser.verifiedBadge && <BadgeCheck size={15} className="shrink-0 text-info" />}</Link>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock size={11} />{t('common.minutes', { n: ad.paymentWindowMin })}</div>
                </div>
              </div>
              <div className="num text-xl font-bold text-buy" data-testid={compact ? undefined : 'ad-price'}>{num(ad.price, 8)} <span className="text-xs font-semibold">{ad.fiat}</span></div>
              <div className="text-end text-[13px] lg:text-start">
                <div className="num font-medium">{money(ad.minAmount, ad.fiat)} – {money(ad.maxAmount, ad.fiat)}</div>
                <div className="num text-muted-foreground">{num(ad.remainingAmount, 6)} {ad.asset}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">{ad.paymentTypes.map((p: string) => <PayChip key={p} code={p} label={typeName(p)} />)}</div>
              <div className="text-end text-[13px] lg:text-start">
                <div className="num font-semibold">{pct(ad.advertiser.completionRateBps)}</div>
                <div className="text-xs text-muted-foreground">{t('ui.orders', { count: ad.advertiser.trades30d })}</div>
              </div>
              <Button variant={f.side === 'buy' ? 'default' : 'sell'} size="sm" className="col-span-2 h-9 w-full lg:col-span-1 lg:w-24" onClick={() => setSelected(ad)} data-testid={compact ? undefined : 'trade'}>
                {t(f.side === 'buy' ? 'market.buy' : 'market.sell')}
              </Button>
            </div>
          ))}
        </div>
        {compact ? (
          <div className="mt-3 text-end"><Link href={L(`/p2p?side=${f.side}&asset=${f.asset}&fiat=${f.fiat}`)} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">{t('ui.viewAll')}<ChevronRight size={15} className="rtl:-scale-x-100" /></Link></div>
        ) : cursor && <div className="mt-4 text-center"><Button variant="outline" onClick={() => load(true)}>{t('market.loadMore')}</Button></div>}
      </div>
      {selected && <TradeDialog ad={selected} side={f.side} onClose={() => setSelected(null)} />}
    </div>
  );
}
