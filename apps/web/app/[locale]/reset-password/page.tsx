'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Alert, Button, Input, Label } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { useSession } from '../../../lib/session';
import { api } from '../../../lib/api';
import { useL } from '../../../components/nav';
import { ErrorText } from '../../../components/errors';
import { AuthShell } from '../../../components/auth-shell';

function Reset() {
  const { t } = useI18n();
  const { setMe } = useSession();
  const L = useL();
  const token = useSearchParams().get('token') ?? '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const differ = pw2.length > 0 && pw !== pw2;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (pw !== pw2) return;
    setErr(null); setBusy(true);
    try { await api('/auth/password/reset', { body: { token, password: pw } }); setMe(null); setDone(true); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <AuthShell title={t('ui.forgotTitle')}>
      {done ? <div className="space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-buy/15 text-buy"><CheckCircle2 size={32} /></div>
        <Alert variant="success" data-testid="reset-done">{t('ui.resetDone')}</Alert>
        <Link href={L('/login')}><Button size="lg" className="w-full">{t('auth.login')}</Button></Link>
      </div> : <form onSubmit={submit} className="space-y-4">
        <div><Label htmlFor="pw">{t('ui.newPassword')}</Label><Input id="pw" type="password" className="h-12" minLength={10} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
          <p className="mt-1 text-[11px] text-muted-foreground">{t('ui.passwordDesc')}</p></div>
        <div><Label htmlFor="pw2">{t('ui.repeatPassword')}</Label><Input id="pw2" type="password" className="h-12" minLength={10} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
          {differ && <p className="mt-1 text-xs text-sell" data-testid="pw-differ">{t('ui.passwordsDiffer')}</p>}</div>
        <ErrorText error={err} />
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!token || differ} data-testid="reset-submit">{t('ui.setPassword')}</Button>
      </form>}
    </AuthShell>
  );
}
export default function Page() { return <Suspense><Reset /></Suspense>; }
