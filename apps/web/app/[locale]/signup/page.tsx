'use client';
import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Alert } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';
import { useL } from '../../../components/nav';
import { ErrorText } from '../../../components/errors';
import Link from 'next/link';

export default function Signup() {
  const { t, locale } = useI18n();
  const L = useL();
  const [f, setF] = useState({ email: '', password: '', country: 'DE' });
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    try { const r = await api('/auth/signup', { body: { ...f, country: f.country.toUpperCase(), locale } }); setDone(r.devEmailToken ?? ''); } catch (e) { setErr(e); }
  };
  if (done !== null) return (
    <Card className="mx-auto max-w-sm p-6 space-y-3"><Alert variant="success">{t('auth.checkEmail')}</Alert>
      {done && <Link data-testid="dev-verify-link" className="text-sm underline" href={L(`/verify-email?token=${encodeURIComponent(done)}`)}>{t('auth.verifyEmail')} (dev)</Link>}</Card>
  );
  return (
    <Card className="mx-auto max-w-sm"><CardHeader><CardTitle>{t('auth.signup')}</CardTitle></CardHeader>
      <CardContent><form onSubmit={submit} className="space-y-3">
        <div className="space-y-1"><Label htmlFor="email">{t('auth.email')}</Label><Input id="email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
        <div className="space-y-1"><Label htmlFor="password">{t('auth.password')}</Label><Input id="password" type="password" minLength={10} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></div>
        <div className="space-y-1"><Label htmlFor="country">{t('auth.country')}</Label><Input id="country" maxLength={2} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} required /></div>
        <ErrorText error={err} />
        <Button type="submit" className="w-full" data-testid="signup-submit">{t('auth.signup')}</Button>
      </form></CardContent></Card>
  );
}
