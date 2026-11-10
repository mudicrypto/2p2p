'use client';
import { use, useEffect, useState } from 'react';
import { BadgeCheck, CalendarDays, Gavel, Snowflake, ThumbsDown, ThumbsUp, Timer, TrendingUp } from 'lucide-react';
import { Avatar, Badge, Card, Skeleton } from '@p2p/ui';
import { useI18n } from '../../../../lib/i18n';
import { api } from '../../../../lib/api';

export default function Profile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, pct, date } = useI18n();
  const [p, setP] = useState<any>(null);
  useEffect(() => { api(`/users/${id}/profile`).then(setP).catch(() => {}); }, [id]);
  if (!p) return <div className="space-y-4"><Skeleton className="h-40 rounded-3xl" /><Skeleton className="h-64 rounded-3xl" /></div>;
  const total = p.positiveFeedback + p.negativeFeedback;
  const posPct = total ? Math.round((p.positiveFeedback / total) * 100) : 100;
  const stat = (icon: React.ReactNode, k: string, v: React.ReactNode, testid?: string) => (
    <Card className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{t(k)}</div><div className="num mt-1.5 text-2xl font-bold tracking-tight" data-testid={testid}>{v}</div></Card>
  );
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -end-16 -top-20 h-60 w-60 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5">
          <Avatar name={p.displayName} seed={id} size={72} online />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">{p.displayName}{p.verifiedBadge && <BadgeCheck size={22} className="text-primary" />}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="info">{t('profile.tier', { tier: p.kycTier })}</Badge>
              {p.verifiedBadge && <Badge variant="success">{t('profile.merchant')}</Badge>}
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays size={13} />{t('profile.age', { days: p.accountAgeDays })}</span>
            </div>
          </div>
          <div className="text-center"><div className="num text-3xl font-bold text-buy">{posPct}%</div><div className="text-xs text-muted-foreground">{t('profile.feedback')}</div></div>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stat(<TrendingUp size={13} />, 'profile.trades30d', p.trades30d, 'trades30d')}
        {stat(<ThumbsUp size={13} />, 'profile.completion', pct(p.completionRateBps))}
        {stat(<Timer size={13} />, 'profile.avgRelease', t('common.seconds', { n: p.avgReleaseSec }))}
        {stat(<Gavel size={13} />, 'profile.disputes', pct(p.disputeRateBps))}
        {stat(<Snowflake size={13} />, 'profile.freezeReports', p.freezeReports)}
        <Card className="p-4"><div className="text-xs text-muted-foreground">{t('profile.feedback')}</div>
          <div className="mt-1.5 flex items-center gap-3 text-lg font-bold" data-testid="feedback-count"><span className="flex items-center gap-1 text-buy"><ThumbsUp size={16} />{p.positiveFeedback}</span><span className="flex items-center gap-1 text-sell"><ThumbsDown size={16} />{p.negativeFeedback}</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sell/30"><div className="h-full bg-buy" style={{ width: `${posPct}%` }} /></div></Card>
      </div>
      <Card className="p-5 sm:p-6">
        <div className="mb-3 font-semibold">{t('profile.feedback')}</div>
        {p.recentFeedback.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t('ui.noData')}</p>}
        <ul className="divide-y divide-border">{p.recentFeedback.map((f: any, i: number) => (
          <li key={i} className="flex items-start gap-3 py-3 text-sm">
            <span className={f.positive ? 'text-buy' : 'text-sell'}>{f.positive ? <ThumbsUp size={16} /> : <ThumbsDown size={16} />}</span>
            <span className="flex-1">{f.comment || '—'}</span><span className="text-xs text-muted-foreground">{date(f.createdAt)}</span>
          </li>))}</ul>
      </Card>
    </div>
  );
}
