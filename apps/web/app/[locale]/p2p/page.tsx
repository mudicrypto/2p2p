'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Clock, RefreshCw, ShieldCheck, ThumbsUp } from 'lucide-react';
import { AssetIcon, Avatar, Button, Input, PayChip, Select, Skeleton, Tabs, cn } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';
import { socket } from '../../../lib/socket';
import { useL } from '../../../components/nav';
import { TradeDialog } from '../../../components/trade-dialog';

const ASSETS = ['USDT', 'BTC', 'ETH'];
const DEFAULT_FIATS = ['EUR', 'USD'];

export default function Market() {
  const { t, num, money, pct } = useI18n();
  const L = useL();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [asset, setAsset] = useState('USDT');
  const [fiat, setFiat] = useState('EUR');
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [merchantOnly, setMerchantOnly] = useState(false);
  const [types, setTypes] = useState<Array<{ code: string; name: string }>>([]);
  const [fiats, setFiats] = useState<string[]>(DEFAULT_FIATS);
  const [items, setItems] = useState<any[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [spin, setSpin] = useState(false);
  useEffect(() => { api<Array<{ code: string }>>('/fiats').then((r) => r.length && setFiats(r.map((x) => x.code))).catch(() => {}); }, []);

  const load = useCallback(async (more = false) => {
    const q = new URLSearchParams({ side, asset, fiat, limit: '20' });
    if (amount) q.set('amount', amount);
    if (paymentType) q.set('paymentType', paymentType);
    if (merchantOnly) q.set('merchantOnly', 'true');
    if (more && cursor) q.set('cursor', cursor);
    setSpin(true);
    const r = await api<{ items: any[]; nextCursor: string | null }>(`/ads?${q}`).catch(() => ({ items: [], nextCursor: null }));
    setItems((prev) => (more ? [...(prev ?? []), ...r.items] : r.items));
    setCursor(r.nextCursor);
    setTimeout(() => setSpin(false), 400);
  }, [side, asset, fiat, amount, paymentType, merchantOnly, cursor]);

  useEffect(() => { void load(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [side, asset, fiat, amount, paymentType, merchantOnly]);
  useEffect(() => { api<any[]>(`/payment-method-types?fiat=${fiat}`).then(setTypes).catch(() => setTypes([])); }, [fiat]);
  useEffect(() => {
    const s = socket();
    s.emit('join', `ads:${asset}:${fiat}`);
    const on = () => void load(false);
    s.on('book', on);
    return () => { s.off('book', on); };
  }, [asset, fiat, load]);
  const typeName = (c: string) => types.find((x) => x.code === c)?.name;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t(side === 'buy' ? 'market.buyAction' : 'market.sellAction', { asset })} <span className="text-muted-foreground">· {fiat}</span></h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><ShieldCheck size={15} className="text-buy" />{t('ui.why1t')} · {t('ui.statTakerFee')} 0%</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs size="lg" value={side} onChange={setSide} options={[{ value: 'buy', label: t('market.buy'), className: 'bg-buy text-[#04130d]' }, { value: 'sell', label: t('market.sell'), className: 'bg-sell text-white' }]} />
        <div className="flex gap-1 overflow-x-auto">
          {ASSETS.map((a) => (
            <button key={a} onClick={() => setAsset(a)} className={cn('flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors', asset === a ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              <AssetIcon asset={a} size={20} />{a}
            </button>
          ))}
        </div>
        <select data-testid="asset" value={asset} onChange={(e) => setAsset(e.target.value)} className="sr-only" aria-label={t('market.asset')}>{ASSETS.map((a) => <option key={a}>{a}</option>)}</select>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-3 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:w-56">
          <Input inputMode="decimal" aria-label={t('market.amount')} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder={t('market.amount')} className="pe-16" />
          <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{fiat}</span>
        </div>
        <Select data-testid="fiat" aria-label={t('market.fiat')} value={fiat} onChange={(e) => setFiat(e.target.value)} className="sm:w-28">{fiats.map((f) => <option key={f}>{f}</option>)}</Select>
        <Select aria-label={t('market.paymentMethod')} value={paymentType} onChange={(e) => setPaymentType(e.target.value)} className="sm:w-52"><option value="">{t('market.paymentMethod')}: {t('market.any')}</option>{types.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select>
        <label className="col-span-2 flex cursor-pointer items-center gap-2 px-1 text-sm text-muted-foreground sm:col-span-1">
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={merchantOnly} onChange={(e) => setMerchantOnly(e.target.checked)} /><BadgeCheck size={15} className="text-primary" />{t('market.merchantOnly')}
        </label>
        <Button variant="ghost" size="icon" className="ms-auto hidden sm:inline-flex" aria-label={t('ui.refresh')} onClick={() => load(false)}><RefreshCw size={16} className={cn(spin && 'animate-spin')} /></Button>
      </div>

      <div data-testid="book">
        <div className="hidden grid-cols-[2.2fr_1.3fr_2fr_1.6fr_auto] gap-4 px-5 pb-2 text-xs font-medium text-muted-foreground lg:grid">
          <span>{t('market.advertiser')}</span><span>{t('market.price')}</span><span>{t('market.available')} / {t('market.limits')}</span><span>{t('market.paymentMethod')}</span><span className="w-32" />
        </div>
        <div className="space-y-2">
          {items === null && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-2xl" />)}
          {items?.length === 0 && <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">{t('market.empty')}</div>}
          {items?.map((ad) => (
            <div key={ad.id} data-testid="ad-row" className="grid grid-cols-2 items-center gap-x-4 gap-y-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 lg:grid-cols-[2.2fr_1.3fr_2fr_1.6fr_auto] lg:px-5">
              <div className="col-span-2 flex items-center gap-3 lg:col-span-1">
                <Avatar name={ad.advertiser.displayName} seed={ad.advertiser.id} size={40} />
                <div className="min-w-0">
                  <Link href={L(`/profile/${ad.advertiser.id}`)} className="flex items-center gap-1 truncate font-semibold hover:text-primary">{ad.advertiser.displayName}{ad.advertiser.verifiedBadge && <BadgeCheck size={15} className="text-primary" />}</Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span>{t('market.trades', { count: ad.advertiser.trades30d })}</span>
                    <span className="flex items-center gap-1"><ThumbsUp size={11} />{pct(ad.advertiser.completionRateBps)}</span>
                    <span className="flex items-center gap-1"><Clock size={11} />{ad.paymentWindowMin} min</span>
                  </div>
                </div>
              </div>
              <div><div className="num text-xl font-bold tracking-tight" data-testid="ad-price">{money(ad.price, ad.fiat)}</div></div>
              <div className="text-end text-[13px] lg:text-start">
                <div className="num font-medium">{num(ad.remainingAmount, 6)} {ad.asset}</div>
                <div className="num text-muted-foreground">{money(ad.minAmount, ad.fiat)} – {money(ad.maxAmount, ad.fiat)}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">{ad.paymentTypes.map((p: string) => <PayChip key={p} code={p} label={typeName(p)} />)}</div>
              <Button variant={side} className="w-full lg:w-32" onClick={() => setSelected(ad)} data-testid="trade">
                {t(side === 'buy' ? 'market.buyAction' : 'market.sellAction', { asset: ad.asset })}
              </Button>
            </div>
          ))}
        </div>
        {cursor && <div className="mt-4 text-center"><Button variant="outline" onClick={() => load(true)}>{t('market.loadMore')}</Button></div>}
      </div>
      {selected && <TradeDialog ad={selected} side={side} onClose={() => setSelected(null)} />}
    </div>
  );
}
