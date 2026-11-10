'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { useSession } from '../../../lib/session';
import { api, ApiError } from '../../../lib/api';
import { useL } from '../../../components/nav';
import { ErrorText } from '../../../components/errors';
import { AuthShell } from '../../../components/auth-shell';

export default function Login() {
  const { t } = useI18n();
  const { setMe } = useSession();
  const L = useL();
  const router = useRouter();
  const [f, setF] = useState({ email: '', password: '', totp: '' });
  const [need2fa, setNeed2fa] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const r = await api('/auth/login', { body: { email: f.email, password: f.password, totp: f.totp || undefined } });
      setMe(r.user); router.push(L('/p2p'));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TWO_FA_REQUIRED') setNeed2fa(true); else setErr(e);
      setBusy(false);
    }
  };
  return (
    <AuthShell title={t('ui.welcome')} subtitle={<>{t('auth.noAccount')} <Link className="font-medium text-primary hover:underline" href={L('/signup')}>{t('nav.signup')}</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <div><Label htmlFor="email">{t('auth.email')}</Label><Input id="email" type="email" className="h-12" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
        <div><Label htmlFor="password">{t('auth.password')}</Label><Input id="password" type="password" className="h-12" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></div>
        {need2fa && <div><Label htmlFor="totp">{t('auth.totp')}</Label><Input id="totp" inputMode="numeric" maxLength={6} className="h-12 text-center font-mono text-lg tracking-[0.4em]" autoComplete="one-time-code" value={f.totp} onChange={(e) => setF({ ...f, totp: e.target.value })} autoFocus /></div>}
        <ErrorText error={err} />
        <Button type="submit" size="lg" className="w-full" loading={busy} data-testid="login-submit">{t('auth.login')}</Button>
      </form>
    </AuthShell>
  );
}
