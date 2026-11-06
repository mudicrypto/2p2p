'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from '@p2p/ui';
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
    api<Array<{ code: string }>>('/fiats').then((r) => setFiats(r.map((x) => x.code))).catch(() => {});
    api<any[]>('/payment-methods').then((r) => { setPms(r); if (r[0]) setF((x) => ({ ...x, receivePaymentMethodId: r[0].id })); }).catch(() => {});
  }, []);
  const run = async (path: string, set: (v: any) => void) => { setErr(null); try { set(await api(path, { body: f })); } catch (e) { setErr(e); } };
  return (
    <Card className="mx-auto max-w-lg"><CardHeader><CardTitle>{t('corridor.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><Label>{t('corridor.from')}</Label><Select value={f.fromFiat} onChange={(e) => setF({ ...f, fromFiat: e.target.value })}>{fiats.map((x) => <option key={x}>{x}</option>)}</Select></div>
          <div><Label>{t('corridor.to')}</Label><Select value={f.toFiat} onChange={(e) => setF({ ...f, toFiat: e.target.value })}>{fiats.map((x) => <option key={x}>{x}</option>)}</Select></div>
        </div>
        <div><Label htmlFor="amt">{t('corridor.amount')} ({f.fromFiat})</Label><Input id="amt" inputMode="decimal" value={f.fiatIn} onChange={(e) => setF({ ...f, fiatIn: e.target.value.replace(/[^\d.]/g, '') })} /></div>
        <div><Label>{t('corridor.receiveVia')}</Label><Select value={f.receivePaymentMethodId} onChange={(e) => setF({ ...f, receivePaymentMethodId: e.target.value })}>{pms.map((p) => <option key={p.id} value={p.id}>{p.type} · {p.holderName}</option>)}</Select></div>
        <Button variant="outline" className="w-full" disabled={!f.fiatIn || !f.receivePaymentMethodId} onClick={() => run('/corridors/quote', setQ)} data-testid="corridor-quote">{t('corridor.quote')}</Button>
        {q && <div className="space-y-1 rounded-md bg-muted p-3 text-sm" data-testid="corridor-quote-result">
          <div className="flex justify-between"><span>{t('trade.youPay')}</span><b>{money(q.youPay, q.fromFiat)}</b></div>
          <div className="flex justify-between"><span>{t('trade.youReceive')}</span><b>{money(q.youReceive, q.toFiat)}</b></div>
          <div className="text-xs text-muted-foreground">{t('corridor.via', { amount: q.viaUsdt })}</div>
          <div className="flex justify-between"><span>{t('corridor.effective')}</span><span>1 {q.fromFiat} = {q.effectiveRate} {q.toFiat}</span></div>
          <div className="flex justify-between"><span>{t('corridor.market')}</span><span>1 {q.fromFiat} = {q.marketRate} {q.toFiat}</span></div>
          <div className="text-xs">{t('corridor.spread', { pct: q.spreadPct })}</div>
        </div>}
        {q && !c && <Button className="w-full" onClick={() => run('/corridors', setC)} data-testid="corridor-start">{t('corridor.start')}</Button>}
        {c && <Alert variant="success"><div><Link className="underline" href={L(`/orders/${c.buyOrderId}`)}>{t('corridor.leg1')}</Link></div><div><Link className="underline" href={L(`/orders/${c.sellOrderId}`)}>{t('corridor.leg2')}</Link></div></Alert>}
        <ErrorText error={err} />
      </CardContent></Card>
  );
}
