'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, Plus, ShieldCheck } from 'lucide-react';
import { AssetIcon, Avatar, Button, Card, Input, Label, PayChip, Select, Tabs, Textarea, cn } from '@p2p/ui';
import { useI18n } from '../../../../lib/i18n';
import { useSession } from '../../../../lib/session';
import { api } from '../../../../lib/api';
import { useL } from '../../../../components/nav';
import { ErrorText } from '../../../../components/errors';

const ASSETS = ['USDT', 'BTC', 'ETH'];

function Section({ n, title, children }: { n: number; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{n}</span><h2 className="font-semibold">{title}</h2></div>
      {children}
    </Card>
  );
}

export default function NewAd() {
  const { t, money } = useI18n();
  const { me } = useSession();
  const L = useL();
  const router = useRouter();
  const [f, setF] = useState({ side: 'sell' as 'buy' | 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed' as 'fixed' | 'floating', price: '', margin: '0', totalAmount: '', minAmount: '', maxAmount: '', paymentWindowMin: '15', terms: '', minCounterpartyTier: '0' });
  const [methods, setMethods] = useState<any[]>([]);
  const [fiats, setFiats] = useState<string[]>(['EUR', 'USD']);
  const [selected, setSelected] = useState<string[]>([]);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<any[]>('/payment-methods').then(setMethods).catch(() => {});
    api<Array<{ code: string }>>('/fiats').then((r) => r.length && setFiats(r.map((x) => x.code))).catch(() => {});
  }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const dec = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/[^\d.-]/g, '') });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      // Margin in % with up to 2 decimals -> integer basis points without float math.
      const [mi, mf = ''] = f.margin.replace('-', '').split('.');
      const bps = (f.margin.startsWith('-') ? -1 : 1) * (Number(mi || '0') * 100 + Number((mf + '00').slice(0, 2)));
      await api('/ads', { body: {
        side: f.side, asset: f.asset, fiat: f.fiat, priceType: f.priceType, price: f.priceType === 'fixed' ? f.price : undefined, marginBps: f.priceType === 'floating' ? bps : undefined,
        totalAmount: f.totalAmount, minAmount: f.minAmount, maxAmount: f.maxAmount, paymentMethodIds: selected, paymentWindowMin: Number(f.paymentWindowMin), terms: f.terms, minCounterpartyTier: Number(f.minCounterpartyTier),
      } });
      router.push(L('/ads'));
    } catch (e) { setErr(e); setBusy(false); }
  };
  const name = me?.displayName ?? me?.email?.split('@')[0] ?? '—';
  return (
    <form onSubmit={submit} className="space-y-5">
      <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('ad.new')}</h1></div>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Section n={1} title={t('ui.stepPrice')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label>{t('ad.side')}</Label><Tabs size="lg" value={f.side} onChange={(v) => setF({ ...f, side: v })} options={[{ value: 'sell', label: t('ad.sideSell'), className: 'bg-sell text-white' }, { value: 'buy', label: t('ad.sideBuy'), className: 'bg-buy text-[#04130d]' }]} /></div>
              <div className="sm:col-span-2"><Label>{t('market.asset')}</Label>
                <div className="grid grid-cols-3 gap-2">{ASSETS.map((a) => (
                  <button key={a} type="button" onClick={() => setF({ ...f, asset: a })} className={cn('flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold', f.asset === a ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40')}><AssetIcon asset={a} size={18} />{a}</button>
                ))}</div></div>
              <div><Label htmlFor="fiat">{t('market.fiat')}</Label><Select id="fiat" value={f.fiat} onChange={set('fiat')}>{fiats.map((x) => <option key={x}>{x}</option>)}</Select></div>
              <div><Label>{t('ad.priceType')}</Label><Tabs value={f.priceType} onChange={(v) => setF({ ...f, priceType: v })} options={[{ value: 'fixed', label: t('ad.fixed') }, { value: 'floating', label: t('ad.floating') }]} className="w-full" /></div>
              {f.priceType === 'fixed'
                ? <div className="sm:col-span-2"><Label htmlFor="price">{t('ad.price')}</Label><div className="relative"><Input id="price" inputMode="decimal" className="num h-12 pe-16 text-lg font-semibold" value={f.price} onChange={dec('price')} required /><span className="absolute end-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">{f.fiat}</span></div></div>
                : <div className="sm:col-span-2"><Label htmlFor="margin">{t('ad.margin')}</Label><Input id="margin" inputMode="decimal" className="num h-12 text-lg font-semibold" value={f.margin} onChange={dec('margin')} /></div>}
            </div>
          </Section>
          <Section n={2} title={t('ui.stepAmount')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label htmlFor="total">{t('ad.total')} ({f.asset})</Label><Input id="total" inputMode="decimal" className="num" value={f.totalAmount} onChange={dec('totalAmount')} required /></div>
              <div><Label htmlFor="min">{t('ad.min')} ({f.fiat})</Label><Input id="min" inputMode="decimal" className="num" value={f.minAmount} onChange={dec('minAmount')} required /></div>
              <div><Label htmlFor="max">{t('ad.max')} ({f.fiat})</Label><Input id="max" inputMode="decimal" className="num" value={f.maxAmount} onChange={dec('maxAmount')} required /></div>
            </div>
          </Section>
          <Section n={3} title={t('ui.stepPayment')}>
            <div className="space-y-4">
              <div><Label>{t('ad.methods')}</Label>
                {methods.length === 0 && <Link href={L('/wallet#payment-methods')} className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground hover:border-primary hover:text-foreground"><Plus size={15} />{t('wallet.addMethod')}</Link>}
                <div className="grid gap-2 sm:grid-cols-2">{methods.map((m) => {
                  const on = selected.includes(m.id);
                  return (
                    <label key={m.id} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors', on ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40')}>
                      <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" data-testid={`pm-${m.type}`} checked={on} onChange={(e) => setSelected(e.target.checked ? [...selected, m.id] : selected.filter((x) => x !== m.id))} />
                      <PayChip code={m.type} /><span className="truncate text-muted-foreground">{m.holderName}</span>
                    </label>);
                })}</div></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label htmlFor="window">{t('ad.window')}</Label><Select id="window" value={f.paymentWindowMin} onChange={set('paymentWindowMin')}>{['15', '30', '45', '60', '120'].map((n) => <option key={n} value={n}>{t('common.minutes', { n })}</option>)}</Select></div>
                <div><Label htmlFor="tier">{t('ad.minTier')}</Label><Select id="tier" value={f.minCounterpartyTier} onChange={set('minCounterpartyTier')}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</Select></div>
              </div>
              <div><Label htmlFor="terms">{t('ad.terms')}</Label><Textarea id="terms" rows={4} value={f.terms} onChange={set('terms')} maxLength={2000} /></div>
            </div>
          </Section>
        </div>

        {/* Live preview */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('ui.preview')}</div>
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-3"><Avatar name={name} seed={me?.id} size={40} /><div><div className="font-semibold">{name}</div><div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock size={11} />{t('common.minutes', { n: f.paymentWindowMin })}</div></div></div>
              <div><div className="text-xs text-muted-foreground">{t('market.price')}</div><div className="num text-3xl font-bold tracking-tight">{f.priceType === 'fixed' ? (f.price ? money(f.price, f.fiat) : '—') : `${f.margin || 0}%`}</div></div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">{t('market.available')}</div><div className="num font-medium">{f.totalAmount || '0'} {f.asset}</div></div>
                <div><div className="text-xs text-muted-foreground">{t('market.limits')}</div><div className="num font-medium">{f.minAmount || '0'} – {f.maxAmount || '0'}</div></div>
              </div>
              <div className="flex flex-wrap gap-1.5">{methods.filter((m) => selected.includes(m.id)).map((m) => <PayChip key={m.id} code={m.type} />)}</div>
              <Button type="button" tabIndex={-1} variant={f.side === 'sell' ? 'buy' : 'sell'} className="pointer-events-none w-full">{t(f.side === 'sell' ? 'market.buyAction' : 'market.sellAction', { asset: f.asset })}</Button>
            </div>
          </Card>
          <div className="flex items-start gap-2 rounded-2xl bg-primary/10 p-4 text-xs leading-relaxed"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />{t('ui.why1d')}</div>
          <ErrorText error={err} />
          <Button type="submit" size="lg" className="w-full" loading={busy} data-testid="publish-ad">{t('ad.submit')}</Button>
        </div>
      </div>
    </form>
  );
}
