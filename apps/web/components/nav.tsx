'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Bell, ChevronDown, Globe, LogOut, Menu, Moon, Receipt, ShieldCheck, Sun, User, Wallet, X, Megaphone, Store } from 'lucide-react';
import { LOCALES } from '@p2p/i18n';
import { Avatar, Button, Logo, cn } from '@p2p/ui';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/session';
import { api } from '../lib/api';
import { socket } from '../lib/socket';

export function useL() {
  const { locale } = useI18n();
  return (p: string) => `/${locale}${p}`;
}
const LANG_NAMES: Record<string, string> = { en: 'English', es: 'Español', pt: 'Português', ru: 'Русский', uk: 'Українська', tr: 'Türkçe', ar: 'العربية', fa: 'فارسی', ur: 'اردو', hi: 'हिन्दी', bn: 'বাংলা', id: 'Bahasa Indonesia', ms: 'Bahasa Melayu', vi: 'Tiếng Việt', th: 'ไทย', fil: 'Filipino', 'zh-Hant': '繁體中文', ko: '한국어', ja: '日本語', fr: 'Français', de: 'Deutsch', it: 'Italiano', pl: 'Polski', sw: 'Kiswahili', ha: 'Hausa', yo: 'Yorùbá' };

function Popover({ trigger, children, align = 'end', label }: { trigger: React.ReactNode; children: (close: () => void) => React.ReactNode; align?: 'start' | 'end'; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex h-10 items-center gap-1 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{trigger}</button>
      {open && <div className={cn('absolute top-12 z-50 min-w-56 animate-fade-up rounded-2xl border border-border bg-card p-1.5 shadow-2xl', align === 'end' ? 'end-0' : 'start-0')}>{children(() => setOpen(false))}</div>}
    </div>
  );
}
const item = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground hover:bg-muted';

export function Nav() {
  const { t, locale } = useI18n();
  const { me, setMe } = useSession();
  const L = useL();
  const router = useRouter();
  const path = usePathname();
  const [unread, setUnread] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [theme, setTheme] = useState('dark');
  useEffect(() => { setTheme(document.documentElement.dataset.theme ?? 'dark'); }, []);
  useEffect(() => { setMobile(false); }, [path]);
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
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  };
  const logout = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setMe(null); router.push(L('/login')); };
  const links: Array<[string, string, React.ReactNode]> = [
    ['/p2p', t('nav.market'), <Store key="i" size={17} />],
    ['/corridor', t('corridor.title'), <ArrowLeftRight key="i" size={17} />],
    ...(me ? ([['/orders', t('nav.orders'), <Receipt key="i" size={17} />], ['/wallet', t('nav.wallet'), <Wallet key="i" size={17} />]] as Array<[string, string, React.ReactNode]>) : []),
  ];
  const active = (p: string) => path === L(p) || path.startsWith(L(p) + '/');
  return (
    <header className="glass sticky top-0 z-40 border-b border-border">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-1 px-4 sm:px-6">
        <Link href={L('')} className="me-4 flex items-center gap-2.5" aria-label={t('app.name')}>
          <Logo /><span className="hidden text-[17px] font-bold tracking-tight sm:block">{t('app.name')}</span>
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {links.map(([p, label]) => (
            <Link key={p} href={L(p)} data-testid={p === '/orders' ? 'nav-orders' : p === '/wallet' ? 'nav-wallet' : undefined}
              className={cn('rounded-lg px-3 py-2 text-sm font-medium transition-colors', active(p) ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}>{label}</Link>
          ))}
        </div>
        <div className="ms-auto flex items-center gap-1">
          {me && <Link href={L('/ads/new')} className="hidden sm:block"><Button size="sm" variant="soft"><Megaphone size={15} />{t('nav.postAd')}</Button></Link>}
          <Popover label={t('nav.language')} trigger={<><Globe size={18} /><span className="hidden text-xs font-semibold uppercase lg:block">{locale}</span></>}>
            {(close) => <div className="grid max-h-80 w-72 grid-cols-2 gap-0.5 overflow-y-auto">{LOCALES.map((l) => (
              <button key={l} onClick={() => { switchLocale(l); close(); }} className={cn('rounded-lg px-3 py-2 text-start text-sm hover:bg-muted', l === locale && 'bg-muted font-semibold text-primary')}>{LANG_NAMES[l] ?? l}</button>
            ))}</div>}
          </Popover>
          <button type="button" onClick={toggleTheme} aria-label="Theme" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          {me ? (
            <>
              <Link href={L('/notifications')} aria-label={t('nav.notifications')} className="relative flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                <Bell size={18} />
                {unread > 0 && <span data-testid="unread" className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sell px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
              </Link>
              <Popover label={t('profile.title')} trigger={<><Avatar name={me.displayName ?? me.email ?? 'U'} seed={me.id} size={30} /><ChevronDown size={14} className="hidden sm:block" /></>}>
                {(close) => (
                  <div onClick={close}>
                    <div className="px-3 py-2.5"><div className="truncate text-sm font-semibold">{me.displayName ?? me.email}</div><div className="text-xs text-muted-foreground">{t('profile.tier', { tier: me.kycTier })}</div></div>
                    <Link className={item} href={L(`/profile/${me.id}`)}><User size={16} />{t('profile.title')}</Link>
                    <Link className={item} href={L('/account')}><ShieldCheck size={16} />{t('nav.security')}</Link>
                    <Link className={item} href={L('/wallet')}><Wallet size={16} />{t('nav.wallet')}</Link>
                    <Link className={item} href={L('/orders')}><Receipt size={16} />{t('nav.orders')}</Link>
                    <Link className={item} href={L('/ads')}><Megaphone size={16} />{t('ad.mine')}</Link>
                    <button className={cn(item, 'text-sell')} onClick={logout}><LogOut size={16} />{t('nav.logout')}</button>
                  </div>
                )}
              </Popover>
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link href={L('/login')}><Button size="sm" variant="ghost">{t('nav.login')}</Button></Link>
              <Link href={L('/signup')}><Button size="sm">{t('nav.signup')}</Button></Link>
            </div>
          )}
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted md:hidden" aria-label="Menu" onClick={() => setMobile((m) => !m)}>{mobile ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
      </nav>
      {mobile && (
        <div className="animate-fade-up border-t border-border px-4 py-3 md:hidden">
          {links.map(([p, label, icon]) => <Link key={p} href={L(p)} className={item}>{icon}{label}</Link>)}
          {me && <Link href={L('/ads/new')} className={item}><Megaphone size={17} />{t('nav.postAd')}</Link>}
          {!me && <div className="mt-2 grid grid-cols-2 gap-2"><Link href={L('/login')}><Button variant="outline" className="w-full">{t('nav.login')}</Button></Link><Link href={L('/signup')}><Button className="w-full">{t('nav.signup')}</Button></Link></div>}
        </div>
      )}
    </header>
  );
}
