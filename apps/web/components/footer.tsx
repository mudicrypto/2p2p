'use client';
import Link from 'next/link';
import { Wordmark } from '@p2p/ui';
import { useI18n } from '../lib/i18n';
export function Footer() {
  const { t, locale } = useI18n();
  const L = (p: string) => `/${locale}${p}`;
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5"><Wordmark size={24} /><span className="text-xs text-muted-foreground">© {new Date().getFullYear()}</span></div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link href={L('/p2p')} className="hover:text-foreground">{t('nav.market')}</Link>
          {(['terms', 'privacy', 'risk'] as const).map((d) => <Link key={d} href={L(`/legal/${d}`)} className="hover:text-foreground">{t(`launch.${d}`)}</Link>)}
          <Link href={L('/status')} className="flex items-center gap-1.5 hover:text-foreground"><span className="h-2 w-2 animate-pulse-soft rounded-full bg-buy" />{t('launch.statusTitle')}</Link>
        </div>
      </div>
    </footer>
  );
}
