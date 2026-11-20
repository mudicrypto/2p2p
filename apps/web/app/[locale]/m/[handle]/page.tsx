'use client';
/** Public merchant page ("pay with link"): parley.trade/<locale>/m/<nickname> lists the merchant's live offers. */
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Store } from 'lucide-react';
import { AssetIcon, Avatar, Badge, Button, Card, PayChip, Skeleton } from '@p2p/ui';
import { useI18n } from '../../../../lib/i18n';
import { api } from '../../../../lib/api';
import { useL } from '../../../../components/nav';
import { TradeDialog } from '../../../../components/trade-dialog';
import { Presence } from '../../../../components/community';

export default function MerchantShop({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const { t, num, money, pct } = useI18n();
  const L = useL();
  const [d, setD] = useState<any>(null);
  const [missing, setMissing] = useState(false);
  const [sel, setSel] = useState<any | null>(null);
  useEffect(() => { api(`/m/${encodeURIComponent(decodeURIComponent(handle))}`).then(setD).catch(() => setMissing(true)); }, [handle]);
  if (missing) return <Card className="mx-auto max-w-lg p-10 text-center text-muted-foreground" data-testid="shop-missing">{t('ui.shopMissing')}</Card>;
  if (!d) return <Skeleton className="mx-auto h-80 max-w-3xl rounded-[28px]" />;
  const p = d.profile;
  return (
    <div className="mx-auto max-w-3xl space-y-3" data-testid="shop">
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="hero-glow pointer-events-none absolute inset-0" />
        <div className="relative flex flex-wrap items-center gap-4">
          <Avatar name={p.displayName} seed={p.id} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[24px] font-bold tracking-tight">{p.displayName}{p.verifiedBadge && <BadgeCheck size={20} className="text-primary" />}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground"><Presence online={p.online} lastSeenAt={p.lastSeenAt} away={p.away} offHours={p.offHours} />
              <span>{t('ui.tradesTotal', { n: num(String(p.tradesTotal ?? 0)) })}</span>{(p.tradesTotal ?? 0) > 0 && <span>{pct(p.completionRateBps)} {t('ui.completionRate').toLowerCase()}</span>}
              {p.trust && <span>{t('ui.trustScore')}: {p.trust.score}/100</span>}</div>
          </div>
          <Link href={L(`/profile/${p.id}`)}><Button variant="soft">{t('ui.viewPassport')}</Button></Link>
        </div>
      </Card>
      <Card className="p-4 sm:p-6">
        <div className="mb-2 flex items-center gap-2 text-[20px] font-semibold"><Store size={18} />{t('ui.shopOffers')}</div>
        {d.ads.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{p.away || p.offHours ? t('ui.shopClosed') : t('market.empty')}</p>}
        {d.ads.map((ad: any) => {
          const takerSide = ad.side === 'sell' ? 'buy' : 'sell';
          return (
            <div key={ad.id} className="flex flex-wrap items-center gap-3 border-b border-border py-3.5 last:border-0" data-testid="shop-ad">
              <AssetIcon asset={ad.asset} size={32} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t(takerSide === 'buy' ? 'market.buyAction' : 'market.sellAction', { asset: ad.asset })} · {ad.fiat}</div>
                <div className="text-sm text-muted-foreground"><span className="num">{num(ad.price, 8)} {ad.fiat}</span> · {money(ad.minAmount, ad.fiat)} – {money(ad.maxAmount, ad.fiat)}</div>
                <div className="mt-1 flex flex-wrap gap-1">{ad.paymentTypes.map((x: string) => <PayChip key={x} code={x} />)}</div>
              </div>
              {ad.promotedUntil && new Date(ad.promotedUntil) > new Date() && <Badge variant="warning">{t('ui.promoted')}</Badge>}
              <Button variant={takerSide === 'buy' ? 'default' : 'sell'} onClick={() => setSel({ ...ad, advertiser: { ...ad.advertiser, id: p.id, displayName: p.displayName } })} data-testid="shop-trade">{t(takerSide === 'buy' ? 'market.buy' : 'market.sell')}</Button>
            </div>
          );
        })}
      </Card>
      <p className="px-2 text-center text-xs text-muted-foreground">{t('ui.escrowNote')}</p>
      {sel && <TradeDialog ad={sel} side={sel.side === 'sell' ? 'buy' : 'sell'} onClose={() => setSel(null)} />}
    </div>
  );
}
