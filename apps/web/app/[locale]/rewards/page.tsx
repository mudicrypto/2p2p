'use client';
/** Rewards & referrals: no backend program yet, so this is an honest "coming soon" page (no invented numbers). */
import Link from 'next/link';
import { Gift, Sparkles, Users } from 'lucide-react';
import { Button, Card } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { useL } from '../../../components/nav';

export default function Rewards() {
  const { t } = useI18n();
  const L = useL();
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Card className="relative overflow-hidden p-8 sm:p-12">
        <div className="hero-glow absolute inset-0" />
        <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-brand text-primary-foreground shadow-[0_20px_50px_-20px_rgb(245_181_10/0.8)]"><Gift size={38} /></span>
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-bold text-primary"><Sparkles size={13} />{t('ui.comingSoon')}</span>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{t('ui.rewardsTitle')}</h1>
            <p className="mt-2 max-w-xl text-muted-foreground">{t('ui.rewardsDesc')}</p>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-6"><Users className="text-primary" /><div className="mt-3 font-semibold">{t('ui.inviteTitle')}</div><p className="mt-1 text-sm text-muted-foreground">{t('ui.inviteSub')}</p></Card>
        <Card className="p-6"><Gift className="text-primary" /><div className="mt-3 font-semibold">{t('ui.statTakerFee')}: 0%</div><p className="mt-1 text-sm text-muted-foreground">{t('ui.hero2')}</p></Card>
      </div>
      <div className="text-center"><Link href={L('/p2p')}><Button size="lg">{t('ui.startTrading')}</Button></Link></div>
    </div>
  );
}
