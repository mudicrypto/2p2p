'use client';
/** Invite friends: the user's real invite code and counts from the referral program. Rewards are not live yet, and the page says so. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gift, Link2, UserPlus, Users } from 'lucide-react';
import { Button, Card, CopyButton, Skeleton } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { useSession } from '../../../lib/session';
import { api } from '../../../lib/api';
import { useL } from '../../../components/nav';

export default function Rewards() {
  const { t, num } = useI18n();
  const { me } = useSession();
  const L = useL();
  const [info, setInfo] = useState<{ code: string; invited: number; traded: number } | null>(null);
  const [origin, setOrigin] = useState('');
  const [rw, setRw] = useState<{ enabled: boolean; rewardAsset: string; rewardAmount: string; minTradeUsd: string; earned: string; pending: string } | null>(null);
  useEffect(() => { setOrigin(window.location.origin); if (me) { api('/me/referral').then(setInfo).catch(() => {}); api('/me/referral/rewards').then(setRw).catch(() => {}); } }, [me]);
  const link = info ? `${origin}${L('/signup')}?ref=${info.code}` : '';
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Card className="relative overflow-hidden p-8 sm:p-12">
        <div className="hero-glow absolute inset-0" />
        <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-brand text-primary-foreground shadow-[0_20px_50px_-20px_rgb(245_181_10/0.8)]"><Gift size={38} /></span>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('ui.inviteTitle')}</h1>
            <p className="mt-2 max-w-xl text-muted-foreground">{t('ui.referralHow')}</p>
          </div>
        </div>
      </Card>
      {!me ? (
        <Card className="flex flex-col items-center gap-4 p-10 text-center"><p className="text-muted-foreground">{t('ui.inviteSub')}</p><Link href={L('/signup')}><Button size="lg">{t('auth.signup')}</Button></Link></Card>
      ) : !info ? <Skeleton className="h-48 rounded-2xl" /> : (
        <>
          <Card className="space-y-4 p-6">
            <div><div className="text-sm text-muted-foreground">{t('ui.referralCode')}</div>
              <div className="mt-1 flex items-center gap-2"><span className="num text-3xl font-bold tracking-[0.15em]" data-testid="ref-code">{info.code}</span><CopyButton value={info.code} /></div></div>
            <div><div className="flex items-center gap-1.5 text-sm text-muted-foreground"><Link2 size={14} />{t('ui.inviteLink')}</div>
              <div className="mt-1 flex items-center gap-2 rounded-xl bg-muted px-3 py-2"><code className="min-w-0 flex-1 truncate text-sm" data-testid="ref-link">{link}</code><CopyButton value={link} /></div></div>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="p-6"><UserPlus className="text-primary" /><div className="num mt-3 text-3xl font-bold" data-testid="ref-invited">{num(String(info.invited))}</div><div className="text-sm text-muted-foreground">{t('ui.refInvited')}</div></Card>
            <Card className="p-6"><Users className="text-primary" /><div className="num mt-3 text-3xl font-bold" data-testid="ref-traded">{num(String(info.traded))}</div><div className="text-sm text-muted-foreground">{t('ui.refTraded')}</div></Card>
          </div>
          {rw?.enabled ? (
            <Card className="grid gap-4 p-6 sm:grid-cols-3" data-testid="ref-rewards">
              <div className="sm:col-span-3 text-sm text-muted-foreground">{t('ui.rewardRule', { amount: rw.rewardAmount, asset: rw.rewardAsset, min: rw.minTradeUsd })}</div>
              <div><div className="text-sm text-muted-foreground">{t('ui.rewardEarned')}</div><div className="num text-2xl font-bold" data-testid="ref-earned">{rw.earned} {rw.rewardAsset}</div></div>
              <div><div className="text-sm text-muted-foreground">{t('ui.rewardPending')}</div><div className="num text-2xl font-bold">{rw.pending} {rw.rewardAsset}</div></div>
            </Card>
          ) : <p className="px-2 text-center text-sm text-muted-foreground">{t('ui.referralRewardsSoon')}</p>}
        </>
      )}
    </div>
  );
}
