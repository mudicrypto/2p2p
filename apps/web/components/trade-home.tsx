'use client';
/** parley Trade: "You pay" → "You get", best match, ranked offers. Real order-book data only. */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { Badge, Button, Card, Skeleton, cn } from '@p2p/ui';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/session';
import { api } from '../lib/api';
import { socket } from '../lib/socket';
import { useL } from './nav';
import { TradeDialog, cryptoFor, fiatFor } from './trade-dialog';
import { cdp } from './order-state';

const ASSETS = ['USDT', 'BTC', 'ETH'];
const D = 10n ** 8n;
const sc = (v: string) => { const [i, f = ''] = (v || '0').split('.'); return BigInt(i || '0') * D + BigInt((f + '00000000').slice(0, 8) || '0'); };
const inLimits = (fiat: string, ad: any) => !fiat || (sc(fiat) >= sc(ad.minAmount) && sc(fiat) <= sc(ad.maxAmount));

export function releaseLabel(sec: number, t: (k: string, p?: Record<string, string | number>) => string) {
  if (!sec) return t('ui.releaseNew');
  if (sec < 60) return t('common.seconds', { n: sec });
  return t('common.minutes', { n: Math.round(sec / 60) });
}

function TradeInner() {
  const { t, num, money } = useI18n();
  const { me } = useSession();
  const L = useL();
  const sp = useSearchParams();
  const [side, setSide] = useState<'buy' | 'sell'>(sp.get('side') === 'sell' ? 'sell' : 'buy');
  const [asset, setAsset] = useState(sp.get('asset') ?? 'USDT');
  const [fiat, setFiat] = useState(sp.get('fiat') ?? 'USD');
  const [amount, setAmount] = useState(''); // buy: fiat to pay · sell: crypto to sell
  const [pm, setPm] = useState(sp.get('pm') ?? '');
  const [fiats, setFiats] = useState<string[]>(['USD', 'EUR']);
  const [types, setTypes] = useState<Array<{ code: string; name: string }>>([]);
  const [items, setItems] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const seq = useRef(0);
  useEffect(() => { api<Array<{ code: string }>>('/fiats').then((r) => r.length && setFiats(r.map((x) => x.code))).catch(() => {}); }, []);
  useEffect(() => { api<any[]>(`/payment-method-types?fiat=${fiat}`).then(setTypes).catch(() => setTypes([])); }, [fiat]);
  const load = useCallback(async () => {
    const my = ++seq.current;
    const q = new URLSearchParams({ side, asset, fiat, limit: '30' });
    if (pm) q.set('paymentType', pm);
    const r = await api<{ items: any[] }>(`/ads?${q}`).catch(() => ({ items: [] }));
    if (my === seq.current) setItems(r.items);
  }, [side, asset, fiat, pm]);
  useEffect(() => { setItems(null); void load(); }, [load]);
  useEffect(() => {
    const s = socket(); s.emit('join', `ads:${asset}:${fiat}`);
    const on = () => void load(); s.on('book', on);
    return () => { s.off('book', on); };
  }, [asset, fiat, load]);

  // Per offer: the fiat leg and what the user gets. Buy: pay fiat → get crypto. Sell: sell crypto → get fiat.
  const rows = useMemo(() => (items ?? []).map((ad) => {
    const fiatLeg = side === 'buy' ? amount : amount ? fiatFor(amount, ad.price) : '';
    const get = !amount ? '' : side === 'buy' ? cryptoFor(amount, ad.price) : fiatFor(amount, ad.price);
    return { ad, fiatLeg, get, fits: inLimits(fiatLeg, ad) };
  }), [items, amount, side]);
  const usable = rows.filter((r) => r.fits);
  const best = usable[0] ?? rows[0];
  const offeredTypes = useMemo(() => {
    const seen = new Set<string>(); for (const r of items ?? []) for (const p of r.paymentTypes ?? []) seen.add(p);
    return types.filter((x) => seen.has(x.code)).slice(0, 4);
  }, [items, types]);
  const typeName = (c: string) => types.find((x) => x.code === c)?.name ?? c;
  const getUnit = side === 'buy' ? asset : fiat;
  const fmtGet = (v: string) => (side === 'buy' ? num(v, cdp(asset)) : num(v, 2));
  const verb = side === 'buy' ? 'market.buy' : 'market.sell';
  const open = (ad: any) => setSelected(ad);
  const ctaLabel = best?.get ? (side === 'buy' ? t('ui.buyAmount', { amount: fmtGet(best.get), asset }) : t('ui.sellFor', { amount: money(best.get, fiat) })) : t(side === 'buy' ? 'market.buyAction' : 'market.sellAction', { asset });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <h1 className="text-[32px] font-bold tracking-[-0.03em] sm:text-[40px]">{t(side === 'buy' ? 'market.buyAction' : 'market.sellAction', { asset })}</h1>
        <div className="flex rounded-full bg-muted p-1">
          {(['buy', 'sell'] as const).map((s) => (
            <button key={s} type="button" data-testid={`side-${s}`} onClick={() => setSide(s)}
              className={cn('rounded-full px-7 py-2.5 text-[15px] font-semibold', side === s ? 'bg-ink text-ink-foreground' : 'text-foreground')}>{t(s === 'buy' ? 'market.buy' : 'market.sell')}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        {/* Amount hero */}
        <Card className="relative overflow-hidden px-5 py-7 text-center sm:px-8">
          <div className="hero-glow pointer-events-none absolute inset-0" />
          <div className="relative">
            <div className="flex items-center justify-center gap-1.5 text-[15px] font-medium">
              {side === 'buy' ? t('ui.youPayIn') : t('ui.youSellIn')}
              <span className="relative inline-flex items-center">
                <select data-testid="fiat" aria-label={t('market.fiat')} value={side === 'buy' ? fiat : asset} onChange={(e) => (side === 'buy' ? (setFiat(e.target.value), setPm('')) : setAsset(e.target.value))}
                  className="cursor-pointer appearance-none bg-transparent pe-5 font-semibold focus:outline-none">
                  {(side === 'buy' ? fiats : ASSETS).map((x) => <option key={x} value={x} className="bg-card">{x}</option>)}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute end-0" />
              </span>
            </div>
            <input aria-label={t('market.amount')} inputMode="decimal" value={amount} placeholder="0"
              onChange={(e) => { const x = e.target.value.replace(',', '.').replace(/[^\d.]/g, ''); setAmount(x.split('.').length > 2 ? amount : x); }}
              className="num-xl mt-2 w-full bg-transparent text-center text-[72px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none sm:text-[96px]" data-testid="pay-amount" />
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-primary/70 px-4 py-1.5 text-[15px] font-semibold">
                {t('ui.youGet')} {best?.get ? `${fmtGet(best.get)} ${getUnit}` : '—'}
              </span>
              {side === 'sell' && (
                <select aria-label={t('market.fiat')} value={fiat} onChange={(e) => { setFiat(e.target.value); setPm(''); }} className="rounded-full bg-muted px-3 py-1.5 text-sm font-semibold focus:outline-none">{fiats.map((x) => <option key={x}>{x}</option>)}</select>
              )}
              {side === 'buy' && (
                <select aria-label={t('market.asset')} value={asset} onChange={(e) => setAsset(e.target.value)} className="rounded-full bg-muted px-3 py-1.5 text-sm font-semibold focus:outline-none">{ASSETS.map((x) => <option key={x}>{x}</option>)}</select>
              )}
            </div>
            <select data-testid="asset" value={asset} onChange={(e) => setAsset(e.target.value)} className="sr-only" aria-hidden tabIndex={-1}>{ASSETS.map((a) => <option key={a}>{a}</option>)}</select>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setPm('')} className={cn('rounded-full px-4 py-2 text-sm font-semibold', !pm ? 'bg-ink text-ink-foreground' : 'bg-muted text-foreground')}>{t('ui.anyMethod')}</button>
              {offeredTypes.map((x) => <button key={x.code} type="button" onClick={() => setPm(x.code)} className={cn('rounded-full px-4 py-2 text-sm font-semibold', pm === x.code ? 'bg-ink text-ink-foreground' : 'bg-muted text-foreground')}>{x.name}</button>)}
            </div>
            <Button size="lg" variant={side === 'buy' ? 'default' : 'sell'} className="mt-6 w-full max-w-md" disabled={!best} onClick={() => best && open(best.ad)} data-testid="best-cta">{ctaLabel}</Button>
          </div>
        </Card>

        {/* Best match */}
        <div className="grid gap-3">
          {best ? <>
            <Card className="flex items-center justify-between gap-3 p-6">
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">{t('ui.bestMatchOf', { n: usable.length || rows.length })} · <Link href={L(`/profile/${best.ad.advertiser.id}`)} className="hover:text-foreground">{t('ui.viewPassport')}</Link></div>
                <div className="mt-1 truncate text-[26px] font-semibold tracking-tight">{best.ad.advertiser.displayName}</div>
              </div>
              <Link href={L(`/profile/${best.ad.advertiser.id}`)} aria-label={t('ui.viewPassport')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted hover:brightness-110"><ArrowUpRight size={18} /></Link>
            </Card>
            <div className="grid grid-cols-3 gap-3">
              <Stat label={t('market.price')} pill={<Badge variant="warning">{t('ui.bestOfN', { n: rows.length })}</Badge>} value={`${num(best.ad.price, 8)} ${fiat}`} />
              <Stat label={t('ui.usualRelease')} pill={best.ad.advertiser.avgReleaseSec && best.ad.advertiser.avgReleaseSec < 300 ? <Badge variant="success">{t('ui.fast')}</Badge> : null} value={releaseLabel(best.ad.advertiser.avgReleaseSec, t)} />
              <Stat label={t('ui.protection')} pill={<Badge variant="success">{t('ui.escrowLocked')}</Badge>} value={best.ad.advertiser.verifiedBadge ? t('ui.merchantBond') : t('ui.escrow')} />
            </div>
          </> : <Card className="flex min-h-[260px] items-center justify-center p-6 text-center text-muted-foreground">{items === null ? <Skeleton className="h-40 w-full" /> : t('market.empty')}</Card>}
        </div>
      </div>

      {/* All offers */}
      <Card className="p-4 sm:p-6" data-testid="book">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-[22px] font-semibold tracking-tight">{t('ui.allOffers')}</h2><span className="text-sm text-muted-foreground">{t('ui.rankedByGet')}</span></div>
        <div className="hidden grid-cols-[1.6fr_1fr_1fr_1.1fr_1.2fr_auto] gap-4 border-b border-border py-3 text-[13px] text-muted-foreground md:grid">
          <span>{t('ui.trader')}</span><span>{t('market.price')}</span><span>{t('ui.usualRelease')}</span><span>{t('ui.protection')}</span><span>{t('ui.youGet')}</span><span className="w-20" />
        </div>
        {items === null && <div className="space-y-2 pt-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
        {items?.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t('market.empty')}</p>}
        {rows.map(({ ad, get, fits }, i) => (
          <div key={ad.id} data-testid="ad-row" className={cn('grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-border py-3.5 last:border-0 md:grid-cols-[1.6fr_1fr_1fr_1.1fr_1.2fr_auto]', !fits && 'opacity-50')}>
            <div className="flex min-w-0 items-center gap-2">
              <Link href={L(`/profile/${ad.advertiser.id}`)} className="truncate text-[16px] font-semibold hover:underline">{ad.advertiser.displayName}</Link>
              {i === 0 && fits && <Badge variant="success">{t('ui.best')}</Badge>}
            </div>
            <div className="num text-[15px] md:order-none" data-testid="ad-price">{num(ad.price, 8)}</div>
            <div className="text-[13px] text-muted-foreground md:text-[15px] md:text-foreground">{releaseLabel(ad.advertiser.avgReleaseSec, t)}</div>
            <div className="text-[13px] text-muted-foreground md:text-[15px] md:text-foreground">{ad.advertiser.verifiedBadge ? t('ui.merchantBond') : t('ui.escrow')}</div>
            <div className="num text-[15px] font-semibold">{get ? `${fmtGet(get)} ${getUnit}` : <span className="text-[13px] font-normal text-muted-foreground">{money(ad.minAmount, ad.fiat)} – {money(ad.maxAmount, ad.fiat)}</span>}</div>
            <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 md:col-span-1">
              <div className="flex flex-wrap gap-1 md:hidden">{ad.paymentTypes.map((p: string) => <span key={p} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{typeName(p)}</span>)}</div>
              <Button variant="soft" className="w-20" onClick={() => open(ad)} data-testid="trade">{t(verb)}</Button>
            </div>
          </div>
        ))}
      </Card>
      {selected && <TradeDialog ad={selected} side={side} initial={side === 'buy' ? amount : amount ? fiatFor(amount, selected.price) : ''} onClose={() => setSelected(null)} />}
      {!me && <p className="px-2 text-center text-xs text-muted-foreground">{t('ui.escrowNote')}</p>}
    </div>
  );
}

function Stat({ label, pill, value }: { label: string; pill: React.ReactNode; value: string }) {
  return (
    <Card className="flex min-h-[112px] flex-col justify-between p-3.5 sm:min-h-[150px] sm:p-5">
      <div className="space-y-2"><div className="text-[13px] font-medium leading-tight sm:text-[15px]">{label}</div><div className="hidden sm:block">{pill}</div></div>
      <div className="num mt-3 text-[16px] font-semibold leading-tight tracking-tight sm:mt-4 sm:text-[24px] sm:font-medium">{value}</div>
    </Card>
  );
}

export function TradeHome() { return <Suspense><TradeInner /></Suspense>; }
