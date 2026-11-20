'use client';
/** Merchant Centre: performance, volume, completed orders, my ads, analytics, program status. Real data only. */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, BadgeCheck, FileText, KeyRound, LifeBuoy, Megaphone, Plus, Settings, Store, TrendingUp } from 'lucide-react';
import { Alert, Badge, Button, Card, Input, Label, Skeleton, cn } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { useSession } from '../../../lib/session';
import { api } from '../../../lib/api';
import { useL } from '../../../components/nav';
import { ErrorText } from '../../../components/errors';

/** Exact decimal string addition (no floats). */
function addDec(a: string, b: string) {
  const [ai, af = ''] = a.split('.'); const [bi, bf = ''] = b.split('.');
  const n = Math.max(af.length, bf.length, 2);
  const s = BigInt(ai + af.padEnd(n, '0')) + BigInt(bi + bf.padEnd(n, '0'));
  const str = s.toString().padStart(n + 1, '0');
  return `${str.slice(0, -n)}.${str.slice(-n)}`;
}

export default function Merchant() {
  const { t, money, pct, num } = useI18n();
  const { me, loading } = useSession();
  const L = useL();
  const [status, setStatus] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[] | null>(null);
  const [ads, setAds] = useState<any[]>([]);
  useEffect(() => {
    if (!me) return;
    api('/merchant-program/status').then(setStatus).catch(() => setStatus({ status: 'none' }));
    api(`/users/${me.id}/profile`).then(setProfile).catch(() => {});
    api<any[]>('/orders').then(setOrders).catch(() => setOrders([]));
    api<any[]>('/me/ads').then(setAds).catch(() => {});
  }, [me]);
  const stats = useMemo(() => {
    const done = (orders ?? []).filter((o) => o.status === 'COMPLETED');
    const vol: Record<string, string> = {};
    for (const o of done) vol[o.fiat] = addDec(vol[o.fiat] ?? '0', o.fiatAmount);
    const top = Object.entries(vol).sort((a, b) => (BigInt(b[1].replace('.', '')) > BigInt(a[1].replace('.', '')) ? 1 : -1));
    // Completed orders per day, last 14 days.
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (13 - i)); return d; });
    const perDay = days.map((d) => done.filter((o) => { const c = new Date(o.createdAt); return c >= d && c.getTime() < d.getTime() + 864e5; }).length);
    return { done: done.length, top, perDay, days };
  }, [orders]);
  if (!loading && !me) return <div className="py-20 text-center"><Link href={L('/login')}><Button>{t('nav.login')}</Button></Link></div>;
  const isMerchant = status && status.status !== 'none';
  const maxDay = Math.max(1, ...stats.perDay);
  const tiles: Array<[typeof Megaphone, string, string]> = [[Megaphone, t('ad.mine'), '/ads'], [BarChart3, t('ui.analytics'), '#analytics'], [Settings, t('ui.settings'), '/account'], [LifeBuoy, t('ui.support'), '/help']];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('ui.merchantCentre')}</h1>
          {isMerchant && <span className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-primary-foreground">{status.verifiedBadge ? t('profile.merchant') : status.status}</span>}
        </div>
        <Link href={L('/ads/new')}><Button data-testid="create-ad"><Plus size={16} />{t('ui.createAd')}</Button></Link>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr_1fr]">
        <Card className="relative overflow-hidden p-6">
          <div className="text-sm text-muted-foreground">{t('ui.performance')}</div>
          {profile ? <div className="num mt-2 text-4xl font-extrabold tracking-tight">{pct(profile.completionRateBps)}</div> : <Skeleton className="mt-2 h-10 w-32" />}
          <div className="mt-1 text-sm text-muted-foreground">{t('profile.completion')}</div>
          <div className="absolute bottom-5 end-6 flex items-end gap-1.5" aria-hidden>
            {stats.perDay.slice(-7).map((n, i) => <span key={i} className="w-3 rounded-sm bg-buy/80" style={{ height: `${10 + (n / maxDay) * 46}px` }} />)}
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-muted-foreground">{t('ui.tradingVolume')}</div>
          {orders === null ? <Skeleton className="mt-2 h-9 w-36" /> : <div className="num mt-2 text-3xl font-extrabold tracking-tight">{stats.top[0] ? money(stats.top[0][1], stats.top[0][0]) : '—'}</div>}
          <div className="mt-1 text-xs text-muted-foreground">{stats.top.slice(1, 4).map(([f, v]) => money(v, f)).join(' · ') || t('ui.allTime')}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-muted-foreground">{t('ui.completedOrders')}</div>
          {orders === null ? <Skeleton className="mt-2 h-9 w-20" /> : <div className="num mt-2 text-3xl font-extrabold tracking-tight">{num(String(stats.done))}</div>}
          <div className="mt-1 text-xs text-muted-foreground">{profile ? `${t('profile.trades30d')}: ${profile.trades30d}` : ''}</div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([Icon, label, href]) => (
          <Link key={label} href={href.startsWith('#') ? href : L(href)} className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground transition-colors group-hover:text-primary"><Icon size={22} /></span>
            <span className="text-sm font-semibold">{label}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Card className="p-6" id="analytics">
          <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><TrendingUp size={18} className="text-primary" />{t('ui.analytics')}</h2><span className="text-xs text-muted-foreground">{t('ui.last14')}</span></div>
          <div className="mt-6 flex h-40 items-end gap-2" data-testid="analytics-chart">
            {stats.perDay.map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="num text-[10px] text-muted-foreground">{n || ''}</span>
                <span className={cn('w-full rounded-t-md', n ? 'bg-brand' : 'bg-muted')} style={{ height: `${6 + (n / maxDay) * 120}px` }} />
                <span className="text-[10px] text-muted-foreground">{stats.days[i].getDate()}</span>
              </div>
            ))}
          </div>
          {profile && <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
            <div><div className="text-xs text-muted-foreground">{t('profile.avgRelease')}</div><div className="num font-semibold">{t('common.seconds', { n: profile.avgReleaseSec })}</div></div>
            <div><div className="text-xs text-muted-foreground">{t('profile.disputes')}</div><div className="num font-semibold">{pct(profile.disputeRateBps)}</div></div>
            <div><div className="text-xs text-muted-foreground">{t('profile.feedback')}</div><div className="num font-semibold">👍 {profile.positiveFeedback} · 👎 {profile.negativeFeedback}</div></div>
          </div>}
        </Card>
        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center justify-between"><h2 className="font-semibold">{t('ad.mine')}</h2><Link href={L('/ads')} className="text-sm font-semibold text-primary hover:underline">{t('ui.viewAll')}</Link></div>
            <div className="mt-3 space-y-2">
              {ads.filter((a) => a.status !== 'closed').slice(0, 4).map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
                  <span className={cn('font-semibold', a.side === 'sell' ? 'text-sell' : 'text-buy')}>{t(a.side === 'sell' ? 'market.sellAction' : 'market.buyAction', { asset: a.asset })}</span>
                  <span className="num">{num(a.price, 8)} {a.fiat}</span>
                  <Badge variant={a.status === 'active' ? 'success' : 'warning'}>{a.status === 'active' ? t('ui.adActive') : t('ui.paused')}</Badge>
                </div>
              ))}
              {ads.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{t('ui.noAds')}</p>}
            </div>
          </Card>
          <ProgramCard status={status} onChange={() => api('/merchant-program/status').then(setStatus).catch(() => {})} />
        </div>
      </div>
    </div>
  );
}

function ProgramCard({ status, onChange }: { status: any; onChange: () => void }) {
  const { t } = useI18n();
  const { me } = useSession();
  const L = useL();
  const [f, setF] = useState({ businessName: '', country: '', expectedMonthlyVolumeUsd: '' });
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (me) setF((x) => ({ ...x, country: x.country || me.country })); }, [me]);
  if (!status) return <Skeleton className="h-48 rounded-2xl" />;
  if (status.status !== 'none') return (
    <Card className="p-6">
      <div className="flex items-center gap-2 font-semibold"><Store size={18} className="text-primary" />{t('ui.merchantTitle')}</div>
      <div className="mt-3 flex flex-wrap gap-2"><Badge variant={status.verifiedBadge ? 'success' : 'warning'}>{status.status}</Badge>{status.verifiedBadge && <Badge variant="info"><BadgeCheck size={12} />{t('profile.merchant')}</Badge>}</div>
      <div className="mt-3 text-sm text-muted-foreground">{t('ui.deposit')}: <span className="num font-semibold text-foreground">{status.deposit} {status.depositAsset}</span></div>
      <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><KeyRound size={14} />API: {status.apiKeys?.length ?? 0}</div>
      <a href="/v1/openapi.json" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"><FileText size={14} />{t('ui.apiDocs')}</a>
    </Card>
  );
  const tierOk = (me?.kycTier ?? 0) >= 2;
  return (
    <Card className="relative overflow-hidden p-6">
      <div className="pointer-events-none absolute -end-10 -top-10 h-36 w-36 rounded-full bg-primary/20 blur-2xl" />
      <div className="relative flex items-center gap-2 font-semibold"><Store size={18} className="text-primary" />{t('ui.merchantTitle')}</div>
      <p className="relative mt-1 text-sm text-muted-foreground">{t('ui.merchantDesc')}</p>
      {!tierOk ? <div className="relative mt-4 space-y-3"><Alert variant="warning">{t('errors.TIER_REQUIRED')}</Alert><Link href={L('/account')}><Button variant="outline" className="w-full">{t('ui.verifyNow')}</Button></Link></div> : (
        <form className="relative mt-4 space-y-3" onSubmit={async (e) => {
          e.preventDefault(); setErr(null);
          try { await api('/merchant-program/apply', { body: { businessName: f.businessName, country: f.country.toUpperCase(), expectedMonthlyVolumeUsd: Number(f.expectedMonthlyVolumeUsd || '0') } }); onChange(); } catch (x) { setErr(x); }
        }}>
          <div><Label htmlFor="bn">{t('ui.businessName')}</Label><Input id="bn" required minLength={2} value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="cc">{t('auth.country')}</Label><Input id="cc" maxLength={2} required value={f.country} onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase() })} /></div>
            <div><Label htmlFor="vol">{t('ui.monthlyVolume')}</Label><Input id="vol" inputMode="numeric" value={f.expectedMonthlyVolumeUsd} onChange={(e) => setF({ ...f, expectedMonthlyVolumeUsd: e.target.value.replace(/\D/g, '') })} /></div>
          </div>
          <ErrorText error={err} />
          <Button className="w-full" type="submit">{t('ui.apply')}</Button>
        </form>
      )}
    </Card>
  );
}
