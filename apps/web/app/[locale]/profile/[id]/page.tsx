'use client';
import { use, useEffect, useState } from 'react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@p2p/ui';
import { useI18n } from '../../../../lib/i18n';
import { api } from '../../../../lib/api';
export default function Profile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, pct, date } = useI18n();
  const [p, setP] = useState<any>(null);
  useEffect(() => { api(`/users/${id}/profile`).then(setP).catch(() => {}); }, [id]);
  if (!p) return <p>{t('common.loading')}</p>;
  const stat = (k: string, v: React.ReactNode, testid?: string) => <div className="rounded-md bg-muted p-3"><div className="text-xs text-muted-foreground">{t(k)}</div><div className="text-lg font-semibold" data-testid={testid}>{v}</div></div>;
  return <Card><CardHeader><CardTitle className="flex flex-wrap items-center gap-2">{p.displayName}<Badge variant="info">{t('profile.tier', { tier: p.kycTier })}</Badge>{p.verifiedBadge && <Badge variant="success">{t('profile.merchant')}</Badge>}</CardTitle>
    <p className="text-sm text-muted-foreground">{t('profile.age', { days: p.accountAgeDays })}</p></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stat('profile.trades30d', p.trades30d, 'trades30d')}{stat('profile.completion', pct(p.completionRateBps))}{stat('profile.avgRelease', t('common.seconds', { n: p.avgReleaseSec }))}
        {stat('profile.disputes', pct(p.disputeRateBps))}{stat('profile.freezeReports', p.freezeReports)}{stat('profile.feedback', `👍 ${p.positiveFeedback} · 👎 ${p.negativeFeedback}`, 'feedback-count')}
      </div>
      <ul className="space-y-1 text-sm">{p.recentFeedback.map((f: any, i: number) => <li key={i}>{f.positive ? '👍' : '👎'} {f.comment} <span className="text-xs text-muted-foreground">{date(f.createdAt)}</span></li>)}</ul>
    </CardContent></Card>;
}
