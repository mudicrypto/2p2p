'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, Skeleton, cn } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';
import { ACTIVE_STATUSES, useL } from '../../../components/nav';
import { cdp, orderState } from '../../../components/order-state';

export default function Orders() {
  const { t, num, money, date } = useI18n();
  const L = useL();
  const [rows, setRows] = useState<any[] | null>(null);
  const [tab, setTab] = useState<'active' | 'done'>('active');
  useEffect(() => { api<any[]>('/orders').then((r) => { setRows(r); if (!r.some((o) => ACTIVE_STATUSES.has(o.status))) setTab('done'); }).catch(() => setRows([])); }, []);
  const active = useMemo(() => (rows ?? []).filter((o) => ACTIVE_STATUSES.has(o.status)), [rows]);
  const shown = tab === 'active' ? active : (rows ?? []).filter((o) => !ACTIVE_STATUSES.has(o.status));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <h1 className="text-[32px] font-bold tracking-[-0.03em] sm:text-[40px]">{t('ui.ordersNav')}</h1>
        <div className="flex rounded-full bg-muted p-1">
          <button type="button" onClick={() => setTab('active')} className={cn('rounded-full px-6 py-2.5 text-[15px] font-semibold', tab === 'active' ? 'bg-ink text-ink-foreground' : '')}>{t('ui.activeN', { n: active.length })}</button>
          <button type="button" onClick={() => setTab('done')} className={cn('rounded-full px-6 py-2.5 text-[15px] font-semibold', tab === 'done' ? 'bg-ink text-ink-foreground' : '')}>{t('order.status.COMPLETED')}</button>
        </div>
      </div>
      <Card className="px-3 py-2 sm:px-6" data-testid="orders-list">
        <div className="hidden grid-cols-[1.8fr_1.2fr_1fr_0.8fr_1.1fr_auto] gap-4 border-b border-border py-3 text-[13px] text-muted-foreground md:grid">
          <span>{t('ui.trade')}</span><span>{t('order.counterparty')}</span><span>{t('ui.fiat')}</span><span>{t('market.price')}</span><span>{t('ui.status')}</span><span className="w-20" />
        </div>
        {rows === null && <div className="space-y-2 py-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
        {rows && shown.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{t('ui.noData')}</p>}
        {shown.map((o) => {
          const st = orderState(o, t);
          const cp = o.counterparty?.displayName ?? o.counterparty?.id?.slice(0, 8) ?? '—';
          return (
            <Link key={o.id} href={L(`/orders/${o.id}`)} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-border py-3.5 last:border-0 md:grid-cols-[1.8fr_1.2fr_1fr_0.8fr_1.1fr_auto]">
              <div className="min-w-0">
                <div className="truncate text-[16px] font-semibold">{t(o.role === 'buyer' ? 'ui.buyingX' : 'ui.sellingX', { amount: num(o.cryptoAmount, cdp(o.asset)), asset: o.asset })}</div>
                <div className="text-[13px] text-muted-foreground">{st.hint || date(o.createdAt)}<span className="md:hidden"> · {cp} · {money(o.fiatAmount, o.fiat)}</span></div>
              </div>
              <span className="hidden truncate md:block">{cp}</span>
              <span className="num hidden md:block">{num(o.fiatAmount, 2)} {o.fiat}</span>
              <span className="num hidden md:block">{num(o.price, 8)}</span>
              <span className="justify-self-end md:justify-self-start"><Badge variant={st.tone}>{st.pill}</Badge></span>
              <span className="hidden md:block"><Button variant="soft" className="w-20" tabIndex={-1}>{t('ui.open')}</Button></span>
            </Link>
          );
        })}
      </Card>
      <p className="px-5 text-[13px] text-muted-foreground">{t('ui.escrowNote')}</p>
    </div>
  );
}
