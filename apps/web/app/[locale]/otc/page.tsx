'use client';
/** Large trade desk: a request form; the desk follows up by email. Requests are reviewed by staff in the admin panel. */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, Send } from 'lucide-react';
import { Badge, Button, Card, Input, Label, Select, Tabs, Textarea } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { useSession } from '../../../lib/session';
import { api } from '../../../lib/api';
import { useL } from '../../../components/nav';
import { ErrorText } from '../../../components/errors';

export default function Otc() {
  const { t, money, date } = useI18n();
  const { me } = useSession();
  const L = useL();
  const [f, setF] = useState({ side: 'buy' as 'buy' | 'sell', asset: 'USDT', fiat: 'USD', fiatAmount: '', note: '' });
  const [fiats, setFiats] = useState<string[]>(['USD', 'EUR']);
  const [mine, setMine] = useState<any[]>([]);
  const [err, setErr] = useState<unknown>(null);
  const [sent, setSent] = useState(false);
  const load = useCallback(() => api<any[]>('/me/otc-requests').then(setMine).catch(() => {}), []);
  useEffect(() => { api<Array<{ code: string }>>('/fiats').then((r) => r.length && setFiats(r.map((x) => x.code))).catch(() => {}); if (me) void load(); }, [me, load]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setSent(false);
    try { await api('/otc-requests', { body: { ...f, note: f.note.trim() || undefined } }); setSent(true); setF({ ...f, fiatAmount: '', note: '' }); await load(); } catch (e) { setErr(e); }
  };
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card className="relative overflow-hidden p-8">
        <div className="hero-glow absolute inset-0" />
        <div className="relative flex items-center gap-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand text-primary-foreground"><Briefcase size={26} /></span>
          <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('ui.otcTitle')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('ui.otcDesc')}</p></div></div>
      </Card>
      {!me ? <Card className="p-8 text-center"><Link href={L('/login')}><Button>{t('nav.login')}</Button></Link></Card> : (
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <Tabs value={f.side} onChange={(v) => setF({ ...f, side: v })} options={[{ value: 'buy', label: t('market.buy') }, { value: 'sell', label: t('market.sell') }]} className="w-full" />
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="otc-asset">{t('market.asset')}</Label><Select id="otc-asset" value={f.asset} onChange={(e) => setF({ ...f, asset: e.target.value })}>{['USDT', 'BTC', 'ETH'].map((x) => <option key={x}>{x}</option>)}</Select></div>
              <div><Label htmlFor="otc-fiat">{t('market.fiat')}</Label><Select id="otc-fiat" value={f.fiat} onChange={(e) => setF({ ...f, fiat: e.target.value })}>{fiats.map((x) => <option key={x}>{x}</option>)}</Select></div>
            </div>
            <div><Label htmlFor="otc-amount">{t('ui.otcAmount', { fiat: f.fiat })}</Label><Input id="otc-amount" inputMode="decimal" className="num h-12 text-lg font-semibold" data-testid="otc-amount" value={f.fiatAmount} onChange={(e) => setF({ ...f, fiatAmount: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') })} required /></div>
            <div><Label htmlFor="otc-note">{t('ui.otcNote')}</Label><Textarea id="otc-note" rows={3} maxLength={1000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
            <ErrorText error={err} />
            {sent && <p className="rounded-xl bg-buy/10 p-3 text-sm text-buy" data-testid="otc-sent">{t('ui.otcSent')}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={!f.fiatAmount} data-testid="otc-submit"><Send size={16} />{t('ui.otcSubmit')}</Button>
          </form>
        </Card>)}
      {mine.length > 0 && (
        <Card className="p-6"><div className="mb-2 font-semibold">{t('ui.otcMine')}</div>
          <ul className="divide-y divide-border" data-testid="otc-mine">{mine.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-3 text-sm">
              <span className="flex-1">{t(r.side === 'buy' ? 'market.buy' : 'market.sell')} {r.asset} · <span className="num">{money(r.fiatAmount, r.fiat)}</span></span>
              <span className="text-xs text-muted-foreground">{date(r.createdAt)}</span>
              <Badge variant={r.status === 'open' ? 'warning' : r.status === 'contacted' ? 'success' : 'outline'}>{t(`ui.otc_${r.status}`)}</Badge>
            </li>))}</ul>
        </Card>)}
    </div>
  );
}
