'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from '@p2p/ui';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/session';
import { api } from '../lib/api';
import { useL } from './nav';
import { ErrorText } from './errors';

export function TradeDialog({ ad, side, onClose }: { ad: any; side: 'buy' | 'sell'; onClose: () => void }) {
  const { t, money } = useI18n();
  const { me } = useSession();
  const L = useL();
  const router = useRouter();
  const [fiatAmount, setFiatAmount] = useState('');
  const [pm, setPm] = useState('');
  const [mine, setMine] = useState<any[]>([]);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (side === 'sell' && me) api<any[]>('/payment-methods').then((m) => { const ok = m.filter((x) => ad.paymentTypes.includes(x.type)); setMine(ok); setPm(ok[0]?.id ?? ''); }); }, [side, me, ad]);
  if (!me) { router.push(L('/login')); return null; }
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const o = await api('/orders', { body: { adId: ad.id, fiatAmount, paymentMethodId: side === 'sell' ? pm : undefined } });
      router.push(L(`/orders/${o.id}`));
    } catch (e) { setErr(e); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" onClick={onClose}>
      <Card className="w-full max-w-md rounded-b-none sm:rounded-lg" onClick={(e) => e.stopPropagation()}>
        <CardHeader><CardTitle>{t(side === 'buy' ? 'market.buyAction' : 'market.sellAction', { asset: ad.asset })} · {money(ad.price, ad.fiat)}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="fiatAmount">{side === 'buy' ? t('trade.youPay') : t('trade.youReceive')} ({ad.fiat})</Label>
            <Input id="fiatAmount" data-testid="trade-amount" inputMode="decimal" value={fiatAmount} onChange={(e) => setFiatAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder={`${ad.minAmount} – ${ad.maxAmount}`} />
          </div>
          {side === 'sell' && (
            <div className="space-y-1"><Label>{t('trade.receivingAccount')}</Label>
              <Select value={pm} onChange={(e) => setPm(e.target.value)}>{mine.map((m) => <option key={m.id} value={m.id}>{m.type} · {m.holderName}</option>)}</Select></div>
          )}
          <p className="text-xs text-muted-foreground">{t('trade.window', { minutes: ad.paymentWindowMin })}</p>
          {ad.terms && <div className="rounded bg-muted p-2 text-xs"><b>{t('trade.terms')}:</b> {ad.terms}</div>}
          <ErrorText error={err} />
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">{t('common.cancel')}</Button>
            <Button variant={side === 'buy' ? 'buy' : 'sell'} disabled={busy || !fiatAmount} onClick={submit} className="flex-1" data-testid="place-order">{t('trade.confirm')}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
