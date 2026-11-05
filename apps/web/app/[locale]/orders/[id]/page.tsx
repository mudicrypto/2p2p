'use client';
import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@p2p/ui';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { socket } from '@/lib/socket';
import { Chat } from '@/components/chat';
import { ErrorText } from '@/components/errors';
import { useL } from '@/components/nav';

function useCountdown(to?: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  if (!to) return null;
  const s = Math.max(0, Math.floor((new Date(to).getTime() - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const variant = (s: string) => (s === 'COMPLETED' ? 'success' : s === 'CANCELLED' ? 'default' : s === 'DISPUTED' ? 'danger' : 'warning');

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, money, num } = useI18n();
  const L = useL();
  const [o, setO] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  const [totp, setTotp] = useState('');
  const [fb, setFb] = useState(false);
  const load = useCallback(() => api(`/orders/${id}`).then(setO).catch(setErr), [id]);
  useEffect(() => {
    void load();
    const s = socket();
    const join = () => s.emit('join', `order:${id}`);
    join(); s.on('connect', join);
    const on = (p: any) => { if (p.type === 'order.status') void load(); };
    s.on('order', on);
    return () => { s.off('order', on); s.off('connect', join); };
  }, [id, load]);
  const left = useCountdown(o?.status === 'AWAITING_PAYMENT' ? o.expiresAt : null);
  const disputeIn = useCountdown(o?.status === 'PAID' ? o.disputeAvailableAt : null);
  if (!o) return err ? <ErrorText error={err} /> : <p>{t('common.loading')}</p>;
  const act = async (path: string, body?: unknown) => { setErr(null); try { setO(await api(`/orders/${id}/${path}`, { body: body ?? {} })); } catch (e) { setErr(e); } };
  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-4">
        <Card><CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">{t(`order.role.${o.role}`)} {num(o.cryptoAmount)} {o.asset}
            <Badge variant={variant(o.status) as any} data-testid="order-status" data-status={o.status}>{t(`order.status.${o.status}`)}</Badge></CardTitle>
          <p className="text-sm text-muted-foreground">{t('order.counterparty')}: <Link className="underline" href={L(`/profile/${o.counterparty?.id}`)}>{o.counterparty?.displayName ?? o.counterparty?.id?.slice(0, 8)}</Link></p>
        </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>{t('order.amount')}</div><div className="text-end font-semibold" data-testid="fiat-amount">{money(o.fiatAmount, o.fiat)}</div>
              <div>{t('order.price')}</div><div className="text-end">{money(o.price, o.fiat)}</div>
              <div>{t('order.fee')}</div><div className="text-end">{num(o.fee)} {o.asset}</div>
              {left && <><div>{t('order.timeLeft')}</div><div className="text-end font-mono" data-testid="countdown">{left}</div></>}
            </div>
            <div className="rounded-md border border-dashed p-3"><div className="text-xs text-muted-foreground">{t('order.reference')}</div><div className="font-mono text-lg" data-testid="reference">{o.referenceCode}</div></div>
            {o.payee && <div className="rounded-md bg-muted p-3"><div className="font-medium">{t('order.payTo')} · {o.payee.type}</div>
              <div>{t('order.holder')}: {o.payee.holderName}</div>
              {Object.entries(o.payee.details ?? {}).map(([k, v]) => <div key={k} className="font-mono">{k}: {String(v)}</div>)}</div>}
            <ErrorText error={err} />
            {o.role === 'buyer' && o.status === 'AWAITING_PAYMENT' && <>
              <Alert>{t('order.confirmPaid', { amount: money(o.fiatAmount, o.fiat) })}</Alert>
              <div className="flex gap-2"><Button variant="buy" className="flex-1" onClick={() => act('paid')} data-testid="mark-paid">{t('order.markPaid')}</Button>
                <Button variant="outline" onClick={() => act('cancel')} data-testid="cancel">{t('order.cancel')}</Button></div>
            </>}
            {o.role === 'seller' && o.status === 'PAID' && <>
              <Alert>{t('order.releaseHint')}</Alert>
              <div className="flex items-end gap-2"><div className="flex-1"><Label htmlFor="totp">{t('order.totp')}</Label><Input id="totp" data-testid="release-totp" inputMode="numeric" value={totp} onChange={(e) => setTotp(e.target.value)} /></div>
                <Button variant="sell" onClick={() => act('release', { totp })} data-testid="release">{t('order.release')}</Button></div>
            </>}
            {o.status === 'PAID' && disputeIn && disputeIn !== '0:00' && <p className="text-xs text-muted-foreground">{t('order.disputeIn', { time: disputeIn })}</p>}
            {o.status === 'COMPLETED' && !fb && <div className="flex items-center gap-2"><span>{t('order.feedback')}:</span>
              <Button size="sm" variant="buy" data-testid="feedback-positive" onClick={async () => { await api(`/orders/${id}/feedback`, { body: { positive: true } }).catch(() => {}); setFb(true); }}>👍 {t('order.positive')}</Button>
              <Button size="sm" variant="outline" onClick={async () => { await api(`/orders/${id}/feedback`, { body: { positive: false } }).catch(() => {}); setFb(true); }}>👎 {t('order.negative')}</Button></div>}
            {fb && <Alert variant="success" data-testid="feedback-thanks">{t('order.thanks')}</Alert>}
          </CardContent></Card>
      </div>
      <Chat orderId={id} />
    </div>
  );
}
