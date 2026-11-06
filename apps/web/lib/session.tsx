'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

export interface Me { id: string; email?: string; kycTier: number; totpEnabled: boolean; displayName?: string; country: string; emailVerified: boolean; phoneVerified: boolean }
const Ctx = createContext<{ me: Me | null; loading: boolean; refresh: () => Promise<void>; setMe: (m: Me | null) => void }>({ me: null, loading: true, refresh: async () => {}, setMe: () => {} });
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { setMe((await api<{ user: Me }>('/auth/me')).user); } catch { setMe(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return <Ctx.Provider value={{ me, loading, refresh, setMe }}>{children}</Ctx.Provider>;
}
export const useSession = () => useContext(Ctx);
