'use client';
/** Shared P2P community UI: online status, follow/block, ad conditions, ad editing, price alerts. */
import { useEffect, useState } from 'react';
import { Ban, Bell, UserCheck, UserPlus } from 'lucide-react';
import { Button, Dialog, Input, Label, Textarea, cn } from '@p2p/ui';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/session';
import { api } from '../lib/api';
import { ErrorText } from './errors';

export function OnlineDot({ online, className }: { online?: boolean; className?: string }) {
  const { t } = useI18n();
  if (!online) return null;
  return <span title={t('ui.online')} aria-label={t('ui.online')} data-testid="online-dot" className={cn('inline-block h-2 w-2 shrink-0 rounded-full bg-buy shadow-[0_0_0_3px_rgb(34_197_94/0.18)]', className)} />;
}

/** "Online" / "Last seen 5 min ago" / "Away" line for a trader. */
export function Presence({ online, lastSeenAt, away }: { online?: boolean; lastSeenAt?: string | null; away?: boolean }) {
  const { t, date } = useI18n();
  if (away) return <span className="text-warn" data-testid="presence">{t('ui.away')}</span>;
  if (online) return <span className="flex items-center gap-1.5 text-buy" data-testid="presence"><OnlineDot online />{t('ui.online')}</span>;
  if (!lastSeenAt) return null;
  return <span data-testid="presence">{t('ui.lastSeen', { when: date(lastSeenAt) })}</span>;
}

export function RelationButtons({ userId }: { userId: string }) {
  const { t } = useI18n();
  const { me } = useSession();
  const [rel, setRel] = useState<{ following: boolean; blocked: boolean } | null>(null);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (me) api(`/users/${userId}/relation`).then(setRel).catch(() => {}); }, [me, userId]);
  if (!me || me.id === userId || !rel) return null;
  const act = async (what: 'follow' | 'block', on: boolean) => {
    setErr(null);
    try { setRel(await api(`/users/${userId}/${what}`, { method: on ? 'PUT' : 'DELETE' })); } catch (e) { setErr(e); }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-center gap-2">
        {!rel.blocked && (rel.following
          ? <Button variant="soft" size="sm" onClick={() => act('follow', false)} data-testid="unfollow"><UserCheck size={15} />{t('ui.followingBtn')}</Button>
          : <Button size="sm" onClick={() => act('follow', true)} data-testid="follow"><UserPlus size={15} />{t('ui.follow')}</Button>)}
        <Button variant="ghost" size="sm" className={rel.blocked ? '' : 'text-sell'} onClick={() => act('block', !rel.blocked)} data-testid={rel.blocked ? 'unblock' : 'block'}><Ban size={15} />{rel.blocked ? t('ui.unblock') : t('ui.block')}</Button>
      </div>
      {rel.blocked && <p className="text-center text-xs text-muted-foreground" data-testid="blocked-note">{t('ui.blockedNote')}</p>}
      <ErrorText error={err} />
    </div>
  );
}

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);
export type Conditions = { minAccountAgeDays: string; minCompletedTrades: string; autoReply: string };
export const conditionsBody = (c: Conditions) => ({ minAccountAgeDays: Number(c.minAccountAgeDays || 0), minCompletedTrades: Number(c.minCompletedTrades || 0), autoReply: c.autoReply.trim() });

/** Counterparty conditions + auto-reply fields used by "Post ad" and "Edit ad". */
export function ConditionsFields({ value, onChange }: { value: Conditions; onChange: (v: Conditions) => void }) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="minAge">{t('ui.minAccountAge')}</Label><Input id="minAge" inputMode="numeric" className="num" data-testid="min-age" value={value.minAccountAgeDays} onChange={(e) => onChange({ ...value, minAccountAgeDays: digits(e.target.value) })} placeholder="0" /></div>
        <div><Label htmlFor="minTrades">{t('ui.minTrades')}</Label><Input id="minTrades" inputMode="numeric" className="num" data-testid="min-trades" value={value.minCompletedTrades} onChange={(e) => onChange({ ...value, minCompletedTrades: digits(e.target.value) })} placeholder="0" /></div>
      </div>
      <div><Label htmlFor="autoReply">{t('ui.autoReply')}</Label><Textarea id="autoReply" rows={3} maxLength={500} data-testid="auto-reply" value={value.autoReply} onChange={(e) => onChange({ ...value, autoReply: e.target.value })} />
        <p className="mt-1 text-[11px] text-muted-foreground">{t('ui.autoReplyHint')}</p></div>
    </div>
  );
}

/** Requirements an ad sets for the counterparty, shown before trading. */
export function Requirements({ ad }: { ad: any }) {
  const { t } = useI18n();
  const items = [
    ad.minCounterpartyTier > 0 && t('ui.reqTier', { n: ad.minCounterpartyTier }),
    ad.minAccountAgeDays > 0 && t('ui.reqAge', { n: ad.minAccountAgeDays }),
    ad.minCompletedTrades > 0 && t('ui.reqTrades', { n: ad.minCompletedTrades }),
  ].filter(Boolean) as string[];
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-border p-3 text-xs leading-relaxed text-muted-foreground" data-testid="requirements">
      <div className="mb-1 font-semibold text-foreground">{t('ui.requirements')}</div>
      <ul className="list-disc space-y-0.5 ps-4">{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}

export function EditAdDialog({ ad, onClose, onSaved }: { ad: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ price: ad.priceType === 'fixed' ? ad.price : '', minAmount: ad.minAmount, maxAmount: ad.maxAmount, terms: ad.terms ?? '' });
  const [c, setC] = useState<Conditions>({ minAccountAgeDays: String(ad.minAccountAgeDays || ''), minCompletedTrades: String(ad.minCompletedTrades || ''), autoReply: ad.autoReply ?? '' });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const dec = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') });
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      await api(`/ads/${ad.id}`, { method: 'PATCH', body: { ...(ad.priceType === 'fixed' ? { price: f.price } : {}), minAmount: f.minAmount, maxAmount: f.maxAmount, terms: f.terms, ...conditionsBody(c) } });
      onSaved(); onClose();
    } catch (e) { setErr(e); setBusy(false); }
  };
  return (
    <Dialog onClose={onClose} title={t('ui.editAd')} testId="edit-ad" className="max-w-lg">
      <form onSubmit={save} className="space-y-4 p-5 sm:p-6">
        {ad.priceType === 'fixed' && <div><Label htmlFor="e-price">{t('ad.price')} ({ad.fiat})</Label><Input id="e-price" inputMode="decimal" className="num h-12 text-lg font-semibold" data-testid="edit-price" value={f.price} onChange={dec('price')} required /></div>}
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="e-min">{t('ad.min')} ({ad.fiat})</Label><Input id="e-min" inputMode="decimal" className="num" data-testid="edit-min" value={f.minAmount} onChange={dec('minAmount')} required /></div>
          <div><Label htmlFor="e-max">{t('ad.max')} ({ad.fiat})</Label><Input id="e-max" inputMode="decimal" className="num" data-testid="edit-max" value={f.maxAmount} onChange={dec('maxAmount')} required /></div>
        </div>
        <div><Label htmlFor="e-terms">{t('ad.terms')}</Label><Textarea id="e-terms" rows={3} maxLength={2000} value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} /></div>
        <div className="border-t border-border pt-4"><div className="mb-3 text-sm font-semibold">{t('ui.conditions')}</div><ConditionsFields value={c} onChange={setC} /></div>
        <ErrorText error={err} />
        <Button type="submit" className="w-full" loading={busy} data-testid="edit-save">{t('ui.saveChanges')}</Button>
      </form>
    </Dialog>
  );
}

export function PriceAlertDialog({ side, asset, fiat, suggested, onClose }: { side: 'buy' | 'sell'; asset: string; fiat: string; suggested?: string; onClose: () => void }) {
  const { t } = useI18n();
  const [price, setPrice] = useState(suggested ?? '');
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    try { await api('/me/price-alerts', { body: { side, asset, fiat, price } }); setDone(true); } catch (e) { setErr(e); }
  };
  return (
    <Dialog onClose={onClose} title={<span className="flex items-center gap-2"><Bell size={18} />{t('ui.priceAlert')}</span>} testId="price-alert">
      <form onSubmit={save} className="space-y-4 p-5 sm:p-6">
        <p className="text-sm text-muted-foreground">{t(side === 'buy' ? 'ui.alertBuyHint' : 'ui.alertSellHint', { asset })}</p>
        <div className="relative"><Input inputMode="decimal" aria-label={t('ui.targetPrice')} className="num h-12 pe-16 text-lg font-semibold" data-testid="alert-price" value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} required /><span className="absolute end-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">{fiat}</span></div>
        <ErrorText error={err} />
        {done ? <p className="rounded-xl bg-buy/10 p-3 text-sm text-buy" data-testid="alert-done">{t('ui.alertCreated')}</p>
          : <Button type="submit" className="w-full" disabled={!price} data-testid="alert-save">{t('ui.createAlert')}</Button>}
      </form>
    </Dialog>
  );
}
