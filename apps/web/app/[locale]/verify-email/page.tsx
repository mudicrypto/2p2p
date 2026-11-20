'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Alert, Button } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';
import { useL } from '../../../components/nav';
import { ErrorText } from '../../../components/errors';
import { AuthShell } from '../../../components/auth-shell';

function Verify() {
  const { t } = useI18n();
  const L = useL();
  const token = useSearchParams().get('token');
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (token) api('/auth/verify-email', { body: { token } }).then(() => setOk(true), setErr); }, [token]);
  return (
    <AuthShell title={t('auth.verifyEmail')}>
      <div className="space-y-4 text-center">
        {ok ? <>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-buy/15 text-buy"><CheckCircle2 size={32} /></div>
          <Alert variant="success" data-testid="verified">{t('auth.verified')}</Alert>
          <Link href={L('/login')}><Button size="lg" className="w-full">{t('auth.login')}</Button></Link>
        </> : err ? <ErrorText error={err} /> : <Loader2 className="mx-auto animate-spin text-primary" size={28} />}
      </div>
    </AuthShell>
  );
}
export default function Page() { return <Suspense><Verify /></Suspense>; }
