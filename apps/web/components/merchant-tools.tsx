'use client';
/** My ads tools: promote an ad, bulk actions, 30-day analytics, shop link. */
import { useEffect, useState } from 'react';
import { BarChart3, Link2, Megaphone } from 'lucide-react';
import { Button, Card, CopyButton, Dialog, Input, Select } from '@p2p/ui';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/session';
import { api } from '../lib/api';
import { ErrorText } from './errors';

export function PromoteDialog({ ad, onClose, onDone }: { ad: any; onClose: () => void; onDone: () => void }) {
  const { t, date } = useI18n();
  const [price, setPrice] = useState<{ pricePerDayUsdt: string; maxDays: number } | null>(null);
  const [days, setDays] = useState(3);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/features').then((f) => setPrice(f.promotion)).catch(() => {}); }, []);
  const cost = price ? (Number(price.pricePerDayUsdt) * days).toFixed(2).replace(/\.00$/, '') : '…';
  const go = async () => { setErr(null); setBusy(true); try { await api(`/ads/${ad.id}/promote`, { body: { days } }); onDone(); onClose(); } catch (e) { setErr(e); setBusy(false); } };
  return (
    <Dialog onClose={onClose} title={<span className="flex items-center gap-2"><Megaphone size={18} />{t('ui.promoteTitle')}</span>} testId="promote">
      <div className="space-y-4 p-5 sm:p-6">
        <p className="text-sm text-muted-foreground">{t('ui.promoteDesc')}</p>
        {ad.promotedUntil && new Date(ad.promotedUntil) > new Date() && <p className="rounded-xl bg-primary/10 p-3 text-sm">{t('ui.promotedUntil', { date: date(ad.promotedUntil) })}</p>}
        <label className="block text-sm text-muted-foreground">{t('ui.promoteDays')}
          <Select className="mt-1" value={String(days)} onChange={(e) => setDays(Number(e.target.value))} data-testid="promote-days">{[1, 3, 7, 14, 30].filter((d) => !price || d <= price.maxDays).map((d) => <option key={d} value={d}>{d}</option>)}</Select>
        </label>
        <div className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">{t('ui.promoteCost')}</span><span className="num text-2xl font-bold" data-testid="promote-cost">{cost} USDT</span></div>
        <ErrorText error={err} />
        <Button className="w-full" loading={busy} disabled={!price} onClick={go} data-testid="promote-pay">{t('ui.promotePay', { amount: cost })}</Button>
      </div>
    </Dialog>
  );
}

/** Bar shown when ads are selected. */
export function BulkBar({ ids, onDone, onClear }: { ids: string[]; onDone: () => void; onClear: () => void }) {
  const { t } = useI18n();
  const [price, setPrice] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  if (!ids.length) return null;
  const run = async (body: Record<string, unknown>) => {
    setErr(null); setMsg(null);
    try {
      const r = await api<{ results: Array<{ ok: boolean }> }>('/me/ads/bulk', { body: { adIds: ids, ...body } });
      const ok = r.results.filter((x) => x.ok).length;
      setMsg(t('ui.bulkResult', { ok, total: r.results.length })); onDone();
    } catch (e) { setErr(e); }
  };
  return (
    <Card className="sticky top-16 z-10 flex flex-wrap items-center gap-2 p-3" data-testid="bulk-bar">
      <span className="px-2 text-sm font-semibold">{t('ui.bulkSelected', { n: ids.length })}</span>
      <Button size="sm" variant="soft" onClick={() => run({ action: 'pause' })} data-testid="bulk-pause">{t('ad.pause')}</Button>
      <Button size="sm" variant="soft" onClick={() => run({ action: 'resume' })} data-testid="bulk-resume">{t('ad.resume')}</Button>
      <Button size="sm" variant="ghost" className="text-sell" onClick={() => run({ action: 'close' })}>{t('ad.close')}</Button>
      <span className="flex items-center gap-1"><Input className="h-9 w-28" inputMode="decimal" placeholder={t('ad.price')} value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} data-testid="bulk-price" />
        <Button size="sm" variant="soft" disabled={!price} onClick={() => run({ action: 'price', price })} data-testid="bulk-price-set">{t('ui.bulkSetPrice')}</Button></span>
      <button type="button" className="ms-auto text-sm text-muted-foreground underline" onClick={onClear}>{t('ui.clearSelection')}</button>
      {msg && <span className="w-full px-2 text-sm text-buy" data-testid="bulk-msg">{msg}</span>}
      <ErrorText error={err} />
    </Card>
  );
}

export function MerchantStats() {
  const { t, num } = useI18n();
  const [s, setS] = useState<any>(null);
  useEffect(() => { api('/me/stats?days=30').then(setS).catch(() => {}); }, []);
  if (!s) return null;
  const pct = (bps: number) => `${(bps / 100).toFixed(0)}%`;
  return (
    <Card className="p-5" data-testid="merchant-stats">
      <div className="mb-3 flex items-center gap-2 font-semibold"><BarChart3 size={17} />{t('ui.statsTitle')}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[[t('ui.statsOrders'), String(s.totals.orders)], [t('ui.statsCompleted'), String(s.totals.completed)], [t('ui.completionRate'), pct(s.totals.completionRateBps)], [t('ui.statsVolume'), `$${num(s.totals.usdVolume, 2)}`]].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-muted/60 p-3"><div className="text-xs text-muted-foreground">{k}</div><div className="num text-xl font-bold">{v}</div></div>
        ))}
      </div>
      {s.perAd.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="py-2 text-start">{t('ui.statsAd')}</th><th className="text-end">{t('ui.statsOrders')}</th><th className="text-end">{t('ui.completionRate')}</th><th className="text-end">{t('ui.statsVolume')}</th><th className="text-end">{t('ui.usualRelease')}</th></tr></thead>
            <tbody>{s.perAd.map((r: any) => (
              <tr key={r.adId} className="border-t border-border">
                <td className="py-2">{t(r.side === 'sell' ? 'market.sellAction' : 'market.buyAction', { asset: r.asset })} · {r.fiat}</td>
                <td className="num text-end">{r.completed}/{r.orders}</td><td className="num text-end">{pct(r.completionRateBps)}</td>
                <td className="num text-end">{num(r.fiatVolume, 2)} {r.fiat}</td><td className="num text-end">{r.avgReleaseSec ? t('common.minutes', { n: Math.max(1, Math.round(r.avgReleaseSec / 60)) }) : '—'}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function ShopLink() {
  const { t, locale } = useI18n();
  const { me } = useSession();
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  if (!me) return null;
  const handle = me.displayName ?? me.id;
  const link = `${origin}/${locale}/m/${encodeURIComponent(handle)}`;
  return (
    <Card className="flex flex-wrap items-center gap-3 p-5" data-testid="shop-link">
      <Link2 size={18} className="text-primary" />
      <div className="min-w-0 flex-1"><div className="font-semibold">{t('ui.shopLink')}</div><p className="text-xs text-muted-foreground">{me.displayName ? t('ui.shopLinkDesc') : t('ui.shopLinkNick')}</p></div>
      <div className="flex min-w-0 items-center gap-2 rounded-xl bg-muted px-3 py-2"><code className="max-w-[16rem] truncate text-xs sm:max-w-sm">{link}</code><CopyButton value={link} /></div>
    </Card>
  );
}
