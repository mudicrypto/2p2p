'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Alert, Button, Card, Input, Label, Logo, Skeleton } from '@p2p/ui';
import { api, ApiError } from '@p2p/web/lib/api';
import { useSession } from '@p2p/web/lib/session';
import { useI18n } from '@p2p/web/lib/i18n';

interface TgWebApp {
  initData: string; ready(): void; expand(): void; themeParams: Record<string, string>; colorScheme?: string;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { notificationOccurred(t: 'success' | 'error' | 'warning'): void };
  initDataUnsafe?: { user?: { language_code?: string } };
}
declare global { interface Window { Telegram?: { WebApp?: TgWebApp } } }

/** Authenticates with Telegram initData (validated server-side with the bot token) and applies Telegram theming. */
export function TelegramGate({ children }: { children: React.ReactNode }) {
  const { me, setMe, loading } = useSession();
  const { t } = useI18n();
  const router = useRouter();
  const path = usePathname();
  const [state, setState] = useState<'init' | 'need-country' | 'no-telegram' | 'ready' | 'error'>('init');
  const [country, setCountry] = useState('');
  const [err, setErr] = useState('');
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

  const login = async (c?: string) => {
    try {
      const r = await api('/auth/telegram', { body: { initData: tg!.initData, country: c } });
      setMe(r.user); setState('ready');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION') setState('need-country');
      else { setErr((e as Error).message); setState('error'); }
    }
  };
  useEffect(() => {
    if (loading) return;
    if (!tg?.initData) { setState(me ? 'ready' : 'no-telegram'); return; }
    tg.ready(); tg.expand();
    const root = document.documentElement.style;
    const p = tg.themeParams ?? {};
    const lum = (hex?: string) => { const m = hex?.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i); return m ? (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255 : 0; };
    document.documentElement.dataset.theme = (tg.colorScheme ?? (lum(p.bg_color) > 0.5 ? 'light' : 'dark')) === 'light' ? 'light' : 'dark';
    if (p.bg_color) root.setProperty('--color-background', p.bg_color);
    if (p.text_color) root.setProperty('--color-foreground', p.text_color);
    if (p.secondary_bg_color) { root.setProperty('--color-muted', p.secondary_bg_color); root.setProperty('--color-card', p.secondary_bg_color); }
    if (p.button_color) root.setProperty('--color-primary', p.button_color);
    if (p.button_text_color) root.setProperty('--color-primary-foreground', p.button_text_color);
    if (me) setState('ready'); else void login();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  useEffect(() => {
    const bb = tg?.BackButton;
    if (!bb) return;
    const back = () => router.back();
    if (path.split('/').filter(Boolean).length > 1) { bb.show(); bb.onClick(back); } else bb.hide();
    return () => bb.offClick(back);
  }, [path, router, tg]);

  if (state === 'ready') return <>{children}</>;
  if (state === 'need-country') return (
    <div className="flex min-h-[80vh] flex-col justify-center gap-6 p-4">
      <div className="flex flex-col items-center gap-3 text-center"><Logo size={56} /><h1 className="text-2xl font-bold tracking-tight">{t('app.name')}</h1><p className="text-sm text-muted-foreground">{t('app.tagline')}</p></div>
      <Card className="space-y-3 p-5"><Label htmlFor="c">{t('auth.country')}</Label>
        <Input id="c" maxLength={2} className="h-12 uppercase" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} data-testid="tg-country" />
        <Button size="lg" className="w-full" onClick={() => login(country)} data-testid="tg-continue">{t('auth.signup')}</Button></Card>
    </div>
  );
  if (state === 'no-telegram') return <Alert className="m-4">Open this app from Telegram.</Alert>;
  if (state === 'error') return <Alert variant="error" className="m-4">{err}</Alert>;
  return <div className="space-y-3 p-4"><Skeleton className="h-12" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
}
