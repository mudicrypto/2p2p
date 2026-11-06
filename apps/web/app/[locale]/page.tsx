'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Input, Select, Tabs, Badge } from '@p2p/ui';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import { useL } from '../../components/nav';
import { TradeDialog } from '../../components/trade-dialog';

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
  useEffect(() => { api<Array<{ code: string }>>('/fiats').then((r) => r.length && setFiats(r.map((x) => x.code))).catch(() => {}); }, []);
  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

  const load = useCallback(async (more = false) => {
    const q = new URLSearchParams({ side, asset, fiat, limit: '20' });
    if (amount) q.set('amount', amount);
    if (paymentType) q.set('paymentType', paymentType);
    if (merchantOnly) q.set('merchantOnly', 'true');
    if (more && cursor) q.set('cursor', cursor);
    const r = await api<{ items: any[]; nextCursor: string | null }>(`/ads?${q}`).catch(() => ({ items: [], nextCursor: null }));
    setItems((prev) => (more ? [...prev, ...r.items] : r.items));
    setCursor(r.nextCursor);
  }, [side, asset, fiat, amount, paymentType, merchantOnly, cursor]);

  useEffect(() => { void load(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [side, asset, fiat, amount, paymentType, merchantOnly]);
  useEffect(() => { api<any[]>(`/payment-method-types?fiat=${fiat}`).then(setTypes).catch(() => setTypes([])); }, [fiat]);
  useEffect(() => {
    const s = socket();
    const room = `ads:${asset}:${fiat}`;
    s.emit('join', room);
    const on = () => void load(false);
    s.on('book', on);
    return () => { s.off('book', on); };
  }, [asset, fiat, load]);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">{t('app.tagline')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={side} onChange={setSide} options={[{ value: 'buy', label: t('market.buy'), className: 'bg-emerald-600 text-white' }, { value: 'sell', label: t('market.sell'), className: 'bg-rose-600 text-white' }]} />
        <label className="space-y-1"><span className="text-xs text-muted-foreground">{t('market.asset')}</span>
          <Select data-testid="asset" value={asset} onChange={(e) => setAsset(e.target.value)} className="w-28">{ASSETS.map((a) => <option key={a}>{a}</option>)}</Select></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">{t('market.fiat')}</span>
          <Select data-testid="fiat" value={fiat} onChange={(e) => setFiat(e.target.value)} className="w-28">{fiats.map((f) => <option key={f}>{f}</option>)}</Select></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">{t('market.amount')}</span>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} className="w-32" placeholder={fiat} /></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">{t('market.paymentMethod')}</span>
          <Select value={paymentType} onChange={(e) => setPaymentType(e.target.value)} className="w-44"><option value="">{t('market.any')}</option>{types.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={merchantOnly} onChange={(e) => setMerchantOnly(e.target.checked)} />{t('market.merchantOnly')}</label>
      </div>
      <div className="space-y-2" data-testid="book">
        {items.length === 0 && <Card className="p-6 text-center text-muted-foreground">{t('market.empty')}</Card>}
        {items.map((ad) => (
          <Card key={ad.id} className="grid grid-cols-2 items-center gap-3 p-4 sm:grid-cols-[2fr_1fr_2fr_1fr_auto]" data-testid="ad-row">
            <div className="col-span-2 sm:col-span-1">
              <Link href={L(`/profile/${ad.advertiser.id}`)} className="font-medium hover:underline">{ad.advertiser.displayName}</Link>
              {ad.advertiser.verifiedBadge && <Badge variant="info" className="ms-2">✓</Badge>}
              <div className="text-xs text-muted-foreground">{t('market.trades', { count: ad.advertiser.trades30d })} · {t('market.completion', { rate: pct(ad.advertiser.completionRateBps) })}</div>
            </div>
            <div className="text-lg font-semibold" data-testid="ad-price">{money(ad.price, ad.fiat)}</div>
            <div className="text-sm">
              <div>{t('market.available')}: {num(ad.remainingAmount)} {ad.asset}</div>
              <div className="text-muted-foreground">{t('market.limits')}: {money(ad.minAmount, ad.fiat)} – {money(ad.maxAmount, ad.fiat)}</div>
            </div>
            <div className="flex flex-wrap gap-1">{ad.paymentTypes.map((p: string) => <Badge key={p}>{p}</Badge>)}</div>
            <Button variant={side === 'buy' ? 'buy' : 'sell'} onClick={() => setSelected(ad)} data-testid="trade">
              {t(side === 'buy' ? 'market.buyAction' : 'market.sellAction', { asset: ad.asset })}
            </Button>
          </Card>
        ))}
        {cursor && <Button variant="outline" onClick={() => load(true)}>{t('market.loadMore')}</Button>}
      </div>
      {selected && <TradeDialog ad={selected} side={side} onClose={() => setSelected(null)} />}
    </div>
  );
}
