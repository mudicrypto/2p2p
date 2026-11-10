'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ReceiptText } from 'lucide-react';
import { AssetIcon, Avatar, Badge, Button, Card, LineTabs, Skeleton, cn } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';
import { useL } from '../../../components/nav';

const ACTIVE = new Set(['CREATED', 'AWAITING_PAYMENT', 'PAID', 'DISPUTED']);
const variant = (s: string) => (s === 'COMPLETED' ? 'success' : s === 'CANCELLED' ? 'default' : s === 'DISPUTED' ? 'danger' : 'warning');

export default function Orders() {
  const { t, num, money, date } = useI18n();
  const L = useL();
  const [rows, setRows] = useState<any[] | null>(null);
  const [tab, setTab] = useState<'active' | 'all' | 'done'>('active');
  useEffect(() => { api<any[]>('/orders').then((r) => { setRows(r); if (!r.some((o) => ACTIVE.has(o.status))) setTab('all'); }).catch(() => setRows([])); }, []);
  const shown = useMemo(() => (rows ?? []).filter((o) => (tab === 'all' ? true : tab === 'active' ? ACTIVE.has(o.status) : !ACTIVE.has(o.status))), [rows, tab]);
  const activeCount = (rows ?? []).filter((o) => ACTIVE.has(o.status)).length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('nav.orders')}</h1>
        <Link href={L('/p2p')}><Button variant="soft">{t('ui.exploreMarket')}</Button></Link></div>
      <LineTabs value={tab} onChange={setTab} options={[{ value: 'active', label: <>{t('ui.active')}{activeCount > 0 && <span className="ms-1.5 rounded-full bg-primary px-1.5 text-[10px] text-white">{activeCount}</span>}</> }, { value: 'done', label: t('order.status.COMPLETED') }, { value: 'all', label: t('ui.all') }]} />
      <div className="space-y-2" data-testid="orders-list">
        {rows === null && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        {rows && shown.length === 0 && (
          <Card className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground"><ReceiptText size={36} className="opacity-50" />{t('ui.noData')}</Card>
        )}
        {shown.map((o) => (
          <Link key={o.id} href={L(`/orders/${o.id}`)} className="block">
            <Card className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-4 transition-colors hover:border-primary/40 sm:grid-cols-[auto_1.4fr_1fr_1fr_auto_auto] sm:gap-5">
              <AssetIcon asset={o.asset} size={36} />
              <div className="min-w-0">
                <div className={cn('text-sm font-semibold', o.role === 'buyer' ? 'text-buy' : 'text-sell')}>{t(o.role === 'buyer' ? 'market.buyAction' : 'market.sellAction', { asset: o.asset })}</div>
                <div className="truncate text-xs text-muted-foreground">{date(o.createdAt)}</div>
              </div>
              <div className="num hidden text-sm sm:block"><div className="text-xs text-muted-foreground">{t('order.amount')}</div>{money(o.fiatAmount, o.fiat)}</div>
              <div className="num hidden text-sm sm:block"><div className="text-xs text-muted-foreground">{o.asset}</div>{num(o.cryptoAmount)}</div>
              <div className="text-end sm:text-start"><Badge variant={variant(o.status) as any}>{t(`order.status.${o.status}`)}</Badge><div className="num mt-1 text-xs text-muted-foreground sm:hidden">{money(o.fiatAmount, o.fiat)}</div></div>
              <ChevronRight size={18} className="hidden text-muted-foreground sm:block rtl:-scale-x-100" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
