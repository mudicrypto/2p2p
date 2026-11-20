'use client';
import Link from 'next/link';
import { Alert } from '@p2p/ui';
import { useI18n } from '../lib/i18n';
import { ApiError } from '../lib/api';
import { useL } from './nav';
export function ErrorText({ error }: { error: unknown }) {
  const { t } = useI18n();
  const L = useL();
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : '';
  const msg = code && t(`errors.${code}`) !== `errors.${code}` ? t(`errors.${code}`) : error instanceof Error ? error.message : t('common.error');
  return <Alert variant="error" data-testid="error">{msg}{code === 'EMAIL_UNVERIFIED' && <> <Link href={L('/account')} className="font-semibold underline" data-testid="error-confirm-email">{t('ui.resendEmail')}</Link></>}</Alert>;
}
