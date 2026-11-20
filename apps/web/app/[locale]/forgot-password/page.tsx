'use client';
import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { Alert, Button, Input, Label } from '@p2p/ui';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';
import { useL } from '../../../components/nav';
import { ErrorText } from '../../../components/errors';
import { AuthShell } from '../../../components/auth-shell';

export default function ForgotPassword() {
  const { t } = useI18n();
  const L = useL();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { await api('/auth/password/forgot', { body: { email } }); setSent(true); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <AuthShell title={t('ui.forgotTitle')} footer={<Link className="font-semibold underline underline-offset-4" href={L('/login')}>{t('auth.login')}</Link>}>
      {sent ? <div className="space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary"><MailCheck size={30} /></div>
        <Alert variant="success" data-testid="forgot-sent">{t('ui.forgotSent')}</Alert>
      </div> : <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('ui.forgotDesc')}</p>
        <div><Label htmlFor="email">{t('auth.email')}</Label><Input id="email" type="email" className="h-12" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <ErrorText error={err} />
        <Button type="submit" size="lg" className="w-full" loading={busy} data-testid="forgot-submit">{t('ui.forgotSend')}</Button>
      </form>}
    </AuthShell>
  );
}
