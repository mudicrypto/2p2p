'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownUp, BadgeCheck, Clock, ShieldCheck, ThumbsUp } from 'lucide-react';
import { AmountField, AssetIcon, Avatar, Button, Dialog, Label, PayChip, Select } from '@p2p/ui';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/session';
import { api } from '../lib/api';
import { useL } from './nav';
import { ErrorText } from './errors';

/** Decimal string helpers without floats: scale to bigint, divide, format back. */
const DEC = 8n;
const toScaled = (v: string, d = DEC) => { const [i, f = ''] = v.split('.'); return BigInt(i || '0') * 10n ** d + BigInt((f + '0'.repeat(Number(d))).slice(0, Number(d)) || '0'); };
const fromScaled = (v: bigint, d = DEC, keep = 6) => { const s = v.toString().padStart(Number(d) + 1, '0'); const i = s.slice(0, -Number(d)); const f = s.slice(-Number(d)).slice(0, keep).replace(/0+$/, ''); return f ? `${i}.${f}` : i; };
export function cryptoFor(fiat: string, price: string) {
  if (!fiat || !price || toScaled(price) === 0n) return '';
  return fromScaled((toScaled(fiat) * 10n ** DEC) / toScaled(price));
}
export function fiatFor(crypto: string, price: string) {
  if (!crypto || !price) return '';
  return fromScaled((toScaled(crypto) * toScaled(price)) / 10n ** DEC, DEC, 2);
}

export function TradeDialog({ ad, side, onClose }: { ad: any; side: 'buy' | 'sell'; onClose: () => void }) {
  const { t, money, pct } = useI18n();
  const { me } = useSession();
  const L = useL();
  const router = useRouter();
  const [fiatAmount, setFiatAmount] = useState('');
  const [cryptoAmount, setCryptoAmount] = useState('');
  const [pm, setPm] = useState('');
  const [mine, setMine] = useState<any[]>([]);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!me) router.push(L('/login')); }, [me, router, L]);
  useEffect(() => { if (side === 'sell' && me) api<any[]>('/payment-methods').then((m) => { const ok = m.filter((x) => ad.paymentTypes.includes(x.type)); setMine(ok); setPm(ok[0]?.id ?? ''); }).catch(() => {}); }, [side, me, ad]);
  const outOfRange = useMemo(() => {
    if (!fiatAmount) return false;
    const v = toScaled(fiatAmount);
    return v < toScaled(ad.minAmount) || v > toScaled(ad.maxAmount);
  }, [fiatAmount, ad]);
  if (!me) return null;
  const onFiat = (v: string) => { const x = v.replace(/[^\d.]/g, ''); setFiatAmount(x); setCryptoAmount(cryptoFor(x, ad.price)); };
  const onCrypto = (v: string) => { const x = v.replace(/[^\d.]/g, ''); setCryptoAmount(x); setFiatAmount(fiatFor(x, ad.price)); };
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const o = await api('/orders', { body: { adId: ad.id, fiatAmount, paymentMethodId: side === 'sell' ? pm : undefined } });
      router.push(L(`/orders/${o.id}`));
    } catch (e) { setErr(e); setBusy(false); }
  };
  const fiatField = <AmountField key="f" id="fiatAmount" data-testid="trade-amount" label={side === 'buy' ? t('trade.youPay') : t('trade.youReceive')} unit={ad.fiat} value={fiatAmount} onChange={(e) => onFiat(e.target.value)} placeholder={`${ad.minAmount} – ${ad.maxAmount}`} hint={<span className={outOfRange ? 'text-sell' : ''}>{t('market.limits')}: {money(ad.minAmount, ad.fiat)} – {money(ad.maxAmount, ad.fiat)}</span>} />;
  const cryptoField = <AmountField key="c" id="cryptoAmount" label={side === 'buy' ? t('trade.youReceive') : t('trade.youSell')} unit={<span className="flex items-center gap-1.5"><AssetIcon asset={ad.asset} size={16} />{ad.asset}</span>} value={cryptoAmount} onChange={(e) => onCrypto(e.target.value)} placeholder="0.00" />;
  return (
    <Dialog onClose={onClose} title={t(side === 'buy' ? 'market.buyAction' : 'market.sellAction', { asset: ad.asset })} testId="trade-dialog" className="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3">
          <Avatar name={ad.advertiser.displayName} seed={ad.advertiser.id} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 font-semibold">{ad.advertiser.displayName}{ad.advertiser.verifiedBadge && <BadgeCheck size={15} className="text-primary" />}</div>
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span>{t('market.trades', { count: ad.advertiser.trades30d })}</span>
              <span className="flex items-center gap-1"><ThumbsUp size={11} />{pct(ad.advertiser.completionRateBps)}</span>
              <span className="flex items-center gap-1"><Clock size={11} />{t('common.minutes', { n: ad.paymentWindowMin })}</span>
            </div>
          </div>
          <div className="text-end"><div className="text-xs text-muted-foreground">{t('market.price')}</div><div className="num text-lg font-bold" data-testid="trade-price">{money(ad.price, ad.fiat)}</div></div>
        </div>
        <div className="relative space-y-2">
          {fiatField}
          <div className="pointer-events-none absolute start-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-card p-1.5 text-muted-foreground rtl:translate-x-1/2"><ArrowDownUp size={14} /></div>
          {cryptoField}
        </div>
        {side === 'sell' && (
          <div><Label>{t('trade.receivingAccount')}</Label>
            <Select value={pm} onChange={(e) => setPm(e.target.value)}>{mine.map((m) => <option key={m.id} value={m.id}>{m.type} · {m.holderName}</option>)}</Select></div>
        )}
        <div className="flex flex-wrap gap-1.5">{ad.paymentTypes.map((p: string) => <PayChip key={p} code={p} />)}</div>
        {ad.terms && <div className="rounded-xl border border-border p-3 text-xs leading-relaxed text-muted-foreground"><div className="mb-1 font-semibold text-foreground">{t('trade.terms')}</div>{ad.terms}</div>}
        <div className="flex items-start gap-2 rounded-xl bg-primary/10 p-3 text-xs text-foreground/90"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />{t('ui.how1d')} {t('trade.window', { minutes: ad.paymentWindowMin })}</div>
        <ErrorText error={err} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">{t('common.cancel')}</Button>
          <Button variant={side === 'buy' ? 'buy' : 'sell'} loading={busy} disabled={busy || !fiatAmount || outOfRange || (side === 'sell' && !pm)} onClick={submit} className="flex-[2]" data-testid="place-order">{t('trade.confirm')}</Button>
        </div>
      </div>
    </Dialog>
  );
}
