'use client';
/** parley trader passport: who you are trading with, from real trade history only. */
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BadgeCheck, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Avatar, Badge, Card, Skeleton, cn } from '@p2p/ui';
import { useI18n } from '../../../../lib/i18n';
import { api } from '../../../../lib/api';
import { releaseLabel } from '../../../../components/trade-home';

export default function Passport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, pct, date, num } = useI18n();
  const router = useRouter();
  const [p, setP] = useState<any>(null);
  useEffect(() => { api(`/users/${id}/profile`).then(setP).catch(() => {}); }, [id]);
  if (!p) return <div className="grid gap-3 lg:grid-cols-2"><Skeleton className="h-[380px] rounded-[28px]" /><Skeleton className="h-[380px] rounded-[28px]" /></div>;
  const total = p.positiveFeedback + p.negativeFeedback;
  const posPct = total ? Math.round((p.positiveFeedback / total) * 100) : null;
  const Stat = ({ label, value, hint, testid }: { label: string; value: React.ReactNode; hint?: React.ReactNode; testid?: string }) => (
    <Card className="p-6"><div className="text-sm text-muted-foreground">{label}</div><div className="num mt-2 text-[30px] font-bold tracking-tight" data-testid={testid}>{value}</div>{hint && <div className="mt-1 text-sm text-muted-foreground">{hint}</div>}</Card>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={() => router.back()} aria-label={t('common.back')} className="flex h-11 w-11 items-center justify-center rounded-full bg-card hover:brightness-110"><ArrowLeft size={18} className="rtl:-scale-x-100" /></button>
        <h1 className="text-[24px] font-bold tracking-[-0.03em] sm:text-[30px]">{t('ui.traderPassport')}</h1>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
        <Card className="relative overflow-hidden px-5 py-8 text-center sm:px-8">
          <div className="hero-glow pointer-events-none absolute inset-0" />
          <div className="relative">
            <Avatar name={p.displayName} seed={id} size={64} className="mx-auto" />
            <div className="mt-3 flex items-center justify-center gap-1.5 text-[22px] font-semibold tracking-tight">{p.displayName}{p.verifiedBadge && <BadgeCheck size={20} className="text-primary" />}</div>
            <div className="mt-1 text-sm text-muted-foreground">{t('profile.age', { days: p.accountAgeDays })}</div>
            <div className="num-xl mt-6 text-[72px] sm:text-[96px]">{(p.tradesTotal ?? p.trades30d) > 0 ? pct(p.completionRateBps) : '—'}</div>
            <div className="text-[15px] font-medium">{(p.tradesTotal ?? p.trades30d) > 0 ? t('ui.completionRate') : t('ui.noTradesYet')}</div>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {p.kycTier >= 1 && <Badge variant="success">{t('ui.idVerified')}</Badge>}
              <Badge variant="info">{t('profile.tier', { tier: p.kycTier })}</Badge>
              {p.verifiedBadge && <Badge variant="warning">{t('ui.merchantBond')}</Badge>}
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t('profile.trades30d')} value={num(String(p.trades30d))} hint={t('ui.tradesTotal', { n: num(String(p.tradesTotal ?? 0)) })} testid="trades30d" />
          <Stat label={t('ui.usualRelease')} value={p.avgReleaseSec ? releaseLabel(p.avgReleaseSec, t) : '—'} />
          <Stat label={t('profile.disputes')} value={pct(p.disputeRateBps)} />
          <Stat label={t('profile.freezeReports')} value={num(String(p.freezeReports))} />
          <Card className="col-span-2 p-6">
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{t('profile.feedback')}</span>{posPct !== null && <span className="num font-semibold">{posPct}%</span>}</div>
            <div className="mt-2 flex items-center gap-4 text-[22px] font-bold" data-testid="feedback-count"><span className="flex items-center gap-1.5"><ThumbsUp size={18} className="text-buy" />{p.positiveFeedback}</span><span className="flex items-center gap-1.5"><ThumbsDown size={18} className="text-sell" />{p.negativeFeedback}</span></div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-buy" style={{ width: `${posPct ?? 0}%` }} /></div>
          </Card>
        </div>
      </div>
      <Card className="p-6">
        <div className="text-[20px] font-semibold tracking-tight">{t('ui.recentFeedback')}</div>
        {p.recentFeedback.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('ui.noData')}</p>}
        <ul className="mt-2 divide-y divide-border">{p.recentFeedback.map((f: any, i: number) => (
          <li key={i} className="flex items-start gap-3 py-3.5 text-[15px]">
            <span className={cn('mt-0.5', f.positive ? 'text-buy' : 'text-sell')}>{f.positive ? <ThumbsUp size={16} /> : <ThumbsDown size={16} />}</span>
            <span className="flex-1">{f.comment || (f.positive ? t('order.positive') : t('order.negative'))}</span><span className="text-xs text-muted-foreground">{date(f.createdAt)}</span>
          </li>))}</ul>
      </Card>
    </div>
  );
}
