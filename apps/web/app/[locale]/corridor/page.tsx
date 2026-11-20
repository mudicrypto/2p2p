'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowRight, Globe2, Zap } from 'lucide-react';
import { AmountField, AssetIcon, Button, Card, Label, Select } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';
import { useL } from '../../../components/nav';
import { ErrorText } from '../../../components/errors';

/** One-tap fiat A -> fiat B (two linked orders with a shared timer). */
export default function Corridor() {
  const { t, money } = useI18n();
  const L = useL();
  const [fiats, setFiats] = useState<string[]>(['EUR', 'BRL']);
  const [pms, setPms] = useState<any[]>([]);
  const [f, setF] = useState({ fromFiat: 'EUR', toFiat: 'BRL', fiatIn: '', receivePaymentMethodId: '' });
  const [q, setQ] = useState<any>(null);
  const [c, setC] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => {
    api<Array<{ code: string }>>('/fiats').then((r) => r.length && setFiats(r.map((x) => x.code))).catch(() => {});
    api<any[]>('/payment-methods').then((r) => { setPms(r); if (r[0]) setF((x) => ({ ...x, receivePaymentMethodId: r[0].id })); }).catch(() => {});
  }, []);
  const run = async (path: string, set: (v: any) => void) => { setErr(null); try { set(await api(path, { body: f })); } catch (e) { setErr(e); } };
  const upd = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setQ(null); };
  return (
    <div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-[1fr_440px]">
      <div className="space-y-5 pt-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"><Globe2 size={13} className="text-primary" />USDT</div>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl"><span className="text-gradient">{t('corridor.title')}</span></h1>
        <p className="max-w-md text-muted-foreground">{t('ui.corridorSub')}</p>
        <ol className="space-y-3 text-sm">
          <li className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-bold">1</span>{t('corridor.leg1')}</li>
          <li className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-bold">2</span>{t('corridor.leg2')}</li>
        </ol>
      </div>
      <Card className="space-y-4 p-5 sm:p-6">
        <div className="relative space-y-2">
          <AmountField id="amt" label={t('corridor.amount')} unit={<Select aria-label={t('corridor.from')} value={f.fromFiat} onChange={(e) => upd({ fromFiat: e.target.value })} className="h-8 w-24 border-0 bg-transparent px-1 font-semibold">{fiats.map((x) => <option key={x}>{x}</option>)}</Select>} value={f.fiatIn} onChange={(e) => upd({ fiatIn: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0.00" />
          <div className="flex justify-center"><span className="rounded-full border border-border bg-card p-1.5 text-muted-foreground"><ArrowDown size={14} /></span></div>
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <div className="text-xs text-muted-foreground">{t('trade.youReceive')}</div>
            <div className="mt-1 flex items-center justify-between gap-2"><span className="num text-2xl font-bold">{q ? money(q.youReceive, q.toFiat) : '—'}</span>
              <Select aria-label={t('corridor.to')} value={f.toFiat} onChange={(e) => upd({ toFiat: e.target.value })} className="h-8 w-24 border-0 bg-transparent px-1 font-semibold">{fiats.map((x) => <option key={x}>{x}</option>)}</Select></div>
          </div>
        </div>
        <div><Label>{t('corridor.receiveVia')}</Label><Select value={f.receivePaymentMethodId} onChange={(e) => upd({ receivePaymentMethodId: e.target.value })}>{pms.map((p) => <option key={p.id} value={p.id}>{p.type} · {p.holderName}</option>)}</Select></div>
        {q && <div className="space-y-2 rounded-2xl bg-muted/50 p-4 text-sm" data-testid="corridor-quote-result">
          <div className="flex justify-between"><span className="text-muted-foreground">{t('trade.youPay')}</span><b className="num">{money(q.youPay, q.fromFiat)}</b></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t('trade.youReceive')}</span><b className="num">{money(q.youReceive, q.toFiat)}</b></div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><AssetIcon asset="USDT" size={14} />{t('corridor.via', { amount: q.viaUsdt })}</div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t('corridor.effective')}</span><span className="num">1 {q.fromFiat} = {q.effectiveRate} {q.toFiat}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t('corridor.market')}</span><span className="num">1 {q.fromFiat} = {q.marketRate} {q.toFiat}</span></div>
          <div className="text-xs text-warn">{t('corridor.spread', { pct: q.spreadPct })}</div>
        </div>}
        {!q && <Button size="lg" variant="soft" className="w-full" disabled={!f.fiatIn || !f.receivePaymentMethodId} onClick={() => run('/corridors/quote', setQ)} data-testid="corridor-quote">{t('corridor.quote')}</Button>}
        {q && !c && <Button size="lg" className="w-full" onClick={() => run('/corridors', setC)} data-testid="corridor-start"><Zap size={16} />{t('corridor.start')}</Button>}
        {c && <div className="space-y-2">
          <Link className="flex items-center justify-between rounded-xl border border-border p-3 text-sm hover:border-primary" href={L(`/orders/${c.buyOrderId}`)}>{t('corridor.leg1')}<ArrowRight size={15} className="rtl:-scale-x-100" /></Link>
          <Link className="flex items-center justify-between rounded-xl border border-border p-3 text-sm hover:border-primary" href={L(`/orders/${c.sellOrderId}`)}>{t('corridor.leg2')}<ArrowRight size={15} className="rtl:-scale-x-100" /></Link>
        </div>}
        <ErrorText error={err} />
      </Card>
    </div>
  );
}
