'use client';
/** Home dashboard (KRYPTA): hero, trust strip, total balance, P2P offers, market depth. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, Eye, EyeOff, Gavel, Globe2, PlayCircle, ShieldCheck } from 'lucide-react';
import { AssetIcon, BRAND, Button, Card, Skeleton, cn } from '@p2p/ui';
import { useI18n } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { api } from '../../lib/api';
import { useDisplayFiat, useQuotes, valuate } from '../../lib/market';
import { useL } from '../../components/nav';
import { Offers } from '../../components/offers';
import { Globe } from '../../components/globe';

export default function Home() {
  const { t } = useI18n();
  const L = useL();
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        {/* Hero */}
        <section className="relative isolate min-h-[300px] overflow-hidden rounded-3xl border border-border bg-card">
          <div className="hero-glow absolute inset-0 -z-10" />
          <Globe className="pointer-events-none absolute -bottom-40 -end-40 -z-10 h-[420px] w-[420px] opacity-45 sm:-end-10 sm:-top-16 sm:bottom-auto sm:h-[520px] sm:w-[520px] sm:opacity-90" />
          <div className="relative max-w-xl p-6 sm:p-10">
            <h1 className="text-[40px] font-extrabold leading-[1.04] tracking-tight sm:text-[54px]" data-testid="hero-title">
              {t('ui.heroA')}<br /><span className="text-gradient">{t('ui.heroB')}</span>
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">{t('ui.heroSub', { brand: BRAND.name })}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={L('/p2p')}><Button size="lg" data-testid="hero-cta">{t('ui.startTrading')}<ArrowRight size={18} className="rtl:-scale-x-100" /></Button></Link>
              <Link href={L('/help')}><Button size="lg" variant="outline" className="bg-background/40 backdrop-blur"><PlayCircle size={18} />{t('ui.learnMore')}</Button></Link>
            </div>
          </div>
        </section>
        <BalanceCard />
      </div>

      {/* Trust strip */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
        {[[ShieldCheck, 'ui.why1t'], [BadgeCheck, 'ui.why2t'], [Gavel, 'ui.why3t'], [Globe2, 'ui.globalCommunity']].map(([Icon, k]) => {
          const I = Icon as typeof ShieldCheck;
          return <div key={k as string} className="flex items-center gap-3 bg-card px-5 py-4"><I size={26} className="shrink-0 text-primary" strokeWidth={1.6} /><span className="text-sm font-semibold leading-tight">{t(k as string)}</span></div>;
        })}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-6 border-b border-border">
            <span className="-mb-px border-b-2 border-primary pb-3 text-[15px] font-bold">{t('ui.p2pOffers')}</span>
            <Link href={L('/corridor')} className="pb-3 text-[15px] font-medium text-muted-foreground hover:text-foreground">{t('corridor.title')}</Link>
          </div>
          <Offers compact />
        </Card>
        <MarketDepth />
      </div>
    </div>
  );
}

function BalanceCard() {
  const { t, money, num } = useI18n();
  const { me, loading } = useSession();
  const L = useL();
  const [fiat, setFiat] = useDisplayFiat();
  const quotes = useQuotes(fiat);
  const [bal, setBal] = useState<Record<string, Record<string, string>> | null>(null);
  const [hide, setHide] = useState(false);
  const [fiats, setFiats] = useState<string[]>(['USD', 'EUR']);
  useEffect(() => { if (me) api('/me/balances').then(setBal).catch(() => setBal({})); }, [me]);
  useEffect(() => { api<Array<{ code: string }>>('/fiats').then((r) => r.length && setFiats(r.map((x) => x.code))).catch(() => {}); }, []);
  if (loading) return <Skeleton className="h-[300px] rounded-3xl" />;
  if (!me) return (
    <Card className="gold-glow relative flex flex-col justify-between overflow-hidden rounded-3xl p-6">
      <div className="pointer-events-none absolute -end-16 -top-16 h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
      <div className="relative">
        <div className="text-sm text-muted-foreground">{t('ui.totalBalance')}</div>
        <div className="mt-2 text-2xl font-bold leading-snug">{t('ui.ctaTitle')}</div>
        <p className="mt-2 text-sm text-muted-foreground">{t('ui.authSub')}</p>
      </div>
      <div className="relative mt-6 grid grid-cols-2 gap-2">
        <Link href={L('/signup')}><Button className="w-full">{t('ui.getStarted')}</Button></Link>
        <Link href={L('/login')}><Button variant="outline" className="w-full">{t('nav.login')}</Button></Link>
      </div>
    </Card>
  );
  const v = bal ? valuate(bal, quotes) : null;
  return (
    <Card className="gold-glow relative flex flex-col overflow-hidden rounded-3xl p-6" data-testid="balance-card">
      <div className="pointer-events-none absolute -bottom-20 -end-10 h-60 w-60 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{t('ui.totalBalance')}</span>
        <div className="flex items-center gap-1">
          <select aria-label={t('market.fiat')} value={fiat} onChange={(e) => setFiat(e.target.value)} className="rounded-md bg-transparent px-1 text-xs font-semibold text-muted-foreground focus:outline-none">{fiats.map((f) => <option key={f}>{f}</option>)}</select>
          <button onClick={() => setHide(!hide)} aria-label="toggle" className="rounded-md p-1 text-muted-foreground hover:text-foreground">{hide ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </div>
      </div>
      <div className="relative mt-3 min-h-[44px]">
        {v === null ? <Skeleton className="h-10 w-48" /> : <div className="num text-[38px] font-extrabold leading-none tracking-tight">{hide ? '••••••' : (v.total === '0.00' && !v.complete ? '—' : `≈ ${money(v.total, fiat)}`)}</div>}
      </div>
      <div className="relative mt-2 text-xs text-muted-foreground">{t('ui.indicativeNote')}{v && !v.complete ? ` · ${t('ui.partialValuation')}` : ''}</div>
      <div className="relative mt-4 space-y-2">
        {['USDT', 'BTC', 'ETH'].map((a) => (
          <div key={a} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><AssetIcon asset={a} size={20} />{a}</span><span className="num font-semibold">{hide ? '••••' : num(bal?.[a]?.available ?? '0', 8)}</span></div>
        ))}
      </div>
      <div className="relative mt-auto grid grid-cols-3 gap-2 pt-5">
        <Link href={L('/wallet?action=deposit')}><Button className="w-full px-2">{t('ui.deposit')}</Button></Link>
        <Link href={L('/wallet?action=withdraw')}><Button variant="soft" className="w-full px-2">{t('ui.withdraw')}</Button></Link>
        <Link href={L('/p2p')}><Button variant="soft" className="w-full px-2">{t('ui.trade')}</Button></Link>
      </div>
    </Card>
  );
}

/** Real data only: the best offers on the BTC book as a depth ladder (no synthetic price history). */
function MarketDepth() {
  const { t, money, num } = useI18n();
  const [fiat] = useDisplayFiat();
  const quotes = useQuotes(fiat);
  const [asset, setAsset] = useState('BTC');
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { let live = true; setRows(null); api<{ items: any[] }>(`/ads?side=buy&asset=${asset}&fiat=${fiat}&limit=8`).then((r) => live && setRows(r.items)).catch(() => live && setRows([])); return () => { live = false; }; }, [asset, fiat]);
  const max = rows?.reduce((m, r) => Math.max(m, Number(r.remainingAmount)), 0) || 1; // display-only bar width
  const q = quotes?.find((x) => x.asset === asset);
  return (
    <Card className="flex flex-col p-5 sm:p-6" data-testid="market-depth">
      <div className="flex items-center justify-between"><h2 className="text-[15px] font-bold">{t('ui.marketDepth')}</h2><span className="text-xs text-muted-foreground">{fiat}</span></div>
      <div className="mt-3 flex items-center gap-2"><AssetIcon asset={asset} size={26} /><span className="font-semibold">{asset}</span><span className="num ms-auto text-lg font-bold text-buy">{q?.price ? money(q.price, fiat) : '—'}</span></div>
      <div className="mt-4 flex-1 space-y-1.5">
        {rows === null && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-7" />)}
        {rows?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('market.empty')}</p>}
        {rows?.map((r) => (
          <div key={r.id} className="relative flex h-7 items-center justify-between overflow-hidden rounded-md px-2 text-xs">
            <span className="absolute inset-y-0 start-0 rounded-md bg-primary/15" style={{ width: `${Math.max(4, (Number(r.remainingAmount) / max) * 100)}%` }} />
            <span className="num relative font-semibold text-buy">{money(r.price, r.fiat)}</span>
            <span className="num relative text-muted-foreground">{num(r.remainingAmount, 6)} {asset}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-1 rounded-xl bg-muted p-1">
        {['BTC', 'ETH', 'USDT'].map((a) => <button key={a} onClick={() => setAsset(a)} className={cn('flex-1 rounded-lg py-1.5 text-xs font-bold', asset === a ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')}>{a}</button>)}
      </div>
    </Card>
  );
}
