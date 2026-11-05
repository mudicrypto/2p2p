'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Alert, Card } from '@p2p/ui';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { useL } from '@/components/nav';
import { ErrorText } from '@/components/errors';
import { Suspense } from 'react';

function Verify() {
  const { t } = useI18n();
  const L = useL();
  const token = useSearchParams().get('token');
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (token) api('/auth/verify-email', { body: { token } }).then(() => setOk(true), setErr); }, [token]);
  return <Card className="mx-auto max-w-sm space-y-3 p-6">{ok ? <><Alert variant="success" data-testid="verified">{t('auth.verified')}</Alert><Link className="underline" href={L('/login')}>{t('auth.login')}</Link></> : <ErrorText error={err} />}</Card>;
}
export default function Page() { return <Suspense><Verify /></Suspense>; }
