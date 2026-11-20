'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ReceiptText, Store, UserRound, Wallet } from 'lucide-react';
import { cn } from '@p2p/ui';
import { useI18n } from '@p2p/web/lib/i18n';
/** Bottom tab bar sized for the Telegram viewport. */
export function TgNav() {
  const { t, locale } = useI18n();
  const path = usePathname();
  const items = [['', 'nav.market', Store], ['/orders', 'nav.orders', ReceiptText], ['/wallet', 'nav.wallet', Wallet], ['/notifications', 'nav.notifications', Bell], ['/account', 'ui.account', UserRound]] as const;
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-border pb-[env(safe-area-inset-bottom)]">
      {items.map(([p, k, Icon]) => {
        const href = `/${locale}${p}`;
        const active = p === '' ? path === href : path.startsWith(href);
        return (
          <Link key={k} href={href} data-testid={`tg-tab-${k}`} className={cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium', active ? 'text-primary' : 'text-muted-foreground')}>
            <Icon size={20} strokeWidth={active ? 2.4 : 1.8} /><span className="max-w-full truncate px-1">{t(k)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
