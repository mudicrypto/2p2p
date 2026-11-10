import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api, tokenStore } from './native';
import { palette, type Colors } from './theme';
import { I18nProvider, pickLocale } from './i18n';

export interface Me { id: string; email?: string; displayName?: string; kycTier: number; totpEnabled: boolean; phoneVerified: boolean; country: string }
interface AppCtx {
  me: Me | null; ready: boolean; refresh: () => Promise<void>; signIn: (token: string, me: Me) => Promise<void>; signOut: () => Promise<void>;
  colors: Colors; scheme: 'dark' | 'light'; themePref: 'system' | 'dark' | 'light'; setThemePref: (t: 'system' | 'dark' | 'light') => void;
  locale: string; setLocale: (l: string) => void; testMode: boolean;
}
const Ctx = createContext<AppCtx | null>(null);
const PREFS = 'p2p.prefs';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const sys = useColorScheme();
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [themePref, setThemePrefState] = useState<'system' | 'dark' | 'light'>('system');
  const [locale, setLocaleState] = useState(pickLocale());
  const [testMode, setTestMode] = useState(false);
  const save = (p: object) => { if (Platform.OS === 'web') return; void SecureStore.getItemAsync(PREFS).then((r) => SecureStore.setItemAsync(PREFS, JSON.stringify({ ...(r ? JSON.parse(r) : {}), ...p }))).catch(() => null); };
  const refresh = useCallback(async () => {
    try { if (await tokenStore.get()) setMe((await api.me()).user); else setMe(null); } catch { setMe(null); } finally { setReady(true); }
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'web') void SecureStore.getItemAsync(PREFS).then((r) => { if (!r) return; const p = JSON.parse(r); if (p.theme) setThemePrefState(p.theme); if (p.locale) setLocaleState(pickLocale(p.locale)); }).catch(() => null);
    void api.status().then((s) => setTestMode(!!s.testMode)).catch(() => null);
    void refresh();
  }, [refresh]);
  const scheme = themePref === 'system' ? (sys === 'light' ? 'light' : 'dark') : themePref;
  const v = useMemo<AppCtx>(() => ({
    me, ready, refresh, testMode,
    signIn: async (token, u) => { await tokenStore.set(token); setMe(u); },
    signOut: async () => { await api.logout().catch(() => null); await tokenStore.set(null); setMe(null); },
    colors: palette[scheme], scheme, themePref,
    setThemePref: (t) => { setThemePrefState(t); save({ theme: t }); },
    locale, setLocale: (l) => { setLocaleState(l); save({ locale: l }); },
  }), [me, ready, refresh, scheme, themePref, locale, testMode]);
  return <Ctx.Provider value={v}><I18nProvider locale={locale}>{children}</I18nProvider></Ctx.Provider>;
}
export const useApp = () => { const v = useContext(Ctx); if (!v) throw new Error('AppProvider missing'); return v; };
export const useColors = () => useApp().colors;
