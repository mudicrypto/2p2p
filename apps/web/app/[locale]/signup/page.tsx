'use client';
import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { Button, Input, Label } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';
import { useL } from '../../../components/nav';
import { ErrorText } from '../../../components/errors';
import { AuthShell } from '../../../components/auth-shell';

export default function Signup() {
  const { t, locale } = useI18n();
  const L = useL();
  const [f, setF] = useState({ email: '', password: '', country: 'DE' });
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { const r = await api('/auth/signup', { body: { ...f, country: f.country.toUpperCase(), locale } }); setDone(r.devEmailToken ?? ''); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const strength = Math.min(4, [/.{10,}/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(f.password)).length + (f.password.length >= 16 ? 1 : 0));
  if (done !== null) return (
    <AuthShell title={t('auth.verifyEmail')} step={1}>
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary"><MailCheck size={30} /></div>
        <p className="text-sm text-muted-foreground">{t('auth.checkEmail')}</p>
        {done && <Link data-testid="dev-verify-link" className="inline-block text-sm font-medium text-primary hover:underline" href={L(`/verify-email?token=${encodeURIComponent(done)}`)}>{t('auth.verifyEmail')} (dev)</Link>}
      </div>
    </AuthShell>
  );
  return (
    <AuthShell footer={<>{t('auth.haveAccount')} <Link className="font-semibold underline underline-offset-4" href={L('/login')}>{t('nav.login')}</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <div><Label htmlFor="email">{t('auth.email')}</Label><Input id="email" type="email" className="h-12" placeholder="you@example.com" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
        <div><Label htmlFor="password">{t('auth.password')}</Label><Input id="password" type="password" className="h-12" placeholder={t('ui.passwordDesc')} minLength={10} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
          <div className="mt-2 grid grid-cols-4 gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 rounded-full ${i < strength ? (strength < 2 ? 'bg-sell' : strength < 3 ? 'bg-warn' : 'bg-buy') : 'bg-muted'}`} />)}</div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t('ui.passwordDesc')}</p></div>
        <div><Label htmlFor="country">{t('auth.country')}</Label><Input id="country" className="h-12 uppercase" maxLength={2} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase() })} required /></div>
        <ErrorText error={err} />
        <Button type="submit" size="lg" className="w-full" loading={busy} data-testid="signup-submit">{t('auth.signup')}</Button>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{t('ui.agree')} <Link href={L('/legal/terms')} className="underline">{t('launch.terms')}</Link> · <Link href={L('/legal/privacy')} className="underline">{t('launch.privacy')}</Link> · <Link href={L('/legal/risk')} className="underline">{t('launch.risk')}</Link></p>
      </form>
    </AuthShell>
  );
}
