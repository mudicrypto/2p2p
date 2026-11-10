'use client';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, Gavel, Paperclip, ShieldCheck, ThumbsDown, ThumbsUp, Timer, XCircle } from 'lucide-react';
import { Alert, AssetIcon, Avatar, Badge, Button, Card, CopyButton, Dialog, Input, Label, PayChip, Select, Skeleton, Stepper, Textarea, cn } from '@p2p/ui';
import { useI18n } from '../../../../lib/i18n';
import { api } from '../../../../lib/api';
import { socket } from '../../../../lib/socket';
import { Chat, uploadAttachment } from '../../../../components/chat';
import { ErrorText } from '../../../../components/errors';
import { useL } from '../../../../components/nav';

function useCountdown(to?: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  if (!to) return null;
  const s = Math.max(0, Math.floor((new Date(to).getTime() - now) / 1000));
  return { text: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, s };
}
const variant = (s: string) => (s === 'COMPLETED' ? 'success' : s === 'CANCELLED' ? 'default' : s === 'DISPUTED' ? 'danger' : 'warning');
const REASONS = [['not_paid', 'ui.rNotPaid'], ['not_released', 'ui.rNotReleased'], ['wrong_amount', 'ui.rWrongAmount'], ['other', 'ui.rOther']] as const;

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, money, num, date } = useI18n();
  const L = useL();
  const [o, setO] = useState<any>(null);
  const [dispute, setDispute] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  const [totp, setTotp] = useState('');
  const [fb, setFb] = useState(false);
  const [busy, setBusy] = useState('');
  const [disputeOpen, setDisputeOpen] = useState(false);
  const statusRef = useRef('');
  statusRef.current = o?.status ?? '';
  const load = useCallback(() => api(`/orders/${id}`).then((x) => { setO(x); if (x.status === 'DISPUTED') api(`/orders/${id}/dispute`).then(setDispute).catch(() => {}); }).catch(setErr), [id]);
  useEffect(() => {
    void load();
    const s = socket();
    const join = () => s.emit('join', `order:${id}`);
    join(); s.on('connect', join);
    const on = (p: any) => { if (p.type === 'order.status' || p.type?.startsWith?.('dispute')) void load(); };
    s.on('order', on);
    // Fallback if the realtime connection drops: poll while the order is still moving.
    const poll = setInterval(() => { if (!document.hidden && ['CREATED', 'AWAITING_PAYMENT', 'PAID', 'DISPUTED'].includes(statusRef.current)) void load(); }, 4000);
    return () => { s.off('order', on); s.off('connect', join); clearInterval(poll); };
  }, [id, load]);
  const left = useCountdown(o?.status === 'AWAITING_PAYMENT' ? o.expiresAt : null);
  const disputeIn = useCountdown(o?.status === 'PAID' ? o.disputeAvailableAt : null);
  if (!o) return err ? <ErrorText error={err} /> : <div className="grid gap-4 lg:grid-cols-[1fr_400px]"><Skeleton className="h-[520px] rounded-2xl" /><Skeleton className="h-[520px] rounded-2xl" /></div>;
  const act = async (path: string, body?: unknown) => { setErr(null); setBusy(path); try { setO(await api(`/orders/${id}/${path}`, { body: body ?? {} })); } catch (e) { setErr(e); } finally { setBusy(''); } };
  const step = o.status === 'AWAITING_PAYMENT' || o.status === 'CREATED' ? 0 : o.status === 'PAID' || o.status === 'DISPUTED' ? 1 : o.status === 'COMPLETED' ? 3 : 0;
  const buyer = o.role === 'buyer';
  const cpName = o.counterparty?.displayName ?? o.counterparty?.id?.slice(0, 8);
  const canDispute = o.status === 'PAID' && disputeIn && disputeIn.s === 0;

  const headline = o.status === 'COMPLETED' ? t('order.status.COMPLETED') : o.status === 'CANCELLED' ? t('order.status.CANCELLED') : o.status === 'DISPUTED' ? t('order.status.DISPUTED')
    : buyer ? (o.status === 'PAID' ? t('ui.waitSeller') : t('ui.payWithin')) : (o.status === 'PAID' ? t('ui.checkPayment') : t('ui.waitBuyer'));

  return (
    <div className="space-y-4">
      <Link href={L('/orders')} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={15} className="rtl:-scale-x-100" />{t('nav.orders')}</Link>
      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          {/* Header */}
          <Card className="overflow-hidden">
            <div className={cn('flex flex-wrap items-center gap-4 p-5 sm:p-6', o.status === 'COMPLETED' ? 'bg-buy/10' : o.status === 'DISPUTED' ? 'bg-sell/10' : o.status === 'CANCELLED' ? 'bg-muted/50' : 'bg-gradient-to-r from-primary/15 to-transparent')}>
              <AssetIcon asset={o.asset} size={44} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-muted-foreground">{t(`order.role.${o.role}`)} · {o.asset}</div>
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{headline}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant={variant(o.status) as any} data-testid="order-status" data-status={o.status}>{t(`order.status.${o.status}`)}</Badge><span className="font-mono">#{o.id.slice(0, 8)}</span><span>{date(o.createdAt)}</span></div>
              </div>
              {left && <div className="rounded-2xl bg-card px-4 py-2 text-center shadow-sm"><div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><Timer size={12} />{t('order.timeLeft')}</div><div className={cn('num font-mono text-2xl font-bold', left.s < 120 ? 'text-sell' : 'text-foreground')} data-testid="countdown">{left.text}</div></div>}
            </div>
            <div className="px-5 py-5 sm:px-6">
              <Stepper steps={[buyer ? t('ui.stepPay') : t('ui.stepWaitPay'), buyer ? t('ui.stepWaitRelease') : t('ui.stepRelease'), t('order.status.COMPLETED')]} current={step} failed={o.status === 'DISPUTED' || o.status === 'CANCELLED'} />
            </div>
          </Card>

          {/* Amounts */}
          <Card className="p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div><div className="text-xs text-muted-foreground">{t('order.amount')}</div><div className="num text-xl font-bold" data-testid="fiat-amount">{money(o.fiatAmount, o.fiat)}</div></div>
              <div><div className="text-xs text-muted-foreground">{t('order.price')}</div><div className="num font-semibold">{money(o.price, o.fiat)}</div></div>
              <div><div className="text-xs text-muted-foreground">{buyer ? t('trade.youReceive') : t('trade.youSell')}</div><div className="num font-semibold">{num(o.cryptoAmount)} {o.asset}</div></div>
              <div><div className="text-xs text-muted-foreground">{t('order.fee')}</div><div className="num font-semibold">{num(o.fee)} {o.asset}</div></div>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-primary/50 bg-primary/5 p-4">
              <div className="min-w-0"><div className="text-xs text-muted-foreground">{t('order.reference')}</div><div className="font-mono text-xl font-bold tracking-widest text-primary" data-testid="reference">{o.referenceCode}</div></div>
              <CopyButton value={o.referenceCode} className="h-9 w-9" />
            </div>
          </Card>

          {/* Payee */}
          {o.payee && (
            <Card className="p-5 sm:p-6">
              <div className="mb-3 flex items-center justify-between"><div className="font-semibold">{t('order.payTo')}</div><PayChip code={o.payee.type} /></div>
              <div className="divide-y divide-border rounded-2xl bg-muted/50">
                <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="text-muted-foreground">{t('order.holder')}</span><span className="flex items-center gap-1 font-medium">{o.payee.holderName}<CopyButton value={o.payee.holderName} /></span></div>
                {Object.entries(o.payee.details ?? {}).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="min-w-0 break-all font-mono">{k}: {String(v)}</span><CopyButton value={String(v)} /></div>
                ))}
                <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="text-muted-foreground">{t('order.amount')}</span><span className="num flex items-center gap-1 font-semibold">{money(o.fiatAmount, o.fiat)}<CopyButton value={o.fiatAmount} /></span></div>
              </div>
            </Card>
          )}

          {/* Actions */}
          <Card className="space-y-4 p-5 sm:p-6">
            <ErrorText error={err} />
            {buyer && o.status === 'AWAITING_PAYMENT' && <>
              <Alert variant="warning">{t('order.confirmPaid', { amount: money(o.fiatAmount, o.fiat) })}</Alert>
              <div className="flex flex-col gap-2 sm:flex-row"><Button variant="buy" size="lg" className="flex-1" loading={busy === 'paid'} onClick={() => act('paid')} data-testid="mark-paid"><CheckCircle2 size={18} />{t('order.markPaid')}</Button>
                <Button variant="outline" size="lg" onClick={() => act('cancel')} data-testid="cancel"><XCircle size={18} />{t('order.cancel')}</Button></div>
            </>}
            {!buyer && o.status === 'AWAITING_PAYMENT' && <Alert>{t('ui.sellerWaiting')}</Alert>}
            {buyer && o.status === 'PAID' && <Alert>{t('ui.buyerWaiting')}</Alert>}
            {!buyer && o.status === 'PAID' && <>
              <Alert variant="warning">{t('order.releaseHint')}</Alert>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="flex-1"><Label htmlFor="totp">{t('order.totp')}</Label><Input id="totp" data-testid="release-totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="num text-center font-mono text-lg tracking-[0.4em]" value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} placeholder="••••••" /></div>
                <Button variant="sell" size="lg" loading={busy === 'release'} onClick={() => act('release', { totp })} data-testid="release">{t('order.release')}</Button></div>
            </>}
            {o.status === 'PAID' && disputeIn && disputeIn.s > 0 && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Gavel size={13} />{t('order.disputeIn', { time: disputeIn.text })}</p>}
            {canDispute && <Button variant="outline" className="w-full border-sell/40 text-sell hover:bg-sell/10" onClick={() => setDisputeOpen(true)} data-testid="open-dispute"><Gavel size={16} />{t('order.dispute')}</Button>}
            {o.status === 'DISPUTED' && <DisputeCard dispute={dispute} onEvidence={load} orderId={id} />}
            {o.status === 'COMPLETED' && !fb && <div className="flex flex-col items-center gap-3 py-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-buy/15 text-buy"><CheckCircle2 size={30} /></div>
              <div className="font-semibold">{t('order.feedback')}</div>
              <div className="flex gap-2">
                <Button variant="soft" data-testid="feedback-positive" onClick={async () => { await api(`/orders/${id}/feedback`, { body: { positive: true } }).catch(() => {}); setFb(true); }}><ThumbsUp size={16} />{t('order.positive')}</Button>
                <Button variant="outline" onClick={async () => { await api(`/orders/${id}/feedback`, { body: { positive: false } }).catch(() => {}); setFb(true); }}><ThumbsDown size={16} />{t('order.negative')}</Button>
              </div></div>}
            {fb && <Alert variant="success" data-testid="feedback-thanks">{t('order.thanks')}</Alert>}
            {o.status === 'CANCELLED' && <Alert>{t('order.status.CANCELLED')}</Alert>}
          </Card>

          {/* Counterparty + safety */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="flex items-center gap-3 p-5">
              <Avatar name={cpName ?? '?'} seed={o.counterparty?.id} size={44} />
              <div className="min-w-0"><div className="text-xs text-muted-foreground">{t('order.counterparty')}</div><Link className="font-semibold hover:text-primary" href={L(`/profile/${o.counterparty?.id}`)}>{cpName}</Link>
                {o.counterparty?.kycTier !== undefined && <div className="text-xs text-muted-foreground">{t('profile.tier', { tier: o.counterparty.kycTier })}</div>}</div>
            </Card>
            <Card className="p-5"><div className="mb-2 flex items-center gap-2 font-semibold"><ShieldCheck size={17} className="text-primary" />{t('ui.safety')}</div>
              <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground"><li>• {t('ui.tip1')}</li><li>• {t('ui.tip2')}</li><li>• {t('ui.tip3')}</li></ul></Card>
          </div>
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start"><Chat orderId={id} counterparty={o.counterparty} /></div>
      </div>
      {disputeOpen && <DisputeDialog orderId={id} onClose={() => setDisputeOpen(false)} onDone={() => { setDisputeOpen(false); void load(); }} />}
    </div>
  );
}

function DisputeDialog({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('not_released');
  const [note, setNote] = useState('');
  const [keys, setKeys] = useState<Array<{ key: string; name: string }>>([]);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Dialog onClose={onClose} title={t('order.dispute')} testId="dispute-dialog">
      <div className="space-y-4">
        <Alert variant="warning"><span className="flex gap-2"><AlertTriangle size={16} className="shrink-0" />{t('ui.disputeHint')}</span></Alert>
        <div><Label>{t('ui.reason')}</Label><Select value={reason} onChange={(e) => setReason(e.target.value)} data-testid="dispute-reason">{REASONS.map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}</Select></div>
        <div><Label htmlFor="dnote">{t('ui.describe')}</Label><Textarea id="dnote" data-testid="dispute-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} /></div>
        <div><Label>{t('ui.evidence')}</Label>
          <input ref={ref} type="file" hidden accept="image/png,image/jpeg,image/webp,application/pdf" data-testid="dispute-file" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const key = await uploadAttachment(orderId, f); setKeys((k) => [...k, { key, name: f.name }]); } catch (x) { setErr(x); } e.target.value = ''; }} />
          <button type="button" onClick={() => ref.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground hover:border-primary hover:text-foreground"><Paperclip size={16} />{t('chat.attach')}</button>
          {keys.length > 0 && <ul className="mt-2 space-y-1 text-xs">{keys.map((k) => <li key={k.key} className="truncate rounded-lg bg-muted px-3 py-1.5">{k.name}</li>)}</ul>}
        </div>
        <ErrorText error={err} />
        <Button className="w-full" variant="sell" loading={busy} disabled={!note.trim() || keys.length === 0} data-testid="dispute-submit" onClick={async () => {
          setBusy(true); setErr(null);
          try { await api(`/orders/${orderId}/dispute`, { body: { reason, note, evidenceKeys: keys.map((k) => k.key) } }); onDone(); } catch (e) { setErr(e); setBusy(false); }
        }}>{t('ui.submit')}</Button>
      </div>
    </Dialog>
  );
}

function DisputeCard({ dispute, orderId, onEvidence }: { dispute: any; orderId: string; onEvidence: () => void }) {
  const { t, date } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  if (!dispute) return <Skeleton className="h-24" />;
  return (
    <div className="space-y-3 rounded-2xl border border-sell/30 bg-sell/5 p-4" data-testid="dispute-card">
      <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 font-semibold"><Gavel size={16} className="text-sell" />{t('order.status.DISPUTED')}</div><Badge variant="danger">{dispute.status}</Badge></div>
      <div className="text-sm"><span className="text-muted-foreground">{t('ui.reason')}: </span>{t(REASONS.find(([v]) => v === dispute.reason)?.[1] ?? 'ui.rOther')}</div>
      {dispute.slaDueAt && <div className="text-xs text-muted-foreground">{t('ui.arbiterBy', { time: date(dispute.slaDueAt) })}</div>}
      <div className="text-xs text-muted-foreground">{t('ui.evidence')}: {dispute.evidence?.length ?? 0}</div>
      {dispute.decisionNote && <Alert variant="info">{dispute.decisionNote}</Alert>}
      {!dispute.resolvedAt && <>
        <input ref={ref} type="file" hidden accept="image/png,image/jpeg,image/webp,application/pdf" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const key = await uploadAttachment(orderId, f); await api(`/disputes/${dispute.id}/evidence`, { body: { fileKey: key } }).catch(() => {}); onEvidence(); }} />
        <Button size="sm" variant="outline" onClick={() => ref.current?.click()}><Paperclip size={14} />{t('ui.evidence')}</Button>
      </>}
    </div>
  );
}
