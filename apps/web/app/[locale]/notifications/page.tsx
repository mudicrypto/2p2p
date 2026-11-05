'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card } from '@p2p/ui';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { useL } from '@/components/nav';
export default function Notifications() {
  const { t, date } = useI18n();
  const L = useL();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api<any[]>('/notifications').then(setRows).catch(() => {}); }, []);
  return <div className="space-y-2"><div className="flex items-center justify-between"><h1 className="text-xl font-semibold">{t('notifications.title')}</h1>
    <Button size="sm" variant="outline" onClick={() => api('/notifications/read', { body: {} }).then(() => setRows(rows.map((r) => ({ ...r, read: true }))))}>{t('notifications.markRead')}</Button></div>
    {rows.length === 0 && <Card className="p-6 text-center text-muted-foreground">{t('notifications.empty')}</Card>}
    {rows.map((n) => <Card key={n.id} className={`p-3 text-sm ${n.read ? 'opacity-70' : ''}`}>
      {n.payload?.orderId ? <Link className="underline" href={L(`/orders/${n.payload.orderId}`)}>{t(`notifications.types.${n.type}`)}</Link> : t(`notifications.types.${n.type}`)}
      <span className="ms-2 text-xs text-muted-foreground">{date(n.createdAt)}</span></Card>)}</div>;
}
