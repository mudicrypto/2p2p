'use client';
/** parley app shell: floating sidebar card (Trade · Orders · Wallet + theme) on desktop; top bar + pill tab bar on phones. */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, Bell, Globe, HelpCircle, List, LogIn, LogOut, Megaphone, Moon, Settings, Store, Sun, User, Wallet, X } from 'lucide-react';
import { LOCALES } from '@p2p/i18n';
import { Wordmark, cn } from '@p2p/ui';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/session';
import { api } from '../lib/api';
import { socket } from '../lib/socket';

export function useL() {
  const { locale } = useI18n();
  return (p: string) => `/${locale}${p}`;
}
export const LANG_NAMES: Record<string, string> = { en: 'English', es: 'Español', pt: 'Português', ru: 'Русский', uk: 'Українська', tr: 'Türkçe', ar: 'العربية', fa: 'فارسی', ur: 'اردو', hi: 'हिन्दी', bn: 'বাংলা', id: 'Bahasa Indonesia', ms: 'Bahasa Melayu', vi: 'Tiếng Việt', th: 'ไทย', fil: 'Filipino', 'zh-Hant': '繁體中文', ko: '한국어', ja: '日本語', fr: 'Français', de: 'Deutsch', it: 'Italiano', pl: 'Polski', sw: 'Kiswahili', ha: 'Hausa', yo: 'Yorùbá' };
export const ACTIVE_STATUSES = new Set(['CREATED', 'AWAITING_PAYMENT', 'PAID', 'DISPUTED']);

function useShell() {
  const { me, setMe } = useSession();
  const L = useL();
  const router = useRouter();
  const path = usePathname();
  const [unread, setUnread] = useState(0);
  const [active, setActive] = useState(0);
  const [theme, setTheme] = useState('dark');
  useEffect(() => { setTheme(document.documentElement.dataset.theme ?? 'dark'); }, []);
  useEffect(() => {
    if (!me) return;
    api<any[]>('/notifications').then((n) => setUnread(n.filter((x) => !x.read).length)).catch(() => {});
    api<any[]>('/orders').then((o) => setActive(o.filter((x) => ACTIVE_STATUSES.has(x.status)).length)).catch(() => {});
    const s = socket();
    const on = () => setUnread((u) => u + 1);
    s.on('notification', on);
    return () => { s.off('notification', on); };
  }, [me, path]);
  const switchLocale = (l: string) => { document.cookie = `locale=${l}; path=/; max-age=31536000; samesite=lax`; router.push(path.replace(/^\/[^/]+/, `/${l}`)); };
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  };
  const logout = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setMe(null); router.push(L('/login')); };
  const isActive = (p: string) => (p === '' ? path === L('') || path === L('/p2p') || path.startsWith(L('/profile')) : path === L(p) || path.startsWith(L(p) + '/'));
  return { me, L, path, unread, active, theme, toggleTheme, switchLocale, logout, isActive };
}
type Shell = ReturnType<typeof useShell>;

const pill = (on: boolean) => cn('flex items-center gap-3 rounded-full px-4 py-2.5 text-[15px] font-medium transition-colors',
  on ? 'bg-ink text-ink-foreground' : 'text-foreground hover:bg-muted');

function Primary({ s, onNavigate }: { s: Shell; onNavigate?: () => void }) {
  const { t } = useI18n();
  const items = [
    { p: '', label: t('ui.trade'), icon: ArrowDownUp },
    { p: '/orders', label: t('ui.ordersNav'), icon: List, testId: 'nav-orders', badge: s.active },
    { p: '/wallet', label: t('nav.wallet'), icon: Wallet, testId: 'nav-wallet' },
  ];
  return (
    <nav className="flex flex-col gap-1">
      {items.map((n) => (
        <Link key={n.p} href={s.L(n.p)} onClick={onNavigate} data-testid={s.me ? n.testId : undefined} className={pill(s.isActive(n.p))}>
          <n.icon size={17} strokeWidth={2} /><span className="flex-1">{n.label}</span>
          {!!n.badge && <span className="rounded-full bg-primary px-2 text-[11px] font-bold text-primary-foreground">{n.badge}</span>}
        </Link>
      ))}
      <button type="button" onClick={s.toggleTheme} className="mt-2 flex items-center gap-3 rounded-full bg-muted px-4 py-2.5 text-[15px] font-medium text-foreground hover:brightness-110">
        <Sun size={17} />{s.theme === 'dark' ? t('ui.lightMode') : t('ui.darkMode')}
      </button>
    </nav>
  );
}

function Secondary({ s, onNavigate }: { s: Shell; onNavigate?: () => void }) {
  const { t, locale } = useI18n();
  const [lang, setLang] = useState(false);
  const row = 'flex w-full items-center gap-3 rounded-full px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground';
  return (
    <div className="flex flex-col gap-0.5">
      {s.me ? <>
        <Link href={s.L('/notifications')} onClick={onNavigate} className={row}><Bell size={16} /><span className="flex-1">{t('nav.notifications')}</span>{s.unread > 0 && <span data-testid="unread" className="rounded-full bg-sell px-1.5 text-[10px] font-bold text-[#2a110b]">{s.unread > 9 ? '9+' : s.unread}</span>}</Link>
        <Link href={s.L('/account')} onClick={onNavigate} className={row}><Settings size={16} />{t('ui.settings')}</Link>
        <Link href={s.L('/ads')} onClick={onNavigate} className={row}><Megaphone size={16} />{t('ad.mine')}</Link>
        <Link href={s.L('/merchant')} onClick={onNavigate} className={row}><Store size={16} />{t('ui.merchantCentre')}</Link>
      </> : <Link href={s.L('/login')} onClick={onNavigate} className={row}><LogIn size={16} />{t('nav.login')}</Link>}
      <Link href={s.L('/help')} onClick={onNavigate} className={row}><HelpCircle size={16} />{t('ui.help')}</Link>
      <button type="button" className={row} onClick={() => setLang(!lang)} aria-expanded={lang}><Globe size={16} /><span className="flex-1 text-start">{LANG_NAMES[locale]}</span></button>
      {lang && <div className="mx-2 grid max-h-60 grid-cols-1 overflow-y-auto rounded-2xl bg-muted p-1">{LOCALES.map((l) => (
        <button key={l} onClick={() => { s.switchLocale(l); setLang(false); onNavigate?.(); }} className={cn('rounded-xl px-3 py-1.5 text-start text-sm hover:bg-card', l === locale && 'font-semibold text-foreground')}>{LANG_NAMES[l]}</button>
      ))}</div>}
      {s.me && <button className={cn(row, 'hover:text-sell')} onClick={s.logout}><LogOut size={16} />{t('nav.logout')}</button>}
    </div>
  );
}

export function Shell({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  const s = useShell();
  const { t } = useI18n();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setMenu(false); }, [s.path]);
  const tabs = [{ p: '', label: t('ui.trade') }, { p: '/orders', label: t('ui.ordersNav') }, { p: '/wallet', label: t('nav.wallet') }];
  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed start-3 top-3 z-30 hidden w-[212px] flex-col gap-3 lg:flex">
        <div className="rounded-[26px] border border-border/60 bg-card p-3">
          <Link href={s.L('')} className="mb-3 block px-3 pt-2" aria-label="parley"><Wordmark size={30} /></Link>
          <Primary s={s} />
        </div>
        <div className="rounded-[26px] border border-border/60 bg-card p-2"><Secondary s={s} /></div>
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between bg-background/80 px-3 backdrop-blur lg:hidden">
        <button type="button" onClick={() => setMenu(true)} aria-label={t('ui.profile')} className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground"><User size={18} /></button>
        <Link href={s.L('')} aria-label="parley"><Wordmark size={26} /></Link>
        <button type="button" onClick={s.toggleTheme} aria-label={t('ui.theme')} className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground">{s.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
      </header>
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMenu(false)} />
          <div ref={ref} className="absolute inset-x-3 top-3 animate-fade-up rounded-[26px] border border-border/60 bg-card p-3">
            <div className="mb-2 flex items-center justify-between px-3 pt-1"><Wordmark size={26} /><button onClick={() => setMenu(false)} aria-label="Close" className="rounded-full p-2 hover:bg-muted"><X size={18} /></button></div>
            {s.me && <div className="truncate px-4 pb-2 text-sm text-muted-foreground">{s.me.displayName ?? s.me.email}</div>}
            <Secondary s={s} onNavigate={() => setMenu(false)} />
          </div>
        </div>
      )}

      <div className="lg:ps-[236px]">
        <main className="mx-auto w-full max-w-[1320px] px-3 pb-28 pt-3 sm:px-5 lg:pb-12 lg:pt-5">{children}</main>
        <div className="pb-20 lg:pb-0">{footer}</div>
      </div>

      {/* Phone pill tab bar */}
      <nav className="fixed inset-x-3 bottom-3 z-40 flex rounded-full border border-border/60 bg-card p-1 shadow-xl lg:hidden" aria-label="Tabs" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        {tabs.map((x) => (
          <Link key={x.p} href={s.L(x.p)} className={cn('relative flex-1 rounded-full py-2.5 text-center text-[15px] font-medium', s.isActive(x.p) ? 'bg-ink text-ink-foreground' : 'text-foreground')}>
            {x.label}{x.p === '/orders' && s.active > 0 && <span className="absolute end-3 top-1.5 h-2 w-2 rounded-full bg-primary" />}
          </Link>
        ))}
      </nav>
    </div>
  );
}
