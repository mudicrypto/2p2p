'use client';
import { Alert } from '@p2p/ui';
import { useI18n } from '@/lib/i18n';
import { ApiError } from '@/lib/api';
export function ErrorText({ error }: { error: unknown }) {
  const { t } = useI18n();
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : '';
  const msg = code && t(`errors.${code}`) !== `errors.${code}` ? t(`errors.${code}`) : error instanceof Error ? error.message : t('common.error');
  return <Alert variant="error" data-testid="error">{msg}</Alert>;
}
