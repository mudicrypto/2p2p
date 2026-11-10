'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, BadgeCheck, Gavel, KeyRound, Lock, ShieldCheck, Zap } from 'lucide-react';
import { AssetIcon, Avatar, Button, PayChip, cn } from '@p2p/ui';
import { useI18n } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { api } from '../../lib/api';
import { useL } from '../../components/nav';

function LiveOffers() {
  const { t, money, pct } = useI18n();
  const L = useL();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { api<{ items: any[] }>(`/ads?side=${side}&asset=USDT&fiat=EUR&limit=4`).then((r) => setItems(r.items)).catch(() => setItems([])); }, [side]);
  return (
    <div className="animate-fade-up rounded-3xl border border-border bg-card/80 p-4 shadow-[var(--shadow-glow)] backdrop-blur sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold"><AssetIcon asset="USDT" size={22} />USDT / EUR</div>
        <div className="flex rounded-lg bg-muted p-0.5 text-xs font-semibold">
          {(['buy', 'sell'] as const).map((s) => <button key={s} onClick={() => setSide(s)} className={cn('rounded-md px-3 py-1', side === s ? (s === 'buy' ? 'bg-buy text-[#04130d]' : 'bg-sell text-white') : 'text-muted-foreground')}>{t(`market.${s}`)}</button>)}
        </div>
      </div>
      <div className="space-y-2">
        {(items ?? Array.from({ length: 3 })).slice(0, 4).map((ad: any, i) => ad ? (
          <Link key={ad.id} href={L('/p2p')} className="flex items-center gap-3 rounded-2xl bg-surface p-3 transition-colors hover:bg-muted">
            <Avatar name={ad.advertiser.displayName} seed={ad.advertiser.id} size={34} />
            <div className="min-w-0 flex-1"><div className="flex items-center gap-1 truncate text-sm font-medium">{ad.advertiser.displayName}{ad.advertiser.verifiedBadge && <BadgeCheck size={14} className="text-primary" />}</div>
              <div className="text-[11px] text-muted-foreground">{t('market.trades', { count: ad.advertiser.trades30d })} · {pct(ad.advertiser.completionRateBps)}</div></div>
            <div className="text-end"><div className="num text-sm font-semibold">{money(ad.price, ad.fiat)}</div><div className="mt-0.5 flex justify-end gap-1">{ad.paymentTypes.slice(0, 1).map((p: string) => <PayChip key={p} code={p} />)}</div></div>
          </Link>
        ) : <div key={i} className="h-[62px] animate-pulse rounded-2xl bg-surface" />)}
        {items?.length === 0 && <div className="rounded-2xl bg-surface p-6 text-center text-sm text-muted-foreground">{t('market.empty')}</div>}
      </div>
      <Link href={L('/p2p')}><Button variant={side} className="mt-4 w-full">{t(side === 'buy' ? 'market.buyAction' : 'market.sellAction', { asset: 'USDT' })}<ArrowRight size={16} className="rtl:rotate-180" /></Button></Link>
    </div>
  );
}

export default function Landing() {
  const { t } = useI18n();
  const { me } = useSession();
  const L = useL();
  const [methods, setMethods] = useState<Array<{ code: string; name: string }>>([]);
  useEffect(() => { api<any[]>('/payment-method-types').then(setMethods).catch(() => {}); }, []);
  const why = [[Lock, 'why1'], [BadgeCheck, 'why2'], [Gavel, 'why3'], [KeyRound, 'why4']] as const;
  return (
    <div className="-mt-6">
      {/* hero */}
      <section className="relative -mx-4 overflow-hidden px-4 pb-14 pt-12 sm:-mx-6 sm:px-6 sm:pt-20">
        <div className="hero-glow pointer-events-none absolute inset-0" /><div className="grid-lines pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground"><Zap size={13} className="text-warn" />0% · {t('ui.statTakerFee')}</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl"><span className="text-gradient">{t('ui.hero1')}</span></h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">{t('ui.hero2')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={L(me ? '/p2p' : '/signup')}><Button size="lg" data-testid="hero-cta">{t('ui.getStarted')}<ArrowRight size={18} className="rtl:rotate-180" /></Button></Link>
              <Link href={L('/p2p')}><Button size="lg" variant="outline">{t('ui.exploreMarket')}</Button></Link>
            </div>
            <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground"><span className="flex -space-x-2 rtl:space-x-reverse">{['USDT', 'BTC', 'ETH'].map((a) => <AssetIcon key={a} asset={a} size={26} className="ring-2 ring-background" />)}</span>USDT · BTC · ETH</div>
          </div>
          <LiveOffers />
        </div>
      </section>
      {/* stats */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['150+', 'statCurrencies'], ['70+', 'statMethods'], ['0%', 'statTakerFee'], ['100%', 'statEscrow']].map(([v, k]) => (
          <div key={k} className="rounded-2xl border border-border bg-card p-5"><div className="num text-3xl font-extrabold tracking-tight sm:text-4xl">{v}</div><div className="mt-1 text-sm text-muted-foreground">{t(`ui.${k}`)}</div></div>
        ))}
      </section>
      {/* payment methods marquee */}
      {methods.length > 0 && (
        <section className="mt-16">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">{t('ui.methodsTitle')}</h2>
          <div className="relative mt-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]" dir="ltr">
            <div className="flex w-max animate-marquee gap-3">
              {[...methods, ...methods].map((m, i) => <span key={i} className="whitespace-nowrap rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium">{m.name}</span>)}
            </div>
          </div>
        </section>
      )}
      {/* how it works */}
      <section className="mt-16">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">{t('ui.howTitle')}</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="relative rounded-3xl border border-border bg-card p-6">
              <span className="bg-brand flex h-10 w-10 items-center justify-center rounded-xl text-lg font-extrabold text-white">{n}</span>
              <h3 className="mt-4 text-lg font-semibold">{t(`ui.how${n}t`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`ui.how${n}d`)}</p>
            </div>
          ))}
        </div>
      </section>
      {/* why */}
      <section className="mt-16">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">{t('ui.whyTitle')}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {why.map(([Icon, k]) => (
            <div key={k} className="rounded-3xl border border-border bg-card p-6 transition-colors hover:border-primary/50">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary"><Icon size={22} /></span>
              <h3 className="mt-4 font-semibold">{t(`ui.${k}t`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`ui.${k}d`)}</p>
            </div>
          ))}
        </div>
      </section>
      {/* CTA */}
      <section className="bg-brand relative mt-16 overflow-hidden rounded-3xl p-8 text-white sm:p-12">
        <ShieldCheck size={220} className="pointer-events-none absolute -bottom-10 -end-6 opacity-15" />
        <h2 className="relative max-w-lg text-3xl font-extrabold tracking-tight sm:text-4xl">{t('ui.ctaTitle')}</h2>
        <p className="relative mt-3 max-w-lg text-white/85">{t('app.tagline')}</p>
        <Link href={L(me ? '/p2p' : '/signup')} className="relative mt-6 inline-block"><Button size="lg" className="bg-white bg-none text-[#1b1440] shadow-none hover:bg-white/90">{t('ui.getStarted')}<ArrowRight size={18} className="rtl:rotate-180" /></Button></Link>
      </section>
    </div>
  );
}
