'use client';
/** Seller-side safety: facts about the buyer, automatic receipt checks, payer-name confirmation. */
import { useEffect, useState } from 'react';
import { AlertTriangle, FileSearch, ShieldCheck } from 'lucide-react';
import { cn } from '@p2p/ui';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';

export function BuyerSignals({ signals }: { signals?: string[] }) {
  const { t } = useI18n();
  if (!signals?.length) return null;
  return (
    <div className="rounded-2xl border border-warn/50 bg-warn/10 p-4 text-sm" data-testid="buyer-signals">
      <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle size={16} className="text-warn" />{t('ui.signalsTitle')}</div>
      <ul className="list-disc space-y-0.5 ps-5 text-muted-foreground">{signals.map((s) => <li key={s}>{t(`ui.signal_${s}`)}</li>)}</ul>
    </div>
  );
}

const flagKey = (f: string) => (f.startsWith('edited:') ? 'edited' : f);
export function ReceiptChecks({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const [r, setR] = useState<{ automaticReading: boolean; receipts: Array<{ fileKey: string; flags: string[]; extracted?: Record<string, string> | null }> } | null>(null);
  useEffect(() => {
    const load = () => api(`/orders/${orderId}/receipt-checks`).then(setR).catch(() => {});
    void load(); const i = setInterval(load, 8000); return () => clearInterval(i);
  }, [orderId]);
  if (!r || !r.receipts.length) return null;
  return (
    <div className="space-y-2 rounded-2xl bg-muted/60 p-4 text-sm" data-testid="receipt-checks">
      <div className="flex items-center gap-2 font-semibold"><FileSearch size={16} />{t('ui.receiptChecks')}</div>
      {r.receipts.map((x, i) => (
        <div key={x.fileKey} className="space-y-1">
          <div className="text-xs text-muted-foreground">{t('ui.receiptN', { n: i + 1 })}</div>
          {x.flags.length === 0
            ? <div className="flex items-center gap-1.5 text-buy"><ShieldCheck size={14} />{t('ui.receiptClean')}</div>
            : x.flags.map((f) => <div key={f} className="flex items-start gap-1.5 text-sell" data-testid="receipt-flag"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{t(`ui.rflag_${flagKey(f)}`, { tool: f.split(':')[1] ?? '' })}</div>)}
          {x.extracted && (x.extracted.amount || x.extracted.payerName) && <div className="text-xs text-muted-foreground">{t('ui.receiptRead', { amount: x.extracted.amount ?? '—', payer: x.extracted.payerName ?? '—' })}</div>}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{r.automaticReading ? t('ui.receiptNoteAi') : t('ui.receiptNote')}</p>
    </div>
  );
}

/** "The money came from the buyer's own name" — required before release; a mismatch leads to an appeal instead. */
export function PayerNameCheck({ name, checked, onChange, onMismatch }: { name?: string | null; checked: boolean; onChange: (v: boolean) => void; onMismatch: () => void }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <label className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-[15px]', checked ? 'border-primary bg-primary/10' : 'border-border')}>
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid="payer-confirm" />
        <span>{name ? t('ui.payerMatchNamed', { name }) : t('ui.payerMatchUnverified')}</span>
      </label>
      <button type="button" className="text-sm font-semibold text-sell underline underline-offset-4" onClick={onMismatch} data-testid="payer-mismatch">{t('ui.payerMismatch')}</button>
    </div>
  );
}
