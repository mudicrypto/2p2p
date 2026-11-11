'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { BadgeCheck, Check, Fingerprint, KeyRound, Lock, Mail, Phone, ShieldCheck, Smartphone, Store, UserRound } from 'lucide-react';
import { Alert, Avatar, Badge, Button, Card, CopyButton, Input, Label, cn } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { useSession } from '../../../lib/session';
import { api } from '../../../lib/api';
import { useL } from '../../../components/nav';
import { ErrorText } from '../../../components/errors';

export default function Account() {
  const { t } = useI18n();
  const { me, refresh } = useSession();
  const L = useL();
  const [kyc, setKyc] = useState<any>(null);
  const [testMode, setTestMode] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [totp, setTotp] = useState<{ secret?: string; qr?: string; code: string }>({ code: '' });
  const [phone, setPhone] = useState({ phone: '', code: '', sent: false, dev: '' });
  const [pw, setPw] = useState({ oldPassword: '', newPassword: '', totp: '', ok: false });
  const [merchant, setMerchant] = useState<any>(null);
  const load = useCallback(async () => {
    setKyc(await api('/kyc/status').catch(() => null));
    setMerchant(await api('/merchant-program/status').catch(() => null));
  }, []);
  useEffect(() => { void load(); api('/status').then((s) => setTestMode(!!s.testMode)).catch(() => {}); }, [load]);
  const run = async (f: () => Promise<unknown>) => { setErr(null); try { await f(); await load(); await refresh(); } catch (e) { setErr(e); } };
  if (!me) return <div className="mx-auto max-w-md py-20 text-center"><Link href={L('/login')}><Button>{t('nav.login')}</Button></Link></div>;
  const tier = me.kycTier ?? 0;
  const pending = kyc?.applications?.find((a: any) => a.status === 'pending');
  const startKyc = (level: number) => run(async () => {
    const s = await api('/kyc/start', { body: { level } });
    if (testMode) await api('/dev/kyc/approve', { body: { providerRef: s.providerRef, fullName: 'Test User', status: 'approved' } }).catch(() => {});
    else if (s.url) window.open(s.url, '_blank', 'noopener');
  });
  const name = me.displayName ?? me.email ?? me.id.slice(0, 8);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -start-20 -top-24 h-64 w-64 rounded-full bg-primary-2/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5">
          <Avatar name={name} seed={me.id} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-bold tracking-tight">{name}</h1>{tier > 0 && <BadgeCheck size={20} className="text-primary" />}</div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {me.email && me.displayName && <span className="flex items-center gap-1"><Mail size={13} />{me.email}</span>}
              <span className="flex items-center gap-1 font-mono text-xs">{t('ui.userId')}: {me.id.slice(0, 8)}…<CopyButton value={me.id} /></span>
            </div>
          </div>
          <Link href={L(`/profile/${me.id}`)}><Button variant="outline"><UserRound size={16} />{t('profile.title')}</Button></Link>
        </div>
      </Card>
      <ErrorText error={err} />

      {/* Verification */}
      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{t('ui.verification')}</h2><span className="text-sm text-muted-foreground">KYC: tier <b data-testid="tier" className="text-foreground">{tier}</b></span></div>
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((lvl) => {
            const done = tier >= lvl; const next = tier + 1 === lvl;
            return (
              <Card key={lvl} className={cn('relative p-5', next && 'border-primary/60 shadow-[0_0_0_1px_var(--color-primary)]')}>
                <div className="flex items-center justify-between"><Badge variant={done ? 'success' : next ? 'info' : 'outline'}>{t('ui.level', { n: lvl })}</Badge>{done && <Check size={18} className="text-buy" />}</div>
                <div className="mt-3 font-semibold">{t(`ui.level${lvl}`)}</div>
                <p className="mt-1 text-xs text-muted-foreground">{t(`ui.level${lvl}d`)}</p>
                {next && (pending ? <Badge variant="warning" className="mt-4">{t('ui.pending')}</Badge> :
                  <Button size="sm" className="mt-4 w-full" data-testid="kyc-start" onClick={() => startKyc(lvl)}>{t('ui.verifyNow')}</Button>)}
                {done && <div className="mt-4 text-xs font-medium text-buy">{tier === lvl ? t('ui.current') : '✓'}</div>}
              </Card>
            );
          })}
        </div>
      </section>

      {/* Security */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('ui.security')}</h2>
        <Card className="divide-y divide-border">
          <Row icon={<Smartphone size={18} />} title={t('ui.twoFa')} desc={t('ui.twoFaDesc')}>
            {me.totpEnabled ? <Alert variant="success" className="py-2">{t('auth.enabled')}</Alert> : totp.secret ? (
              <div className="w-full space-y-2 sm:w-80">
                <p className="text-xs text-muted-foreground">{t('auth.scan')}</p>
                {totp.qr && <img src={totp.qr} alt="2FA QR" className="h-40 w-40 rounded-xl bg-white p-2" data-testid="totp-qr" />}
                <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2"><code className="min-w-0 flex-1 break-all text-xs" data-testid="totp-secret">{totp.secret}</code><CopyButton value={totp.secret} /></div>
                <div className="flex gap-2"><Input data-testid="totp-code" inputMode="numeric" maxLength={6} value={totp.code} onChange={(e) => setTotp({ ...totp, code: e.target.value })} placeholder="123456" className="font-mono" />
                  <Button data-testid="totp-enable" onClick={() => run(() => api('/auth/2fa/confirm', { body: { code: totp.code } }))}>{t('auth.enable')}</Button></div>
              </div>
            ) : <Button size="sm" data-testid="totp-setup" onClick={() => run(async () => { const r = await api('/auth/2fa/setup', { body: {} }); setTotp({ secret: r.secret, qr: await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 220 }), code: '' }); })}>{t('auth.setup2fa')}</Button>}
          </Row>
          <Row icon={<Phone size={18} />} title={t('auth.phone')} desc={t('ui.phoneDesc')}>
            {me.phoneVerified ? <Badge variant="success">{t('auth.verifyPhone')} ✓</Badge> : (
              <div className="flex w-full flex-col gap-2 sm:w-80">
                <div className="flex gap-2"><Input type="tel" placeholder="+49…" value={phone.phone} onChange={(e) => setPhone({ ...phone, phone: e.target.value })} />
                  <Button variant="outline" onClick={() => run(async () => { const r = await api('/auth/phone/start', { body: { phone: phone.phone } }); setPhone((p) => ({ ...p, sent: true, dev: r.devCode ?? '' })); })}>{t('auth.sendCode')}</Button></div>
                {phone.sent && <div className="flex gap-2"><Input inputMode="numeric" maxLength={6} placeholder={phone.dev || t('auth.code')} value={phone.code} onChange={(e) => setPhone({ ...phone, code: e.target.value })} />
                  <Button onClick={() => run(() => api('/auth/phone/verify', { body: { phone: phone.phone, code: phone.code } }))}>{t('auth.verifyPhone')}</Button></div>}
              </div>)}
          </Row>
          <Row icon={<Lock size={18} />} title={t('auth.password')} desc={t('ui.passwordDesc')}>
            <div className="flex w-full flex-col gap-2 sm:w-80">
              <Input type="password" autoComplete="current-password" placeholder={t('ui.currentPassword')} value={pw.oldPassword} onChange={(e) => setPw({ ...pw, oldPassword: e.target.value, ok: false })} />
              <Input type="password" autoComplete="new-password" placeholder={t('ui.newPassword')} minLength={10} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value, ok: false })} />
              {me.totpEnabled && <Input inputMode="numeric" maxLength={6} placeholder={t('auth.totp')} value={pw.totp} onChange={(e) => setPw({ ...pw, totp: e.target.value })} />}
              <Button variant="outline" disabled={pw.newPassword.length < 10 || !pw.oldPassword} onClick={() => run(async () => { await api('/auth/password', { body: { oldPassword: pw.oldPassword, newPassword: pw.newPassword, totp: pw.totp || undefined } }); setPw({ oldPassword: '', newPassword: '', totp: '', ok: true }); })}>{pw.ok ? <><Check size={15} />{t('ui.changed')}</> : t('common.save')}</Button>
            </div>
          </Row>
          <Row icon={<Fingerprint size={18} />} title={t('ui.passkeys')} desc={t('ui.why4d')}><KeyRound size={18} className="text-muted-foreground" /></Row>
        </Card>
      </section>

      {/* Merchant */}
      <Card className="relative overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/15 via-transparent to-primary-2/10" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-primary-foreground"><Store size={22} /></div>
          <div className="min-w-0 flex-1"><div className="font-semibold">{t('ui.merchantTitle')}</div><p className="text-sm text-muted-foreground">{t('ui.merchantDesc')}</p></div>
          {merchant && merchant.status !== 'none' ? <Badge variant={merchant.verifiedBadge ? 'success' : 'warning'}>{merchant.status}</Badge>
            : <Button disabled={tier < 2} onClick={() => run(() => api('/merchant-program/apply', { body: { businessName: name, country: me.country, expectedMonthlyVolumeUsd: 100000 } }))}><ShieldCheck size={16} />{t('ui.apply')}</Button>}
        </div>
      </Card>
    </div>
  );
}

function Row({ icon, title, desc, children }: { icon: React.ReactNode; title: React.ReactNode; desc: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">{icon}</div>
        <div className="min-w-0"><div className="font-semibold">{title}</div><p className="text-xs text-muted-foreground">{desc}</p></div>
      </div>
      <div className="flex shrink-0 justify-start sm:justify-end">{children}</div>
    </div>
  );
}
