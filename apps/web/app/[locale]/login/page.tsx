'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { useSession } from '../../../lib/session';
import { api, ApiError } from '../../../lib/api';
import { useL } from '../../../components/nav';
import { ErrorText } from '../../../components/errors';

export default function Login() {
  const { t } = useI18n();
  const { setMe } = useSession();
  const L = useL();
  const router = useRouter();
  const [f, setF] = useState({ email: '', password: '', totp: '' });
  const [need2fa, setNeed2fa] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    try {
      const r = await api('/auth/login', { body: { email: f.email, password: f.password, totp: f.totp || undefined } });
      setMe(r.user); router.push(L(''));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TWO_FA_REQUIRED') setNeed2fa(true); else setErr(e);
    }
  };
  return (
    <Card className="mx-auto max-w-sm"><CardHeader><CardTitle>{t('auth.login')}</CardTitle></CardHeader>
      <CardContent><form onSubmit={submit} className="space-y-3">
        <div className="space-y-1"><Label htmlFor="email">{t('auth.email')}</Label><Input id="email" type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
        <div className="space-y-1"><Label htmlFor="password">{t('auth.password')}</Label><Input id="password" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></div>
        {need2fa && <div className="space-y-1"><Label htmlFor="totp">{t('auth.totp')}</Label><Input id="totp" inputMode="numeric" autoComplete="one-time-code" value={f.totp} onChange={(e) => setF({ ...f, totp: e.target.value })} autoFocus /></div>}
        <ErrorText error={err} />
        <Button type="submit" className="w-full" data-testid="login-submit">{t('auth.login')}</Button>
        <p className="text-sm text-muted-foreground">{t('auth.noAccount')} <Link className="underline" href={L('/signup')}>{t('nav.signup')}</Link></p>
      </form></CardContent></Card>
  );
}
