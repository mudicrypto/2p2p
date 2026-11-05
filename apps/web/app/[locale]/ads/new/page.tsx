'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Tabs, Textarea } from '@p2p/ui';
import { useI18n } from '../../../../lib/i18n';
import { api } from '../../../../lib/api';
import { useL } from '../../../../components/nav';
import { ErrorText } from '../../../../components/errors';

export default function NewAd() {
  const { t } = useI18n();
  const L = useL();
  const router = useRouter();
  const [f, setF] = useState({ side: 'sell' as 'buy' | 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed' as 'fixed' | 'floating', price: '', margin: '0', totalAmount: '', minAmount: '', maxAmount: '', paymentWindowMin: '15', terms: '', minCounterpartyTier: '0' });
  const [methods, setMethods] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { api<any[]>('/payment-methods').then(setMethods).catch(() => {}); }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    try {
      // Margin in % with up to 2 decimals -> integer basis points without float math.
      const [mi, mf = ''] = f.margin.replace('-', '').split('.');
      const bps = (f.margin.startsWith('-') ? -1 : 1) * (Number(mi || '0') * 100 + Number((mf + '00').slice(0, 2)));
      await api('/ads', { body: {
        side: f.side, asset: f.asset, fiat: f.fiat, priceType: f.priceType, price: f.priceType === 'fixed' ? f.price : undefined, marginBps: f.priceType === 'floating' ? bps : undefined,
        totalAmount: f.totalAmount, minAmount: f.minAmount, maxAmount: f.maxAmount, paymentMethodIds: selected, paymentWindowMin: Number(f.paymentWindowMin), terms: f.terms, minCounterpartyTier: Number(f.minCounterpartyTier),
      } });
      router.push(L('/wallet'));
    } catch (e) { setErr(e); }
  };
  return (
    <Card className="mx-auto max-w-xl"><CardHeader><CardTitle>{t('ad.new')}</CardTitle></CardHeader>
      <CardContent><form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>{t('ad.side')}</Label><div className="mt-1"><Tabs value={f.side} onChange={(v) => setF({ ...f, side: v })} options={[{ value: 'sell', label: t('ad.sideSell') }, { value: 'buy', label: t('ad.sideBuy') }]} /></div></div>
        <div><Label>{t('market.asset')}</Label><Select value={f.asset} onChange={set('asset')}>{['USDT', 'BTC', 'ETH'].map((a) => <option key={a}>{a}</option>)}</Select></div>
        <div><Label>{t('market.fiat')}</Label><Input value={f.fiat} maxLength={3} onChange={(e) => setF({ ...f, fiat: e.target.value.toUpperCase() })} /></div>
        <div><Label>{t('ad.priceType')}</Label><Select value={f.priceType} onChange={set('priceType')}><option value="fixed">{t('ad.fixed')}</option><option value="floating">{t('ad.floating')}</option></Select></div>
        {f.priceType === 'fixed'
          ? <div><Label htmlFor="price">{t('ad.price')}</Label><Input id="price" inputMode="decimal" value={f.price} onChange={set('price')} required /></div>
          : <div><Label htmlFor="margin">{t('ad.margin')}</Label><Input id="margin" inputMode="decimal" value={f.margin} onChange={set('margin')} /></div>}
        <div><Label htmlFor="total">{t('ad.total')} ({f.asset})</Label><Input id="total" inputMode="decimal" value={f.totalAmount} onChange={set('totalAmount')} required /></div>
        <div><Label htmlFor="window">{t('ad.window')}</Label><Input id="window" inputMode="numeric" value={f.paymentWindowMin} onChange={set('paymentWindowMin')} /></div>
        <div><Label htmlFor="min">{t('ad.min')} ({f.fiat})</Label><Input id="min" inputMode="decimal" value={f.minAmount} onChange={set('minAmount')} required /></div>
        <div><Label htmlFor="max">{t('ad.max')} ({f.fiat})</Label><Input id="max" inputMode="decimal" value={f.maxAmount} onChange={set('maxAmount')} required /></div>
        <div className="sm:col-span-2"><Label>{t('ad.methods')}</Label>
          <div className="mt-1 flex flex-wrap gap-3">{methods.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm"><input type="checkbox" data-testid={`pm-${m.type}`} checked={selected.includes(m.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, m.id] : selected.filter((x) => x !== m.id))} />{m.type} · {m.holderName}</label>
          ))}</div></div>
        <div><Label>{t('ad.minTier')}</Label><Select value={f.minCounterpartyTier} onChange={set('minCounterpartyTier')}>{[0, 1, 2, 3].map((n) => <option key={n}>{n}</option>)}</Select></div>
        <div className="sm:col-span-2"><Label htmlFor="terms">{t('ad.terms')}</Label><Textarea id="terms" value={f.terms} onChange={set('terms')} maxLength={2000} /></div>
        <div className="sm:col-span-2"><ErrorText error={err} /></div>
        <Button type="submit" className="sm:col-span-2" data-testid="publish-ad">{t('ad.submit')}</Button>
      </form></CardContent></Card>
  );
}
