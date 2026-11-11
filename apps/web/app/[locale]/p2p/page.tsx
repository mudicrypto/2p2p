'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Megaphone, ShieldCheck } from 'lucide-react';
import { Button } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { useSession } from '../../../lib/session';
import { useL } from '../../../components/nav';
import { Offers } from '../../../components/offers';

function Market() {
  const { t } = useI18n();
  const { me } = useSession();
  const L = useL();
  const sp = useSearchParams();
  const side = sp.get('side') === 'sell' ? 'sell' : 'buy';
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('ui.p2pTrade')}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><ShieldCheck size={15} className="text-primary" />{t('ui.why1t')} · {t('ui.statTakerFee')} 0%</p>
        </div>
        {me && <Link href={L('/ads/new')}><Button variant="outline"><Megaphone size={16} />{t('nav.postAd')}</Button></Link>}
      </div>
      <Offers key={sp.toString()} initial={{ side, asset: sp.get('asset') ?? 'USDT', fiat: sp.get('fiat') ?? 'USD', paymentType: sp.get('pm') ?? '' }} />
    </div>
  );
}
export default function Page() { return <Suspense><Market /></Suspense>; }
