'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Beaker, CreditCard, Eye, EyeOff, Plus, ShieldCheck } from 'lucide-react';
import { Alert, AmountField, AssetIcon, Badge, Button, Card, CopyButton, Dialog, Input, Label, LineTabs, PayChip, Select, Skeleton, cn } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { useSession } from '../../../lib/session';
import { api } from '../../../lib/api';
import { useL } from '../../../components/nav';
import { ErrorText } from '../../../components/errors';
import { useDisplayFiat, useQuotes, valuate } from '../../../lib/market';

type Bal = Record<string, Record<string, string>>;
/** Mirrors packages/shared ASSETS (networks per asset). */
const NETWORKS: Record<string, string[]> = { USDT: ['TRON', 'TON', 'BSC', 'ETHEREUM', 'POLYGON'], BTC: ['BITCOIN'], ETH: ['ETHEREUM'] };
const ASSET_LIST = Object.keys(NETWORKS);
const networks = (a: string) => NETWORKS[a] ?? [];

export default function Wallet() {
  const { t, num, money } = useI18n();
  const { me, refresh } = useSession();
  const L = useL();
  const [bal, setBal] = useState<Bal | null>(null);
  const [limits, setLimits] = useState<any>(null);
  const [testMode, setTestMode] = useState(false);
  const [hide, setHide] = useState(false);
  const [fiat] = useDisplayFiat();
  const quotes = useQuotes(fiat);
  const est = bal ? valuate(bal, quotes) : null;
  const [dlg, setDlg] = useState<null | { kind: 'deposit' | 'withdraw' | 'transfer'; asset: string }>(null);
  const [hist, setHist] = useState<'deposits' | 'withdrawals'>('deposits');
  const [rows, setRows] = useState<{ deposits: any[]; withdrawals: any[] }>({ deposits: [], withdrawals: [] });
  const [err, setErr] = useState<unknown>(null);
  const load = useCallback(async () => {
    const [b, l, d, w] = await Promise.all([api<Bal>('/me/balances').catch(() => ({})), api('/me/limits').catch(() => null), api<any[]>('/wallet/deposits').catch(() => []), api<any[]>('/wallet/withdrawals').catch(() => [])]);
    setBal(b); setLimits(l); setRows({ deposits: d, withdrawals: w });
  }, []);
  useEffect(() => { void load(); api('/status').then((s) => setTestMode(!!s.testMode)).catch(() => {}); }, [load]);
  useEffect(() => { // deep link from Home: /wallet?action=deposit|withdraw|transfer
    const a = new URLSearchParams(window.location.search).get('action');
    if (a === 'deposit' || a === 'withdraw' || a === 'transfer') setDlg({ kind: a, asset: 'USDT' });
  }, []);
  const run = async (f: () => Promise<unknown>) => { setErr(null); try { await f(); await load(); await refresh(); } catch (e) { setErr(e); } };
  const mask = (v: string) => (hide ? '••••' : v);
  const usedPct = limits && limits.daily && limits.daily !== '0' ? Math.min(100, Math.round((Number(limits.usedToday) / Number(limits.daily)) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Overview */}
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -end-24 -top-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">{t('ui.totalBalance')}<button aria-label="toggle" onClick={() => setHide(!hide)} className="hover:text-foreground">{hide ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
            <div className="num mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">{est ? mask(`≈ ${money(est.total, fiat)}`) : '—'}</div>
            <div className="mt-1 text-sm text-muted-foreground">{mask(num(bal?.USDT?.available ?? '0'))} USDT {t('wallet.available').toLowerCase()} · {t('ui.indicativeNote')}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDlg({ kind: 'deposit', asset: 'USDT' })} data-testid="open-deposit"><ArrowDownToLine size={16} />{t('ui.deposit')}</Button>
            <Button variant="soft" onClick={() => setDlg({ kind: 'withdraw', asset: 'USDT' })} data-testid="open-withdraw"><ArrowUpFromLine size={16} />{t('ui.withdraw')}</Button>
            <Button variant="outline" onClick={() => setDlg({ kind: 'transfer', asset: 'USDT' })} data-testid="open-transfer"><ArrowLeftRight size={16} />{t('ui.transfer')}</Button>
          </div>
        </div>
        {testMode && (
          <div className="relative mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-warn/40 bg-warn/5 px-4 py-3 text-sm">
            <Beaker size={16} className="text-warn" /><span className="flex-1 text-muted-foreground">{t('ui.testMode')}</span>
            <Button size="sm" variant="outline" data-testid="faucet" onClick={() => run(() => api('/dev/faucet', { body: { asset: 'USDT', amount: '1000' } }))}>{t('wallet.faucet')}</Button>
          </div>
        )}
      </Card>
      <ErrorText error={err} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Assets */}
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-4 border-b border-border px-5 py-3 text-xs font-medium text-muted-foreground sm:grid">
            <span>{t('market.asset')}</span><span>{t('wallet.available')}</span><span>{t('wallet.escrow')}</span><span>{t('wallet.hold')}</span><span className="w-[136px]" />
          </div>
          {bal === null ? <div className="space-y-2 p-4">{ASSET_LIST.map((a) => <Skeleton key={a} className="h-14" />)}</div> : ASSET_LIST.map((a) => {
            const k = bal[a] ?? {};
            return (
              <div key={a} data-testid={`bal-${a}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-b border-border px-5 py-4 last:border-0 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
                <div className="flex items-center gap-3"><AssetIcon asset={a} size={34} /><div><div className="font-semibold">{a}</div><div className="text-xs text-muted-foreground">{networks(a).length} {t('ui.network').toLowerCase()}</div></div></div>
                <div className="num text-end font-semibold sm:text-start"><span className="text-xs font-normal text-muted-foreground sm:hidden">{t('wallet.available')} </span><span data-testid={`avail-${a}`}>{hide ? '••••' : num(k.available ?? '0')}</span></div>
                <div className="num hidden text-muted-foreground sm:block">{mask(num(k.escrow ?? '0'))}</div>
                <div className="num hidden text-muted-foreground sm:block">{mask(num(k.hold ?? '0'))}</div>
                <div className="col-span-2 flex gap-1.5 sm:col-span-1">
                  <Button size="sm" variant="soft" onClick={() => setDlg({ kind: 'deposit', asset: a })}>{t('ui.deposit')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDlg({ kind: 'withdraw', asset: a })}>{t('ui.withdraw')}</Button>
                </div>
              </div>
            );
          })}
        </Card>

        {/* Limits + KYC */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between"><div className="font-semibold">{t('wallet.limits')}</div><Badge variant="info">{t('profile.tier', { tier: me?.kycTier ?? 0 })}</Badge></div>
            {limits ? <>
              <div className="mt-4 flex justify-between text-xs text-muted-foreground"><span>{t('wallet.usedToday')}</span><span className="num">{money(limits.usedToday, 'USD')} / {money(limits.daily, 'USD')}</span></div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${usedPct}%` }} /></div>
              <div className="mt-2 text-xs text-muted-foreground">{t('wallet.dailyLimit')}: <span className="num">{money(limits.daily, 'USD')}</span></div>
            </> : <Skeleton className="mt-4 h-10" />}
            <Link href={L('/account')}><Button variant="outline" size="sm" className="mt-4 w-full"><ShieldCheck size={15} />{t('ui.verifyNow')}</Button></Link>
          </Card>
          <a href="#payment-methods" className="block"><Card className="p-5 transition-colors hover:border-primary/40"><div className="flex items-center gap-2 font-semibold"><CreditCard size={17} className="text-primary" />{t('wallet.paymentMethods')}</div><p className="mt-1 text-xs text-muted-foreground">{t('ui.pmHint')}</p></Card></a>
        </div>
      </div>

      <PaymentMethods onError={setErr} />

      {/* History */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4"><div className="font-semibold">{t('ui.history')}</div></div>
        <div className="px-5"><LineTabs value={hist} onChange={setHist} options={[{ value: 'deposits', label: t('ui.deposit') }, { value: 'withdrawals', label: t('ui.withdraw') }]} /></div>
        <div className="divide-y divide-border">
          {rows[hist].length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">{t('ui.noData')}</div>}
          {rows[hist].map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <AssetIcon asset={r.asset} size={28} />
              <div className="min-w-0 flex-1"><div className="num font-medium">{hist === 'deposits' ? '+' : '−'}{num(r.amount)} {r.asset}</div><div className="truncate font-mono text-xs text-muted-foreground">{r.network} · {r.txHash ?? r.address}</div></div>
              <Badge variant={['credited', 'completed', 'broadcast'].includes(r.status) ? 'success' : ['rejected', 'failed'].includes(r.status) ? 'danger' : 'warning'}>{r.status}</Badge>
            </div>
          ))}
        </div>
      </Card>

      {dlg?.kind === 'deposit' && <DepositDialog asset={dlg.asset} testMode={testMode} onClose={() => { setDlg(null); void load(); }} />}
      {dlg?.kind === 'withdraw' && <WithdrawDialog asset={dlg.asset} available={bal?.[dlg.asset]?.available ?? '0'} onClose={() => { setDlg(null); void load(); }} />}
      {dlg?.kind === 'transfer' && <TransferDialog asset={dlg.asset} available={bal?.[dlg.asset]?.available ?? '0'} onClose={() => { setDlg(null); void load(); }} />}
    </div>
  );
}

function AssetNetwork({ asset, network, setAsset, setNetwork }: { asset: string; network: string; setAsset: (a: string) => void; setNetwork: (n: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <div><Label>{t('market.asset')}</Label>
        <div className="grid grid-cols-3 gap-2">{ASSET_LIST.map((a) => (
          <button key={a} type="button" onClick={() => { setAsset(a); setNetwork(networks(a)[0]); }} className={cn('flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors', asset === a ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40')}><AssetIcon asset={a} size={18} />{a}</button>
        ))}</div></div>
      <div><Label>{t('ui.network')}</Label>
        <div className="flex flex-wrap gap-2">{networks(asset).map((n) => (
          <button key={n} type="button" onClick={() => setNetwork(n)} className={cn('rounded-lg border px-3 py-1.5 text-xs font-semibold', network === n ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>{n}</button>
        ))}</div></div>
    </div>
  );
}

function DepositDialog({ asset: a0, testMode, onClose }: { asset: string; testMode: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [asset, setAsset] = useState(a0);
  const [network, setNetwork] = useState(networks(a0)[0]);
  const [addr, setAddr] = useState<any>(null);
  const [qr, setQr] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const [sim, setSim] = useState('');
  useEffect(() => {
    setAddr(null); setQr(''); setErr(null);
    api(`/wallet/deposit-address?asset=${asset}&network=${network}`).then(async (r) => { setAddr(r); setQr(await QRCode.toDataURL(r.address, { margin: 1, width: 360, color: { dark: '#0b0d12', light: '#ffffff' } })); }).catch(setErr);
  }, [asset, network]);
  return (
    <Dialog onClose={onClose} title={t('ui.deposit')} testId="deposit-dialog">
      <div className="space-y-4">
        <AssetNetwork asset={asset} network={network} setAsset={setAsset} setNetwork={setNetwork} />
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted/50 p-5">
          {qr ? <img src={qr} alt="QR" className="h-44 w-44 rounded-xl bg-white p-2" /> : <Skeleton className="h-44 w-44" />}
          <div className="w-full"><Label>{t('ui.address')}</Label>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"><span className="min-w-0 flex-1 break-all font-mono text-xs" data-testid="deposit-address">{addr?.address ?? '…'}</span>{addr && <CopyButton value={addr.address} />}</div>
            {addr?.memo && <div className="mt-2 flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-xs"><b>Memo</b><span className="flex-1 font-mono">{addr.memo}</span><CopyButton value={addr.memo} /></div>}
          </div>
        </div>
        <Alert variant="warning">{t('ui.depositNote', { asset, network })}</Alert>
        {testMode && addr && <div className="flex gap-2"><Input inputMode="decimal" placeholder="100" value={sim} onChange={(e) => setSim(e.target.value.replace(/[^\d.]/g, ''))} /><Button variant="outline" disabled={!sim} onClick={() => api('/dev/custody/deposit', { body: { asset, network, amount: sim } }).then(onClose, setErr)}><Beaker size={15} />{t('ui.simulate')}</Button></div>}
        <ErrorText error={err} />
      </div>
    </Dialog>
  );
}

function WithdrawDialog({ asset: a0, available, onClose }: { asset: string; available: string; onClose: () => void }) {
  const { t, num, date } = useI18n();
  const [asset, setAsset] = useState(a0);
  const [network, setNetwork] = useState(networks(a0)[0]);
  const [list, setList] = useState<any[]>([]);
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [totp, setTotp] = useState('');
  const [adding, setAdding] = useState(false);
  const [na, setNa] = useState({ address: '', label: '', totp: '' });
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState<any>(null);
  const reload = useCallback(() => api<any[]>('/wallet/addresses').then(setList).catch(() => {}), []);
  useEffect(() => { void reload(); }, [reload]);
  const mine = list.filter((x) => x.asset === asset && x.network === network);
  const ready = (x: any) => new Date(x.activeAt).getTime() <= Date.now();
  useEffect(() => { setAddress(mine.find(ready)?.address ?? ''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [asset, network, list.length]);
  if (done) return <Dialog onClose={onClose} title={t('ui.withdraw')}><div className="space-y-3 text-center"><Alert variant="success">{t('ui.withdrawSent')}</Alert><div className="num text-2xl font-bold">{num(done.amount)} {asset}</div><Badge variant="warning">{done.status}</Badge><Button className="w-full" onClick={onClose}>{t('common.back')}</Button></div></Dialog>;
  return (
    <Dialog onClose={onClose} title={t('ui.withdraw')} testId="withdraw-dialog">
      <div className="space-y-4">
        <AssetNetwork asset={asset} network={network} setAsset={setAsset} setNetwork={setNetwork} />
        <div><Label>{t('ui.address')}</Label>
          {mine.length > 0 && <div className="space-y-1.5">{mine.map((x) => (
            <button key={x.id} type="button" disabled={!ready(x)} onClick={() => setAddress(x.address)} className={cn('flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-start text-xs disabled:opacity-60', address === x.address ? 'border-primary bg-primary/10' : 'border-border')}>
              <div className="min-w-0 flex-1"><div className="font-semibold">{x.label || network}</div><div className="truncate font-mono text-muted-foreground">{x.address}</div></div>
              {!ready(x) && <Badge variant="warning">{date(x.activeAt)}</Badge>}
            </button>))}</div>}
          {!adding ? <Button type="button" variant="ghost" size="sm" className="mt-1.5" onClick={() => setAdding(true)}><Plus size={14} />{t('ui.addAddress')}</Button> : (
            <div className="mt-2 space-y-2 rounded-2xl border border-border p-3">
              <Input placeholder={t('ui.address')} value={na.address} onChange={(e) => setNa({ ...na, address: e.target.value.trim() })} className="font-mono text-xs" />
              <Input placeholder={t('ui.label')} value={na.label} onChange={(e) => setNa({ ...na, label: e.target.value })} />
              <div className="flex gap-2"><Input placeholder={t('order.totp')} inputMode="numeric" maxLength={6} value={na.totp} onChange={(e) => setNa({ ...na, totp: e.target.value.replace(/\D/g, '') })} />
                <Button onClick={async () => { setErr(null); try { await api('/wallet/addresses', { body: { asset, network, address: na.address, label: na.label || undefined, totp: na.totp } }); setAdding(false); setNa({ address: '', label: '', totp: '' }); await reload(); } catch (e) { setErr(e); } }}>{t('common.save')}</Button></div>
              <p className="text-[11px] text-muted-foreground">{t('ui.withdrawNote')}</p>
            </div>)}
        </div>
        <AmountField label={t('order.amount')} unit={<button type="button" className="text-primary" onClick={() => setAmount(available)}>MAX</button>} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} hint={<>{t('wallet.available')}: <span className="num">{num(available)} {asset}</span></>} />
        <div><Label>{t('order.totp')}</Label><Input inputMode="numeric" maxLength={6} className="font-mono tracking-[0.3em]" value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} /></div>
        <ErrorText error={err} />
        <Button className="w-full" size="lg" disabled={!address || !amount || totp.length !== 6} onClick={async () => { setErr(null); try { setDone(await api('/wallet/withdrawals', { body: { asset, network, address, amount, totp } })); } catch (e) { setErr(e); } }}>{t('ui.withdraw')}</Button>
      </div>
    </Dialog>
  );
}

function TransferDialog({ asset: a0, available, onClose }: { asset: string; available: string; onClose: () => void }) {
  const { t, num } = useI18n();
  const [asset, setAsset] = useState(a0);
  const [f, setF] = useState({ toUserId: '', amount: '', totp: '' });
  const [err, setErr] = useState<unknown>(null);
  const [ok, setOk] = useState(false);
  return (
    <Dialog onClose={onClose} title={t('ui.transfer')} testId="transfer-dialog">
      {ok ? <div className="space-y-3"><Alert variant="success">{t('ui.transferDone')}</Alert><Button className="w-full" onClick={onClose}>{t('common.back')}</Button></div> : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('ui.transferHint')}</p>
          <div><Label>{t('market.asset')}</Label><Select value={asset} onChange={(e) => setAsset(e.target.value)}>{ASSET_LIST.map((a) => <option key={a}>{a}</option>)}</Select></div>
          <div><Label>{t('ui.recipientId')}</Label><Input className="font-mono text-xs" value={f.toUserId} onChange={(e) => setF({ ...f, toUserId: e.target.value.trim() })} placeholder="xxxxxxxx-xxxx-…" /></div>
          <AmountField label={t('order.amount')} unit={asset} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') })} hint={<>{t('wallet.available')}: <span className="num">{num(available)}</span></>} />
          <div><Label>{t('order.totp')}</Label><Input inputMode="numeric" maxLength={6} className="font-mono tracking-[0.3em]" value={f.totp} onChange={(e) => setF({ ...f, totp: e.target.value.replace(/\D/g, '') })} /></div>
          <ErrorText error={err} />
          <Button className="w-full" size="lg" disabled={!f.toUserId || !f.amount || f.totp.length !== 6} onClick={async () => { setErr(null); try { await api('/wallet/transfers', { body: { asset, ...f } }); setOk(true); } catch (e) { setErr(e); } }}>{t('ui.transfer')}</Button>
        </div>)}
    </Dialog>
  );
}

function PaymentMethods({ onError }: { onError: (e: unknown) => void }) {
  const { t } = useI18n();
  const [pms, setPms] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [pm, setPm] = useState<{ type: string; holderName: string; details: Record<string, string> }>({ type: '', holderName: '', details: {} });
  const load = useCallback(() => api<any[]>('/payment-methods').then(setPms).catch(() => {}), []);
  useEffect(() => { void load(); api<any[]>('/payment-method-types').then(setTypes).catch(() => {}); }, [load]);
  const type = types.find((x) => x.code === pm.type);
  return (
    <Card className="p-5 sm:p-6" id="payment-methods">
      <div className="mb-4 flex items-center justify-between"><div className="text-lg font-semibold">{t('wallet.paymentMethods')}</div></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pms.map((p) => (
          <div key={p.id} className="rounded-2xl border border-border bg-gradient-to-br from-muted/80 to-card p-4">
            <div className="flex items-center justify-between"><PayChip code={p.type} /><CreditCard size={16} className="text-muted-foreground" /></div>
            <div className="mt-3 text-sm font-semibold">{p.type} · {p.holderName}</div>
            <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{Object.values(p.details ?? {}).join(' ')}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-2xl border border-dashed border-border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plus size={15} />{t('wallet.addMethod')}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label>{t('wallet.type')}</Label><Select data-testid="pm-type" value={pm.type} onChange={(e) => setPm({ ...pm, type: e.target.value, details: {} })}><option value="" />{types.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</Select></div>
          <div><Label>{t('wallet.holderName')}</Label><Input data-testid="pm-holder" value={pm.holderName} onChange={(e) => setPm({ ...pm, holderName: e.target.value })} /></div>
          {(type?.fieldsSchema ?? []).map((f: any) => <div key={f.name}><Label>{f.name}</Label><Input data-testid={`pm-field-${f.name}`} value={pm.details[f.name] ?? ''} onChange={(e) => setPm({ ...pm, details: { ...pm.details, [f.name]: e.target.value } })} /></div>)}
        </div>
        <Button className="mt-3" size="sm" data-testid="pm-add" disabled={!pm.type || !pm.holderName} onClick={async () => { onError(null); try { await api('/payment-methods', { body: { ...pm, details: Object.fromEntries(Object.entries(pm.details).filter(([, v]) => v)) } }); setPm({ type: '', holderName: '', details: {} }); await load(); } catch (e) { onError(e); } }}>{t('wallet.addMethod')}</Button>
      </div>
    </Card>
  );
}
