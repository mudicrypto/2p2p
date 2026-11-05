'use client';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from '@p2p/ui';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { ErrorText } from '@/components/errors';

export default function Wallet() {
  const { t, num, money } = useI18n();
  const { me, refresh } = useSession();
  const [bal, setBal] = useState<Record<string, Record<string, string>>>({});
  const [limits, setLimits] = useState<any>(null);
  const [pms, setPms] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [pm, setPm] = useState<{ type: string; holderName: string; details: Record<string, string> }>({ type: '', holderName: '', details: {} });
  const [totp, setTotp] = useState<{ secret?: string; code: string }>({ code: '' });
  const [kyc, setKyc] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  const load = useCallback(async () => {
    setBal(await api('/me/balances').catch(() => ({})));
    setLimits(await api('/me/limits').catch(() => null));
    setPms(await api('/payment-methods').catch(() => []));
    setKyc(await api('/kyc/status').catch(() => null));
  }, []);
  useEffect(() => { void load(); api<any[]>(`/payment-method-types`).then(setTypes).catch(() => {}); }, [load]);
  const type = types.find((x) => x.code === pm.type);
  const run = async (f: () => Promise<unknown>) => { setErr(null); try { await f(); await load(); await refresh(); } catch (e) { setErr(e); } };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>{t('wallet.title')}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        {Object.entries(bal).map(([a, k]) => <div key={a} className="flex justify-between" data-testid={`bal-${a}`}><b>{a}</b><span>{t('wallet.available')}: <span data-testid={`avail-${a}`}>{num(k.available ?? '0')}</span> · {t('wallet.escrow')}: {num(k.escrow ?? '0')}{k.hold && k.hold !== '0' ? ` · ${t('wallet.hold')}: ${num(k.hold)}` : ''}</span></div>)}
        <Button size="sm" variant="outline" data-testid="faucet" onClick={() => run(() => api('/dev/faucet', { body: { asset: 'USDT', amount: '1000' } }))}>{t('wallet.faucet')}</Button>
        {limits && <div className="pt-2 text-xs text-muted-foreground">{t('wallet.dailyLimit')}: {money(limits.daily, 'USD')} · {t('wallet.usedToday')}: {money(limits.usedToday, 'USD')}</div>}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>{t('nav.security')}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
        <div>KYC: tier <b data-testid="tier">{me?.kycTier}</b>{kyc?.applications?.[0] && <> · {kyc.applications[0].status}</>}</div>
        <Button size="sm" variant="outline" data-testid="kyc-start" onClick={() => run(async () => {
          const s = await api('/kyc/start', { body: { level: (me?.kycTier ?? 0) + 1 } });
          await api('/dev/kyc/approve', { body: { providerRef: s.providerRef, fullName: 'Test User', status: 'approved' } }).catch(() => {});
        })}>Verify level {(me?.kycTier ?? 0) + 1}</Button>
        {me?.totpEnabled ? <Alert variant="success">{t('auth.enabled')}</Alert> : totp.secret ? <>
          <p>{t('auth.scan')}</p><code className="block break-all rounded bg-muted p-2" data-testid="totp-secret">{totp.secret}</code>
          <div className="flex gap-2"><Input data-testid="totp-code" value={totp.code} onChange={(e) => setTotp({ ...totp, code: e.target.value })} placeholder="123456" />
            <Button data-testid="totp-enable" onClick={() => run(() => api('/auth/2fa/confirm', { body: { code: totp.code } }))}>{t('auth.enable')}</Button></div>
        </> : <Button size="sm" data-testid="totp-setup" onClick={() => run(async () => setTotp({ secret: (await api('/auth/2fa/setup', { body: {} })).secret, code: '' }))}>{t('auth.setup2fa')}</Button>}
      </CardContent></Card>

      <Card className="md:col-span-2"><CardHeader><CardTitle>{t('wallet.paymentMethods')}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
        {pms.map((p) => <div key={p.id} className="rounded bg-muted p-2">{p.type} · {p.holderName} · {Object.values(p.details ?? {}).join(' ')}</div>)}
        <div className="grid gap-2 sm:grid-cols-3">
          <div><Label>{t('wallet.type')}</Label><Select data-testid="pm-type" value={pm.type} onChange={(e) => setPm({ ...pm, type: e.target.value, details: {} })}><option value="" />{types.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</Select></div>
          <div><Label>{t('wallet.holderName')}</Label><Input data-testid="pm-holder" value={pm.holderName} onChange={(e) => setPm({ ...pm, holderName: e.target.value })} /></div>
          {(type?.fieldsSchema ?? []).map((f: any) => <div key={f.name}><Label>{f.name}</Label><Input data-testid={`pm-field-${f.name}`} value={pm.details[f.name] ?? ''} onChange={(e) => setPm({ ...pm, details: { ...pm.details, [f.name]: e.target.value } })} /></div>)}
        </div>
        <Button size="sm" data-testid="pm-add" disabled={!pm.type} onClick={() => run(() => api('/payment-methods', { body: { ...pm, details: Object.fromEntries(Object.entries(pm.details).filter(([, v]) => v)) } }))}>{t('wallet.addMethod')}</Button>
        <ErrorText error={err} />
      </CardContent></Card>
    </div>
  );
}
