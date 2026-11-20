'use client';
/** Safe-to-pay checklist, dispute progress, trust score and saved searches. */
import { useCallback, useEffect, useState } from 'react';
import { Bookmark, Check, ShieldCheck, X } from 'lucide-react';
import { Button, Dialog, cn } from '@p2p/ui';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { ErrorText } from './errors';

const SAFE_ITEMS = ['ui.safe2', 'ui.safe3', 'ui.safe4'] as const;
/** Before "I have paid": the buyer confirms the four things that prevent most P2P losses. */
export function SafePayDialog({ amount, holder, onConfirm, onClose, busy }: { amount: string; holder?: string; onConfirm: () => void; onClose: () => void; busy?: boolean }) {
  const { t } = useI18n();
  const [ok, setOk] = useState<boolean[]>(SAFE_ITEMS.map(() => false));
  return (
    <Dialog onClose={onClose} title={<span className="flex items-center gap-2"><ShieldCheck size={18} className="text-primary" />{t('ui.safeTitle')}</span>} testId="safe-pay">
      <div className="space-y-3 p-5 sm:p-6">
        <p className="text-sm text-muted-foreground">{t('ui.safeIntro')}</p>
        {SAFE_ITEMS.map((k, i) => (
          <label key={k} className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-[15px]', ok[i] ? 'border-primary bg-primary/10' : 'border-border')}>
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-primary)]" data-testid={`safe-${i}`} checked={ok[i]} onChange={(e) => setOk(ok.map((v, j) => (j === i ? e.target.checked : v)))} />
            <span>{t(k, { amount, holder: holder ?? '' })}</span>
          </label>
        ))}
        <Button size="lg" className="w-full" disabled={!ok.every(Boolean)} loading={busy} onClick={onConfirm} data-testid="safe-confirm">{t('ui.safeConfirm')}</Button>
      </div>
    </Dialog>
  );
}

/** Dispute progress for both parties: opened → arbiter reviewing → decision. */
export function DisputeProgress({ dispute }: { dispute: any }) {
  const { t, date } = useI18n();
  const steps = [
    { label: t('ui.dStepOpened'), done: true, at: dispute.createdAt },
    { label: t('ui.dStepEvidence', { n: dispute.evidence?.length ?? 0 }), done: (dispute.evidence?.length ?? 0) > 0 },
    { label: dispute.escalatedAt ? t('ui.dStepEscalated') : t('ui.dStepReview'), done: dispute.arbiterAssigned || !!dispute.escalatedAt || !!dispute.resolvedAt, at: dispute.escalatedAt },
    { label: t('ui.dStepDecision'), done: !!dispute.resolvedAt, at: dispute.resolvedAt },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="space-y-0" data-testid="dispute-progress">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold', s.done ? 'bg-buy text-white' : i === current ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{s.done ? <Check size={13} /> : i + 1}</span>
            {i < steps.length - 1 && <span className={cn('w-px flex-1 min-h-4', s.done ? 'bg-buy' : 'bg-border')} />}
          </div>
          <div className="pb-3 text-sm"><div className={cn(i === current && 'font-semibold')}>{s.label}</div>{s.at && <div className="text-xs text-muted-foreground">{date(s.at)}</div>}
            {i === current && i === 2 && dispute.slaDueAt && !dispute.escalatedAt && <div className="text-xs text-muted-foreground">{t('ui.arbiterBy', { time: date(dispute.slaDueAt) })}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

const TRUST_TONE: Record<string, string> = { excellent: 'text-buy', good: 'text-buy', fair: 'text-warn', new: 'text-muted-foreground' };
const PARTS = ['history', 'completion', 'feedback', 'age', 'verification', 'disputes'] as const;
const MAX: Record<string, number> = { history: 25, completion: 20, feedback: 15, age: 15, verification: 15, disputes: 10 };
/** Trust score with the parts it's made of, so users can see why. */
export function TrustCard({ trust }: { trust: { score: number; level: string; parts: Record<string, number>; penalty: number } }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3" data-testid="trust">
      <div className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">{t('ui.trustScore')}</span><span className={cn('text-sm font-semibold', TRUST_TONE[trust.level])}>{t(`ui.trust_${trust.level}`)}</span></div>
      <div className="num text-[34px] font-bold tracking-tight" data-testid="trust-score">{trust.score}<span className="text-base text-muted-foreground">/100</span></div>
      <div className="space-y-1.5">
        {PARTS.map((p) => (
          <div key={p} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-xs">
            <span className="text-muted-foreground">{t(`ui.trustPart_${p}`)}</span><span className="num">{trust.parts[p] ?? 0}/{MAX[p]}</span>
            <div className="col-span-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${((trust.parts[p] ?? 0) / MAX[p]) * 100}%` }} /></div>
          </div>
        ))}
        {trust.penalty > 0 && <div className="text-xs text-sell">{t('ui.trustPenalty', { n: trust.penalty })}</div>}
      </div>
    </div>
  );
}

/** Saved searches row on the Trade page. */
export function SavedSearches({ current, onApply }: { current: Record<string, string | boolean>; onApply: (p: Record<string, string>) => void }) {
  const { t } = useI18n();
  const [list, setList] = useState<any[]>([]);
  const [naming, setNaming] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const load = useCallback(() => api<any[]>('/me/saved-searches').then(setList).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    setErr(null);
    try { await api('/me/saved-searches', { body: { name: naming, params: current } }); setNaming(null); await load(); } catch (e) { setErr(e); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="saved-searches">
      <Bookmark size={15} className="text-muted-foreground" />
      {list.map((s) => (
        <span key={s.id} className="inline-flex items-center rounded-full bg-muted text-sm">
          <button type="button" className="px-3 py-1.5 font-semibold" onClick={() => onApply(s.params)} data-testid="saved-apply">{s.name}</button>
          <button type="button" aria-label={t('ui.remove')} className="pe-2 text-muted-foreground hover:text-sell" onClick={async () => { await api(`/me/saved-searches/${s.id}`, { method: 'DELETE' }).catch(() => {}); await load(); }}><X size={13} /></button>
        </span>
      ))}
      {naming === null
        ? <button type="button" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => setNaming('')} data-testid="saved-new">{t('ui.saveSearch')}</button>
        : <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (naming.trim()) void save(); }}>
            <input autoFocus maxLength={40} value={naming} onChange={(e) => setNaming(e.target.value)} placeholder={t('ui.searchName')} className="h-9 w-40 rounded-full border border-border bg-card px-3 text-sm focus:outline-none" data-testid="saved-name" />
            <Button size="sm" type="submit" disabled={!naming.trim()} data-testid="saved-save">{t('common.save')}</Button>
          </form>}
      <ErrorText error={err} />
    </div>
  );
}
