'use client';
/** parley trade screen: buyer pays · seller confirms · dispute · done. */
import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, CheckCircle2, Lock, Paperclip, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Badge, Button, Card, CopyButton, Input, Skeleton, cn } from '@p2p/ui';
import { useI18n } from '../../../../lib/i18n';
import { api } from '../../../../lib/api';
import { socket } from '../../../../lib/socket';
import { Chat, uploadAttachment } from '../../../../components/chat';
import { ErrorText } from '../../../../components/errors';
import { cdp, orderState } from '../../../../components/order-state';
import { useL } from '../../../../components/nav';

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  return now;
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, money, num } = useI18n();
  const L = useL();
  const now = useNow();
  const [o, setO] = useState<any>(null);
  const [dispute, setDispute] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  const [totp, setTotp] = useState('');
  const [busy, setBusy] = useState('');
  const [fb, setFb] = useState(false);
  const [disputing, setDisputing] = useState(false);
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
  if (!o) return err ? <ErrorText error={err} /> : <div className="grid gap-3 lg:grid-cols-2"><Skeleton className="h-[420px] rounded-[28px]" /><Skeleton className="h-[420px] rounded-[28px]" /></div>;

  const buyer = o.role === 'buyer';
  const cp = o.counterparty?.displayName ?? o.counterparty?.id?.slice(0, 8) ?? '—';
  const fiatAmt = money(o.fiatAmount, o.fiat);
  const crypto = `${num(o.cryptoAmount, cdp(o.asset))} ${o.asset}`;
  const act = async (path: string, body?: unknown) => { setErr(null); setBusy(path); try { setO(await api(`/orders/${id}/${path}`, { body: body ?? {} })); } catch (e) { setErr(e); } finally { setBusy(''); } };
  const left = o.expiresAt ? Math.max(0, Math.floor((new Date(o.expiresAt).getTime() - now) / 1000)) : 0;
  const total = o.expiresAt ? Math.max(1, Math.floor((new Date(o.expiresAt).getTime() - new Date(o.createdAt).getTime()) / 1000)) : 1;
  const disputeIn = o.disputeAvailableAt ? Math.max(0, Math.floor((new Date(o.disputeAvailableAt).getTime() - now) / 1000)) : 0;
  const st = orderState(o, t, now);
  const awaiting = o.status === 'AWAITING_PAYMENT' || o.status === 'CREATED';
  const showDispute = o.status === 'DISPUTED' || disputing;

  // ---------------------------------------------------------------- hero
  let hero: React.ReactNode;
  if (showDispute) {
    hero = (
      <HeroCard tone="sell">
        <h2 className="text-[34px] font-bold leading-tight tracking-[-0.03em] sm:text-[40px]">{t('ui.frozenNotLost')}</h2>
        <EscrowPill tone="sell">{t('ui.heldInEscrow', { amount: crypto })}</EscrowPill>
      </HeroCard>
    );
  } else if (o.status === 'COMPLETED') {
    hero = (
      <HeroCard>
        <CheckCircle2 size={44} className="mx-auto text-buy" />
        <div className="mt-3 text-[15px] font-medium">{t(buyer ? 'ui.releasedToWallet' : 'ui.tradeComplete')}</div>
        <div className="num-xl mt-2 text-[56px] sm:text-[72px]">{buyer ? num(o.cryptoAmount, cdp(o.asset)) : num(o.fiatAmount, 2)}</div>
        <EscrowPill>{buyer ? o.asset : o.fiat}</EscrowPill>
      </HeroCard>
    );
  } else if (o.status === 'CANCELLED') {
    hero = <HeroCard><div className="text-[28px] font-bold tracking-tight">{t('order.status.CANCELLED')}</div><p className="mt-2 text-sm text-muted-foreground">{t('ui.cancelledHint')}</p></HeroCard>;
  } else if (buyer && awaiting) {
    hero = (
      <HeroCard>
        <div className="text-[15px] font-medium">{t('ui.timeLeftToPay')}</div>
        <div className={cn('num-xl mt-1 text-[84px] sm:text-[104px]', left < 120 && 'text-sell')} data-testid="countdown">{mmss(left)}</div>
        <EscrowPill>{t('ui.inEscrow', { amount: crypto })}</EscrowPill>
        <div className="mx-auto mt-6 h-1.5 w-full max-w-lg overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', left < 120 ? 'bg-sell' : 'bg-primary')} style={{ width: `${(left / total) * 100}%` }} /></div>
        {left < 120 && <p className="mt-3 text-sm font-medium text-sell">{t('ui.underTwoMin')}</p>}
        <Button size="lg" className="mt-6 w-full max-w-md" loading={busy === 'paid'} onClick={() => act('paid')} data-testid="mark-paid">{t('ui.iveSent', { amount: fiatAmt })}</Button>
        <p className="mx-auto mt-3 max-w-md text-xs text-muted-foreground">{t('order.confirmPaid', { amount: fiatAmt })}</p>
      </HeroCard>
    );
  } else if (buyer) { // PAID, waiting for release
    hero = (
      <HeroCard>
        <div className="text-[15px] font-medium">{t('ui.waitingFor', { name: cp })}</div>
        <div className="num-xl mt-2 text-[64px] sm:text-[84px]">{num(o.cryptoAmount, cdp(o.asset))}</div>
        <EscrowPill>{t('ui.inEscrow', { amount: crypto })}</EscrowPill>
        <p className="mx-auto mt-5 max-w-md text-sm text-muted-foreground">{t('ui.buyerWaiting')}</p>
      </HeroCard>
    );
  } else if (awaiting) { // seller, buyer still paying
    hero = (
      <HeroCard>
        <div className="text-[15px] font-medium">{t('ui.waitingFor', { name: cp })}</div>
        <div className="num-xl mt-1 text-[84px] sm:text-[104px]" data-testid="countdown">{mmss(left)}</div>
        <EscrowPill>{t('ui.staysLocked', { amount: crypto })}</EscrowPill>
      </HeroCard>
    );
  } else { // seller, PAID: check the bank
    hero = (
      <HeroCard tone="info">
        <div className="text-[15px] font-medium">{t('ui.checkBankFor')}</div>
        <div className="num-xl mt-1 text-[72px] sm:text-[96px]">{num(o.fiatAmount, 2)}</div>
        <EscrowPill tone="info">{t('ui.staysLocked', { amount: crypto })}</EscrowPill>
      </HeroCard>
    );
  }

  // ---------------------------------------------------------------- left column below hero
  const steps = buyer
    ? [[t('ui.escrowLockedStep'), t('ui.escrowLockedHint', { amount: crypto })], [t('ui.youSend', { amount: fiatAmt }), t('ui.youSendHint')], [t('ui.sellerConfirms'), t('ui.sellerChecksHint')], [t('ui.releasedToYou', { asset: o.asset }), t('ui.releasedHint')]]
    : [[t('ui.escrowLockedStep'), t('ui.yourEscrowHint', { amount: crypto })], [t('ui.buyerSends', { amount: fiatAmt }), t('ui.buyerSendsHint')], [t('ui.youConfirm'), t('ui.confirmHint')], [t('ui.releasedToBuyer', { asset: o.asset }), t('ui.releasedHint')]];
  const stepIdx = awaiting ? 1 : o.status === 'PAID' || o.status === 'DISPUTED' ? 2 : o.status === 'COMPLETED' ? 4 : 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 pt-1">
        <Link href={L('/orders')} aria-label={t('common.back')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card hover:brightness-110"><ArrowLeft size={18} className="rtl:-scale-x-100" /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[24px] font-bold tracking-[-0.03em] sm:text-[30px]">{showDispute ? t('order.dispute') : t(buyer ? 'ui.buyingX' : 'ui.sellingX', { amount: num(o.cryptoAmount, cdp(o.asset)), asset: o.asset })}</h1>
          <div className="text-sm text-muted-foreground">{t(buyer ? 'ui.fromX' : 'ui.toX', { name: '' })}<Link href={L(`/profile/${o.counterparty?.id}`)} className="underline underline-offset-2">{cp}</Link> · {t('ui.tradeRef')} <span data-testid="reference" className="font-mono">{o.referenceCode}</span></div>
        </div>
        <Badge variant={st.tone} data-testid="order-status" data-status={o.status}>{st.pill}</Badge>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          {hero}
          <ErrorText error={err} />

          {showDispute ? <DisputePanel o={o} dispute={dispute} onDone={() => { setDisputing(false); void load(); }} onCancel={() => setDisputing(false)} /> : <>
            {/* Seller: confirm only after the money arrives */}
            {!buyer && o.status === 'PAID' && (
              <Card className="space-y-4 p-6">
                <div className="text-sm text-muted-foreground">{t('ui.stepNofM', { n: 3, m: 4 })}</div>
                <div><div className="text-[22px] font-semibold tracking-tight">{t('ui.confirmOnlyAfter')}</div><p className="mt-1 text-[15px] text-muted-foreground">{t('ui.openBankingApp')}</p></div>
                <div className="flex items-center justify-between"><span className="font-medium">{t('ui.paymentShouldCome')}</span>{(o.counterparty?.kycTier ?? 0) >= 1 && <Badge variant="success">{t('ui.idVerified')}</Badge>}</div>
                <Row label={t('ui.sender')} value={cp} />
                <Row label={t('order.amount')} value={<span data-testid="fiat-amount">{fiatAmt}</span>} />
                <Row label={t('ui.reference')} value={o.referenceCode} />
                <div className="space-y-2 pt-2">
                  <label htmlFor="totp" className="text-sm text-muted-foreground">{t('order.totp')}</label>
                  <Input id="totp" data-testid="release-totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="num h-14 text-center font-mono text-2xl tracking-[0.5em]" value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
                </div>
                <Button size="lg" className="w-full" loading={busy === 'release'} onClick={() => act('release', { totp })} data-testid="release">{t('ui.moneyReceived')}</Button>
                <div className="text-center">
                  {disputeIn > 0 ? <span className="text-sm text-muted-foreground">{t('order.disputeIn', { time: mmss(disputeIn) })}</span>
                    : <button type="button" onClick={() => setDisputing(true)} className="text-[15px] font-semibold underline underline-offset-4" data-testid="open-dispute">{t('ui.notReceived')}</button>}
                </div>
              </Card>
            )}
            {/* Buyer after paying: receipt + dispute */}
            {buyer && o.status === 'PAID' && (
              <Card className="space-y-3 p-6">
                <ReceiptButton orderId={id} />
                {disputeIn > 0 ? <p className="text-center text-sm text-muted-foreground">{t('order.disputeIn', { time: mmss(disputeIn) })}</p>
                  : <button type="button" onClick={() => setDisputing(true)} className="w-full text-center text-[15px] font-semibold underline underline-offset-4" data-testid="open-dispute">{t('ui.sellerNotReleased')}</button>}
              </Card>
            )}
            {/* Feedback */}
            {o.status === 'COMPLETED' && (
              <Card className="p-6 text-center">
                {fb ? <p className="font-medium text-buy" data-testid="feedback-thanks">{t('order.thanks')}</p> : <>
                  <div className="font-semibold">{t('ui.howWasTrade', { name: cp })}</div>
                  <div className="mt-4 flex justify-center gap-2">
                    <Button variant="ink" data-testid="feedback-positive" onClick={async () => { await api(`/orders/${id}/feedback`, { body: { positive: true } }).catch(() => {}); setFb(true); }}><ThumbsUp size={16} />{t('order.positive')}</Button>
                    <Button variant="soft" onClick={async () => { await api(`/orders/${id}/feedback`, { body: { positive: false } }).catch(() => {}); setFb(true); }}><ThumbsDown size={16} />{t('order.negative')}</Button>
                  </div>
                </>}
              </Card>
            )}
            {/* Progress */}
            <Card className="p-6">
              <h3 className="text-[22px] font-semibold tracking-tight">{t('ui.progress')}</h3>
              <ol className="mt-4 space-y-4">
                {steps.map(([title, hint], i) => {
                  const done = i < stepIdx; const now_ = i === stepIdx && o.status !== 'COMPLETED';
                  return (
                    <li key={title} className="flex gap-3">
                      <span className={cn('mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full', done ? 'bg-buy' : now_ ? 'bg-primary' : 'bg-muted')} />
                      <div className="min-w-0 flex-1">
                        <div className={cn('text-[17px] font-medium', !done && !now_ && 'text-muted-foreground')}>{title}</div>
                        <div className="text-[15px] text-muted-foreground">{hint}</div>
                      </div>
                      <span className="text-xs font-semibold">{done ? t('ui.done') : now_ ? t('ui.now') : ''}</span>
                    </li>
                  );
                })}
              </ol>
              {buyer && awaiting && <button type="button" onClick={() => act('cancel')} className="mt-5 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" data-testid="cancel">{t('order.cancel')}</button>}
            </Card>
          </>}
        </div>

        <div className="space-y-3 lg:sticky lg:top-5 lg:self-start">
          {/* Pay to (buyer) */}
          {buyer && o.payee && (
            <>
              <Card className="p-6">
                <div className="mb-1 flex items-center justify-between"><span className="text-[20px] font-semibold tracking-tight">{t('order.payTo')}</span><span className="text-sm text-muted-foreground">{o.payee.type}</span></div>
                <CopyRow label={t('ui.name')} value={o.payee.holderName} />
                {Object.entries(o.payee.details ?? {}).map(([k, v]) => <CopyRow key={k} label={k} value={String(v)} mono />)}
                <CopyRow label={t('order.amount')} value={fiatAmt} copy={o.fiatAmount} strong testId="fiat-amount" />
                <CopyRow label={t('ui.reference')} value={o.referenceCode} strong />
              </Card>
              <p className="px-5 text-[13px] text-muted-foreground">{t('ui.payOwnName')}</p>
            </>
          )}
          <Chat orderId={id} counterparty={o.counterparty} />
        </div>
      </div>
    </div>
  );
}

function HeroCard({ children, tone }: { children: React.ReactNode; tone?: 'sell' | 'info' }) {
  return (
    <Card className="relative overflow-hidden px-5 py-8 text-center sm:px-8">
      <div className="pointer-events-none absolute inset-0" style={{ background: tone === 'sell' ? 'radial-gradient(55% 60% at 50% 35%, rgb(236 134 112 / 0.35), transparent 72%)' : tone === 'info' ? 'radial-gradient(55% 60% at 50% 35%, rgb(169 189 245 / 0.35), transparent 72%)' : 'radial-gradient(55% 60% at 50% 35%, var(--color-glow), transparent 72%)' }} />
      <div className="relative">{children}</div>
    </Card>
  );
}
function EscrowPill({ children, tone }: { children: React.ReactNode; tone?: 'sell' | 'info' }) {
  return <span className={cn('mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[15px] font-semibold', tone === 'sell' ? 'border-sell' : tone === 'info' ? 'border-info' : 'border-primary/70')}><Lock size={14} />{children}</span>;
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-[15px]"><span className="text-muted-foreground">{label}</span><span className="text-end font-semibold">{value}</span></div>;
}
function CopyRow({ label, value, copy, mono, strong, testId }: { label: string; value: string; copy?: string; mono?: boolean; strong?: boolean; testId?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-3.5 last:border-0">
      <span className="w-24 shrink-0 text-sm capitalize text-muted-foreground">{label}</span>
      <span className={cn('min-w-0 flex-1 break-all text-[17px]', mono && 'font-mono text-[15px]', strong && 'font-semibold')} data-testid={testId}>{value}</span>
      <CopyButton value={copy ?? value} className="h-9 w-9" />
    </div>
  );
}

const REASONS_BUYER = [['not_released', 'ui.rPaidNotReleased'], ['fraud', 'ui.rDifferentAccount'], ['wrong_amount', 'ui.rSentWrong'], ['other', 'ui.rOther']] as const;
const REASONS_SELLER = [['not_paid', 'ui.rNotPaid'], ['third_party_payment', 'ui.rThirdParty'], ['wrong_amount', 'ui.rWrongAmount'], ['other', 'ui.rOther']] as const;

function DisputePanel({ o, dispute, onDone, onCancel }: { o: any; dispute: any; onDone: () => void; onCancel: () => void }) {
  const { t, date } = useI18n();
  const reasons = o.role === 'buyer' ? REASONS_BUYER : REASONS_SELLER;
  const [reason, setReason] = useState<string>(reasons[0][0]);
  const [note, setNote] = useState('');
  const [keys, setKeys] = useState<Array<{ key: string; name: string }>>([]);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const reasonLabel = (r: string) => t(([...REASONS_BUYER, ...REASONS_SELLER].find(([v]) => v === r)?.[1]) ?? 'ui.rOther');
  if (o.status === 'DISPUTED') return (
    <Card className="space-y-3 p-6" data-testid="dispute-card">
      <div className="flex items-center justify-between"><span className="text-[20px] font-semibold">{t('ui.disputeOpen')}</span>{dispute && <Badge variant="danger">{dispute.status}</Badge>}</div>
      {dispute && <p className="text-[15px]"><span className="text-muted-foreground">{t('ui.reason')}: </span>{reasonLabel(dispute.reason)}</p>}
      {dispute?.slaDueAt && <p className="text-sm text-muted-foreground">{t('ui.arbiterBy', { time: date(dispute.slaDueAt) })}</p>}
      {dispute && <p className="text-sm text-muted-foreground">{t('ui.evidence')}: {dispute.evidence?.length ?? 0}</p>}
      {dispute?.decisionNote && <p className="rounded-2xl bg-muted p-3 text-sm">{dispute.decisionNote}</p>}
      {dispute && !dispute.resolvedAt && <>
        <input ref={ref} type="file" hidden accept="image/png,image/jpeg,image/webp,application/pdf" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const key = await uploadAttachment(o.id, f); await api(`/disputes/${dispute.id}/evidence`, { body: { fileKey: key } }).catch(() => {}); onDone(); }} />
        <Button variant="soft" onClick={() => ref.current?.click()}><Paperclip size={15} />{t('ui.addEvidence')}</Button>
      </>}
    </Card>
  );
  return (
    <div className="space-y-3" data-testid="dispute-dialog">
      <Card className="p-6">
        <div className="text-[17px] font-semibold">{t('ui.whatWentWrong')}</div>
        <div className="mt-2 divide-y divide-border">
          {reasons.map(([v, k]) => (
            <label key={v} className="flex cursor-pointer items-center gap-3 py-3 text-[16px]">
              <span className="flex-1">{t(k)}</span>
              <input type="radio" name="reason" value={v} checked={reason === v} onChange={() => setReason(v)} className="h-5 w-5 accent-[var(--color-sell)]" data-testid={`reason-${v}`} />
            </label>
          ))}
        </div>
        <textarea className="mt-3 min-h-24 w-full rounded-2xl border border-border bg-background/40 p-3 text-sm focus:border-primary focus:outline-none" placeholder={t('ui.describe')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} data-testid="dispute-note" />
      </Card>
      <Card className="p-6">
        <div className="text-[17px] font-semibold">{t('ui.evidence')}</div>
        <div className="mt-2 flex items-center justify-between border-b border-border py-3"><span>{t('ui.bankReceipt')}{keys.length ? ` (${keys.length})` : ''}</span>
          <input ref={ref} type="file" hidden accept="image/png,image/jpeg,image/webp,application/pdf" data-testid="dispute-file" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const key = await uploadAttachment(o.id, f); setKeys((k) => [...k, { key, name: f.name }]); } catch (x) { setErr(x); } e.target.value = ''; }} />
          <Button variant="soft" size="sm" onClick={() => ref.current?.click()}>{t('ui.upload')}</Button>
        </div>
        <div className="flex items-center justify-between py-3"><span>{t('ui.chatAttached')}</span><Check size={18} className="text-buy" /></div>
      </Card>
      <p className="px-5 text-[13px] text-muted-foreground">{t('ui.disputeHint')}</p>
      <ErrorText error={err} />
      <Button size="lg" variant="sell" className="w-full" loading={busy} disabled={!note.trim() || keys.length === 0} data-testid="dispute-submit" onClick={async () => {
        setBusy(true); setErr(null);
        try { await api(`/orders/${o.id}/dispute`, { body: { reason, note, evidenceKeys: keys.map((k) => k.key) } }); onDone(); } catch (e) { setErr(e); setBusy(false); }
      }}>{t('ui.submitDispute')}</Button>
      <button type="button" onClick={onCancel} className="w-full text-center text-sm text-muted-foreground underline underline-offset-4">{t('common.back')}</button>
    </div>
  );
}

/** Buyer uploads proof of payment; it is posted into the order chat (visible to the seller and to arbiters). */
function ReceiptButton({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  return (
    <>
      <input ref={ref} type="file" hidden accept="image/png,image/jpeg,image/webp,application/pdf" data-testid="receipt-file" onChange={async (e) => {
        const f = e.target.files?.[0]; if (!f) return; setState('busy');
        try { const key = await uploadAttachment(orderId, f); await api(`/orders/${orderId}/messages`, { body: { body: '', attachmentKey: key } }); setState('done'); } catch { setState('idle'); }
        e.target.value = '';
      }} />
      <Button variant="soft" className="w-full" loading={state === 'busy'} onClick={() => ref.current?.click()} data-testid="upload-receipt">
        {state === 'done' ? <CheckCircle2 size={16} className="text-buy" /> : <Paperclip size={16} />}{state === 'done' ? t('ui.receiptSent') : t('ui.uploadReceipt')}
      </Button>
    </>
  );
}
