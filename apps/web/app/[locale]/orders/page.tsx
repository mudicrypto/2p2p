'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Card } from '@p2p/ui';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { useL } from '@/components/nav';
export default function Orders() {
  const { t, num, money, date } = useI18n();
  const L = useL();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api<any[]>('/orders').then(setRows).catch(() => {}); }, []);
  return <div className="space-y-2"><h1 className="text-xl font-semibold">{t('nav.orders')}</h1>
    {rows.map((o) => <Link key={o.id} href={L(`/orders/${o.id}`)}><Card className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-muted">
      <span>{t(`order.role.${o.role}`)} {num(o.cryptoAmount)} {o.asset}</span><span>{money(o.fiatAmount, o.fiat)}</span><Badge>{t(`order.status.${o.status}`)}</Badge><span className="text-xs text-muted-foreground">{date(o.createdAt)}</span>
    </Card></Link>)}</div>;
}
