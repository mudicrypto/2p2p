'use client';
import Link from 'next/link';
import { useI18n } from '../lib/i18n';
export function Footer() {
  const { t, locale } = useI18n();
  return <footer className="mx-auto flex max-w-6xl flex-wrap gap-4 px-4 py-6 text-xs text-muted-foreground">
    {(['terms', 'privacy', 'risk'] as const).map((d) => <Link key={d} href={`/${locale}/legal/${d}`} className="hover:underline">{t(`launch.${d}`)}</Link>)}
    <Link href={`/${locale}/status`} className="hover:underline">{t('launch.statusTitle')}</Link>
  </footer>;
}
