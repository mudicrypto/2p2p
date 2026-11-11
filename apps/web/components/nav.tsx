'use client';
/** App shell (KRYPTA): desktop sidebar + ticker top bar, phone top bar + bottom tabs. */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight, Bell, ChevronDown, Gift, Globe, HelpCircle, Home, LayoutGrid, LogOut, Megaphone, Menu, Moon, Receipt, Search, Settings,
  Store, Sun, User, Wallet, X,
} from 'lucide-react';
import { LOCALES } from '@p2p/i18n';
import { AssetIcon, Avatar, Button, Logo, BRAND, cn } from '@p2p/ui';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/session';
import { api } from '../lib/api';
import { socket } from '../lib/socket';
import { useDisplayFiat, useQuotes } from '../lib/market';

export function useL() {
  const { locale } = useI18n();
  return (p: string) => `/${locale}${p}`;
}
export const LANG_NAMES: Record<string, string> = { en: 'English', es: 'Español', pt: 'Português', ru: 'Русский', uk: 'Українська', tr: 'Türkçe', ar: 'العربية', fa: 'فارسی', ur: 'اردو', hi: 'हिन्दी', bn: 'বাংলা', id: 'Bahasa Indonesia', ms: 'Bahasa Melayu', vi: 'Tiếng Việt', th: 'ไทย', fil: 'Filipino', 'zh-Hant': '繁體中文', ko: '한국어', ja: '日本語', fr: 'Français', de: 'Deutsch', it: 'Italiano', pl: 'Polski', sw: 'Kiswahili', ha: 'Hausa', yo: 'Yorùbá' };
const ACTIVE = new Set(['CREATED', 'AWAITING_PAYMENT', 'PAID', 'DISPUTED']);

function Popover({ trigger, children, align = 'end', label, className }: { trigger: React.ReactNode; children: (close: () => void) => React.ReactNode; align?: 'start' | 'end'; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn('flex h-10 items-center gap-1.5 rounded-xl px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', className)}>{trigger}</button>
      {open && <div className={cn('absolute top-12 z-50 min-w-56 animate-fade-up rounded-2xl border border-border bg-card p-1.5 shadow-2xl', align === 'end' ? 'end-0' : 'start-0')}>{children(() => setOpen(false))}</div>}
    </div>
  );
}
const item = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground hover:bg-muted';

/** Shared state for the shell: unread notifications, active orders, theme, locale switching. */
function useShell() {
  const { me, setMe } = useSession();
  const L = useL();
  const router = useRouter();
  const path = usePathname();
  const [unread, setUnread] = useState(0);
  const [activeOrders, setActiveOrders] = useState(0);
  const [theme, setTheme] = useState('dark');
  useEffect(() => { setTheme(document.documentElement.dataset.theme ?? 'dark'); }, []);
  useEffect(() => {
    if (!me) return;
    api<any[]>('/notifications').then((n) => setUnread(n.filter((x) => !x.read).length)).catch(() => {});
    api<any[]>('/orders').then((o) => setActiveOrders(o.filter((x) => ACTIVE.has(x.status)).length)).catch(() => {});
    const s = socket();
    const on = () => setUnread((u) => u + 1);
    s.on('notification', on);
    return () => { s.off('notification', on); };
  }, [me, path]);
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
  const active = (p: string) => (p === '' ? path === L('') : path === L(p) || path.startsWith(L(p) + '/'));
  return { me, L, path, unread, activeOrders, theme, toggleTheme, switchLocale, logout, active };
}

function navItems(t: (k: string) => string) {
  return [
    { p: '', label: t('ui.home'), icon: Home },
    { p: '/p2p', label: t('ui.p2pTrade'), icon: LayoutGrid },
    { p: '/wallet', label: t('nav.wallet'), icon: Wallet, testId: 'nav-wallet', auth: true },
    { p: '/orders', label: t('nav.orders'), icon: Receipt, testId: 'nav-orders', auth: true, badge: true },
    { p: '/merchant', label: t('ui.merchantCentre'), icon: Store },
    { p: '/rewards', label: t('ui.rewards'), icon: Gift },
    { p: '/corridor', label: t('corridor.title'), icon: ArrowLeftRight },
    { p: '/help', label: t('ui.help'), icon: HelpCircle },
    { p: '/account', label: t('ui.settings'), icon: Settings, auth: true },
  ];
}

function SidebarContent({ s, onNavigate }: { s: ReturnType<typeof useShell>; onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <>
      <Link href={s.L('')} onClick={onNavigate} className="flex items-center gap-3 px-3 pb-6 pt-1" aria-label={BRAND.name}>
        <Logo size={34} /><span className="text-xl font-bold tracking-[0.1em]">{BRAND.name}</span>
      </Link>
      <nav className="flex flex-col gap-1">
        {navItems(t).filter((n) => !n.auth || s.me).map((n) => {
          const on = s.active(n.p);
          return (
            <Link key={n.p} href={s.L(n.p)} onClick={onNavigate} data-testid={n.testId}
              className={cn('group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                on ? 'bg-gradient-to-r from-primary/20 to-primary/5 text-foreground shadow-[inset_3px_0_0_var(--color-primary)] rtl:shadow-[inset_-3px_0_0_var(--color-primary)]' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              <n.icon size={18} className={cn(on ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
              <span className="flex-1">{n.label}</span>
              {n.badge && s.activeOrders > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sell px-1.5 text-[11px] font-bold text-white">{s.activeOrders}</span>}
            </Link>
          );
        })}
      </nav>
      <Link href={s.L('/rewards')} onClick={onNavigate} className="relative mt-6 block overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-card p-4">
        <div className="pointer-events-none absolute -end-6 -top-6 h-24 w-24 rounded-full bg-primary/25 blur-2xl" />
        <Gift className="text-primary" size={26} />
        <div className="mt-3 font-semibold leading-snug">{t('ui.inviteTitle')}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{t('ui.inviteSub')}</div>
        <span className="mt-3 inline-flex items-center gap-1 rounded-lg border border-primary/50 px-3 py-1.5 text-xs font-semibold text-primary">{t('ui.inviteNow')} →</span>
      </Link>
    </>
  );
}

function Ticker() {
  const [fiat] = useDisplayFiat();
  const { num } = useI18n();
  const q = useQuotes(fiat);
  return (
    <div className="hidden min-w-0 items-center gap-6 xl:flex" data-testid="ticker">
      {(q ?? [{ asset: 'BTC' }, { asset: 'ETH' }, { asset: 'USDT' }] as any[]).map((x) => (
        <div key={x.asset} className="flex items-center gap-2.5">
          <AssetIcon asset={x.asset} size={30} />
          <div className="leading-tight">
            <div className="text-xs font-semibold text-muted-foreground">{x.asset}</div>
            <div className="num text-sm font-bold">{x.price ? `${num(x.price, 8)} ${fiat}` : '—'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SearchBox() {
  const { t } = useI18n();
  const L = useL();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [fiats, setFiats] = useState<string[]>([]);
  const [types, setTypes] = useState<Array<{ code: string; name: string }>>([]);
  useEffect(() => {
    if (!open || fiats.length) return;
    api<Array<{ code: string }>>('/fiats').then((r) => setFiats(r.map((x) => x.code))).catch(() => {});
    api<any[]>('/payment-method-types').then((r) => setTypes(r.map((x) => ({ code: x.code, name: x.name })))).catch(() => {});
  }, [open, fiats.length]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const out: Array<{ label: string; sub: string; href: string }> = [];
    for (const a of ['USDT', 'BTC', 'ETH']) if (a.toLowerCase().includes(s)) out.push({ label: a, sub: t('market.asset'), href: L(`/p2p?asset=${a}`) });
    for (const f of fiats) if (f.toLowerCase().includes(s)) out.push({ label: f, sub: t('market.fiat'), href: L(`/p2p?fiat=${f}`) });
    for (const p of types) if (p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s)) out.push({ label: p.name, sub: t('market.paymentMethod'), href: L(`/p2p?pm=${p.code}`) });
    return out.slice(0, 8);
  }, [q, fiats, types, L, t]);
  return (
    <div className="relative w-full max-w-xs" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={t('ui.searchPlaceholder')} aria-label={t('ui.searchPlaceholder')}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { router.push(results[0].href); setOpen(false); } }}
        className="h-10 w-full rounded-full border border-border bg-card ps-10 pe-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
      {open && results.length > 0 && (
        <div className="absolute top-12 z-50 w-full animate-fade-up rounded-2xl border border-border bg-card p-1.5 shadow-2xl">
          {results.map((r) => <Link key={r.href} href={r.href} onClick={() => { setOpen(false); setQ(''); }} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-muted"><span className="font-semibold">{r.label}</span><span className="text-xs text-muted-foreground">{r.sub}</span></Link>)}
        </div>
      )}
    </div>
  );
}

function RightControls({ s, compact }: { s: ReturnType<typeof useShell>; compact?: boolean }) {
  const { t, locale } = useI18n();
  return (
    <div className="flex items-center gap-1">
      {!compact && (
        <Popover label={t('nav.language')} trigger={<><Globe size={18} /><span className="hidden text-xs font-semibold uppercase 2xl:block">{locale}</span></>}>
          {(close) => <div className="grid max-h-80 w-72 grid-cols-2 gap-0.5 overflow-y-auto">{LOCALES.map((l) => (
            <button key={l} onClick={() => { s.switchLocale(l); close(); }} className={cn('rounded-lg px-3 py-2 text-start text-sm hover:bg-muted', l === locale && 'bg-muted font-semibold text-primary')}>{LANG_NAMES[l] ?? l}</button>
          ))}</div>}
        </Popover>
      )}
      {!compact && <button type="button" onClick={s.toggleTheme} aria-label={t('ui.theme')} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">{s.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>}
      {s.me ? (
        <>
          <Link href={s.L('/notifications')} aria-label={t('nav.notifications')} className="relative flex h-10 w-10 items-center justify-center rounded-xl text-foreground hover:bg-muted">
            <Bell size={20} />
            {s.unread > 0 && <span data-testid={compact ? undefined : 'unread'} className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sell px-1 text-[10px] font-bold text-white">{s.unread > 9 ? '9+' : s.unread}</span>}
          </Link>
          {!compact && (
            <Popover label={t('profile.title')} className="ps-1.5" trigger={<>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-primary/70 text-xs font-bold text-foreground">{(s.me.displayName ?? s.me.email ?? 'U').slice(0, 2).toUpperCase()}</span>
              <span className="hidden max-w-36 truncate text-sm font-semibold text-foreground 2xl:block">{s.me.displayName ?? s.me.email}</span>
              <ChevronDown size={14} />
            </>}>
              {(close) => (
                <div onClick={close}>
                  <div className="px-3 py-2.5"><div className="truncate text-sm font-semibold">{s.me!.displayName ?? s.me!.email}</div><div className="text-xs text-muted-foreground">{t('profile.tier', { tier: s.me!.kycTier })}</div></div>
                  <Link className={item} href={s.L(`/profile/${s.me!.id}`)}><User size={16} />{t('profile.title')}</Link>
                  <Link className={item} href={s.L('/account')}><Settings size={16} />{t('ui.settings')}</Link>
                  <Link className={item} href={s.L('/ads')}><Megaphone size={16} />{t('ad.mine')}</Link>
                  <Link className={item} href={s.L('/merchant')}><Store size={16} />{t('ui.merchantCentre')}</Link>
                  <button className={cn(item, 'text-sell')} onClick={s.logout}><LogOut size={16} />{t('nav.logout')}</button>
                </div>
              )}
            </Popover>
          )}
        </>
      ) : !compact && (
        <div className="flex items-center gap-2 ps-1">
          <Link href={s.L('/login')}><Button size="sm" variant="ghost">{t('nav.login')}</Button></Link>
          <Link href={s.L('/signup')}><Button size="sm">{t('nav.signup')}</Button></Link>
        </div>
      )}
    </div>
  );
}

function BottomTabs({ s }: { s: ReturnType<typeof useShell> }) {
  const { t } = useI18n();
  const tabs = [
    { p: '', label: t('ui.home'), icon: Home },
    { p: '/p2p', label: 'P2P', icon: LayoutGrid },
    { p: '/orders', label: t('nav.orders'), icon: Receipt, badge: true },
    { p: '/wallet', label: t('nav.wallet'), icon: Wallet },
    { p: '/account', label: t('ui.profile'), icon: User },
  ];
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 flex border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Tabs">
      {tabs.map((x) => {
        const on = s.active(x.p);
        return (
          <Link key={x.p} href={s.L(s.me || x.p === '' || x.p === '/p2p' ? x.p : '/login')} className={cn('relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium', on ? 'text-primary' : 'text-muted-foreground')}>
            <x.icon size={21} strokeWidth={on ? 2.4 : 1.8} />
            <span className="max-w-full truncate px-0.5">{x.label}</span>
            {x.badge && s.activeOrders > 0 && <span className="absolute top-1 ms-6 flex h-4 min-w-4 items-center justify-center rounded-full bg-sell px-1 text-[9px] font-bold text-white">{s.activeOrders}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** The whole app frame. */
export function Shell({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  const s = useShell();
  const { t } = useI18n();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { setDrawer(false); }, [s.path]);
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-60 flex-col overflow-y-auto border-e border-border bg-card/40 px-3 py-5 lg:flex">
        <SidebarContent s={s} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 max-w-[85vw] animate-fade-up overflow-y-auto border-e border-border bg-card px-3 py-5">
            <button className="absolute end-3 top-4 rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Close" onClick={() => setDrawer(false)}><X size={18} /></button>
            <SidebarContent s={s} onNavigate={() => setDrawer(false)} />
            <div className="mt-6 flex items-center justify-between rounded-xl border border-border p-2"><RightControlsLangTheme s={s} /></div>
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:ps-60">
        <header className="glass sticky top-0 z-40 border-b border-border">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl text-foreground hover:bg-muted lg:hidden" aria-label="Menu" onClick={() => setDrawer(true)}><Menu size={22} /></button>
            <Link href={s.L('')} className="flex items-center gap-2 lg:hidden" aria-label={BRAND.name}><Logo size={26} /><span className="font-bold tracking-[0.08em]">{BRAND.name}</span></Link>
            <Ticker />
            <div className="ms-auto hidden w-full max-w-xs md:block"><SearchBox /></div>
            <div className="ms-auto md:ms-0"><span className="hidden lg:block"><RightControls s={s} /></span><span className="lg:hidden"><RightControlsMobile s={s} /></span></div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-10">{children}</main>
        <div className="pb-16 lg:pb-0">{footer}</div>
      </div>
      <BottomTabs s={s} />
      <span className="sr-only">{t('app.name')}</span>
    </div>
  );
}
function RightControlsMobile({ s }: { s: ReturnType<typeof useShell> }) {
  const { t } = useI18n();
  return s.me ? <RightControls s={s} compact /> : <Link href={s.L('/login')}><Button size="sm">{t('nav.login')}</Button></Link>;
}
function RightControlsLangTheme({ s }: { s: ReturnType<typeof useShell> }) {
  const { t, locale } = useI18n();
  return (
    <>
      <Popover label={t('nav.language')} align="start" trigger={<><Globe size={18} /><span className="text-sm">{LANG_NAMES[locale]}</span></>}>
        {(close) => <div className="grid max-h-72 w-60 grid-cols-1 gap-0.5 overflow-y-auto">{LOCALES.map((l) => (
          <button key={l} onClick={() => { s.switchLocale(l); close(); }} className={cn('rounded-lg px-3 py-2 text-start text-sm hover:bg-muted', l === locale && 'bg-muted font-semibold text-primary')}>{LANG_NAMES[l] ?? l}</button>
        ))}</div>}
      </Popover>
      <button type="button" onClick={s.toggleTheme} aria-label={t('ui.theme')} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted">{s.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
    </>
  );
}
