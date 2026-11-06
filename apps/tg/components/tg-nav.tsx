'use client';
import Link from 'next/link';
import { useI18n } from '@p2p/web/lib/i18n';
/** Bottom tab bar sized for the Telegram viewport. */
export function TgNav() {
  const { t, locale } = useI18n();
  const items = [['', 'nav.market'], ['/orders', 'nav.orders'], ['/wallet', 'nav.wallet'], ['/notifications', 'nav.notifications']] as const;
  return <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-border bg-background py-2 text-xs">
    {items.map(([p, k]) => <Link key={k} href={`/${locale}${p}`} className="px-2 py-1" data-testid={`tg-tab-${k}`}>{t(k)}</Link>)}
  </nav>;
}
