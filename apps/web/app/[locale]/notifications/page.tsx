'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlarmClock, Gift, Bell, BellOff, BellRing, Briefcase, CheckCheck, MessageSquare, Receipt, ShieldAlert, Wallet, Gavel, BadgeCheck } from 'lucide-react';
import { Button, Card, Skeleton, cn } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';
import { useL } from '../../../components/nav';

const ICON: Record<string, React.ReactNode> = {
  chat_message: <MessageSquare size={17} />, order_disputed: <Gavel size={17} />, dispute_resolved: <Gavel size={17} />, deposit_credited: <Wallet size={17} />,
  withdrawal_status: <Wallet size={17} />, security_alert: <ShieldAlert size={17} />, tier_changed: <BadgeCheck size={17} />, price_alert: <BellRing size={17} />, release_reminder: <AlarmClock size={17} />, referral_reward: <Gift size={17} />, otc_update: <Briefcase size={17} />,
};
export default function Notifications() {
  const { t, date } = useI18n();
  const L = useL();
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { api<any[]>('/notifications').then(setRows).catch(() => setRows([])); }, []);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('notifications.title')}</h1>
        <Button size="sm" variant="outline" onClick={() => api('/notifications/read', { body: {} }).then(() => setRows((rows ?? []).map((r) => ({ ...r, read: true }))))}><CheckCheck size={15} />{t('notifications.markRead')}</Button></div>
      <Card className="divide-y divide-border overflow-hidden">
        {rows === null && <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
        {rows?.length === 0 && <div className="flex flex-col items-center gap-3 p-14 text-muted-foreground"><BellOff size={32} className="opacity-50" />{t('notifications.empty')}</div>}
        {rows?.map((n) => {
          const body = (
            <div className={cn('flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/40', !n.read && 'bg-primary/5')}>
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', n.type === 'security_alert' ? 'bg-sell/15 text-sell' : 'bg-primary/15 text-primary')}>{ICON[n.type] ?? (n.type.startsWith('order') ? <Receipt size={17} /> : <Bell size={17} />)}</span>
              <div className="min-w-0 flex-1"><div className="text-sm font-medium">{t(`notifications.types.${n.type}`)}</div><div className="text-xs text-muted-foreground">{date(n.createdAt)}</div></div>
              {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
            </div>
          );
          const href = n.payload?.orderId ? `/orders/${n.payload.orderId}` : n.type === 'price_alert' && n.payload?.asset ? `/p2p?side=${n.payload.side}&asset=${n.payload.asset}&fiat=${n.payload.fiat}` : n.type === 'otc_update' ? '/otc' : n.type === 'referral_reward' ? '/rewards' : null;
          return href ? <Link key={n.id} href={L(href)} className="block">{body}</Link> : <div key={n.id}>{body}</div>;
        })}
      </Card>
    </div>
  );
}
