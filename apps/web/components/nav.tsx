'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LOCALES } from '@p2p/i18n';
import { Button, Select, Badge } from '@p2p/ui';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { socket } from '@/lib/socket';

export function useL() {
  const { locale } = useI18n();
  return (p: string) => `/${locale}${p}`;
}

export function Nav() {
  const { t, locale } = useI18n();
  const { me, setMe } = useSession();
  const L = useL();
  const router = useRouter();
  const path = usePathname();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!me) return;
    api<any[]>('/notifications').then((n) => setUnread(n.filter((x) => !x.read).length)).catch(() => {});
    const s = socket();
    const on = () => setUnread((u) => u + 1);
    s.on('notification', on);
    return () => { s.off('notification', on); };
  }, [me]);
  const switchLocale = (l: string) => {
    document.cookie = `locale=${l}; path=/; max-age=31536000; samesite=lax`;
    router.push(path.replace(/^\/[^/]+/, `/${l}`));
  };
  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href={L('')} className="me-auto text-lg font-bold">{t('app.name')}</Link>
        <Link href={L('')} className="text-sm hover:underline">{t('nav.market')}</Link>
        {me && <>
          <Link href={L('/orders')} className="text-sm hover:underline" data-testid="nav-orders">{t('nav.orders')}</Link>
          <Link href={L('/ads/new')} className="text-sm hover:underline">{t('nav.postAd')}</Link>
          <Link href={L('/corridor')} className="text-sm hover:underline">{t('corridor.title')}</Link>
          <Link href={L('/wallet')} className="text-sm hover:underline" data-testid="nav-wallet">{t('nav.wallet')}</Link>
          <Link href={L('/notifications')} className="text-sm hover:underline" aria-label={t('nav.notifications')}>
            🔔{unread > 0 && <Badge variant="danger" className="ms-1" data-testid="unread">{unread}</Badge>}
          </Link>
        </>}
        <Select aria-label={t('nav.language')} value={locale} onChange={(e) => switchLocale(e.target.value)} className="h-8 w-24">
          {LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
        </Select>
        {me ? (
          <Button size="sm" variant="outline" onClick={async () => { await api('/auth/logout', { method: 'POST' }); setMe(null); router.push(L('/login')); }}>{t('nav.logout')}</Button>
        ) : (
          <>
            <Link href={L('/login')}><Button size="sm" variant="outline">{t('nav.login')}</Button></Link>
            <Link href={L('/signup')}><Button size="sm">{t('nav.signup')}</Button></Link>
          </>
        )}
      </nav>
    </header>
  );
}
