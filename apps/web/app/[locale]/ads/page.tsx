'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Coffee, Megaphone, Pause, Pencil, Play, Plus, X } from 'lucide-react';
import { AssetIcon, Badge, Button, Card, PayChip, Skeleton, cn } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';
import { useL } from '../../../components/nav';
import { ErrorText } from '../../../components/errors';
import { EditAdDialog } from '../../../components/community';
import { useSession } from '../../../lib/session';

export default function MyAds() {
  const { t, num, money } = useI18n();
  const L = useL();
  const [ads, setAds] = useState<any[] | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const { me, refresh } = useSession();
  const away = !!me?.awayMode;
  const setAway = async (v: boolean) => { setErr(null); try { await api('/me/away', { method: 'PUT', body: { away: v } }); await refresh(); } catch (e) { setErr(e); } };
  const load = useCallback(() => api<any[]>('/me/ads').then((r) => setAds(r.filter((a) => a.status !== 'closed'))).catch(() => setAds([])), []);
  useEffect(() => { void load(); }, [load]);
  const setStatus = async (id: string, status: string) => { setErr(null); try { await api(`/ads/${id}`, { method: 'PATCH', body: { status } }); await load(); } catch (e) { setErr(e); } };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('ad.mine')}</h1>
        <Link href={L('/ads/new')}><Button data-testid="new-ad"><Plus size={16} />{t('nav.postAd')}</Button></Link>
      </div>
      <Card className={cn('flex flex-wrap items-center gap-4 p-5', away && 'border-warn/60')} data-testid="away-card">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary"><Coffee size={18} /></span>
        <div className="min-w-0 flex-1"><div className="font-semibold">{t('ui.awayMode')}</div><p className="text-xs text-muted-foreground">{away ? t('ui.awayOn') : t('ui.awayDesc')}</p></div>
        <Button variant={away ? 'default' : 'soft'} size="sm" onClick={() => setAway(!away)} data-testid="away-toggle">{away ? t('ui.awayBack') : t('ui.awayStart')}</Button>
      </Card>
      <ErrorText error={err} />
      <div className="grid gap-3 md:grid-cols-2" data-testid="my-ads">
        {ads === null && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        {ads?.length === 0 && (
          <Card className="col-span-full flex flex-col items-center gap-4 p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-primary-foreground"><Megaphone size={26} /></div>
            <p className="max-w-sm text-sm text-muted-foreground">{t('ui.noAds')}</p>
            <Link href={L('/ads/new')}><Button>{t('ad.new')}</Button></Link>
          </Card>
        )}
        {ads?.map((a) => (
          <Card key={a.id} className={cn('p-5', a.status === 'paused' && 'opacity-75')}>
            <div className="flex items-center gap-3">
              <AssetIcon asset={a.asset} size={36} />
              <div className="min-w-0 flex-1">
                <div className={cn('font-semibold', a.side === 'sell' ? 'text-sell' : 'text-buy')}>{t(a.side === 'sell' ? 'market.sellAction' : 'market.buyAction', { asset: a.asset })} · {a.fiat}</div>
                <div className="num text-xl font-bold">{money(a.price, a.fiat)}</div>
              </div>
              <Badge variant={a.status === 'active' ? 'success' : 'warning'}>{a.status === 'active' ? t('ui.adActive') : t('ui.paused')}</Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">{t('market.available')}</div><div className="num">{num(a.remainingAmount)} / {num(a.totalAmount)} {a.asset}</div></div>
              <div><div className="text-xs text-muted-foreground">{t('market.limits')}</div><div className="num">{money(a.minAmount, a.fiat)} – {money(a.maxAmount, a.fiat)}</div></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">{a.paymentTypes.map((p: string) => <PayChip key={p} code={p} />)}</div>
            {(a.minAccountAgeDays > 0 || a.minCompletedTrades > 0 || a.autoReply) && <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              {a.minAccountAgeDays > 0 && <span className="rounded-full bg-muted px-2 py-0.5">{t('ui.reqAge', { n: a.minAccountAgeDays })}</span>}
              {a.minCompletedTrades > 0 && <span className="rounded-full bg-muted px-2 py-0.5">{t('ui.reqTrades', { n: a.minCompletedTrades })}</span>}
              {a.autoReply && <span className="rounded-full bg-muted px-2 py-0.5">{t('ui.autoReply')} ✓</span>}
            </div>}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              <Button size="sm" variant="soft" onClick={() => setEditing(a)} data-testid="edit-ad-open"><Pencil size={14} />{t('ui.editAd')}</Button>
              {a.status === 'active'
                ? <Button size="sm" variant="soft" onClick={() => setStatus(a.id, 'paused')}><Pause size={14} />{t('ad.pause')}</Button>
                : <Button size="sm" variant="soft" onClick={() => setStatus(a.id, 'active')}><Play size={14} />{t('ad.resume')}</Button>}
              <Button size="sm" variant="ghost" className="text-sell" onClick={() => setStatus(a.id, 'closed')}><X size={14} />{t('ad.close')}</Button>
            </div>
          </Card>
        ))}
      </div>
      {editing && <EditAdDialog ad={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    </div>
  );
}
