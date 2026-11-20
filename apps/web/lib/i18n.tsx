'use client';
import { createContext, useContext, useMemo } from 'react';
import { translate, formatDecimal, formatMoney, formatDate, formatPercentBps, dir, type Messages } from '@p2p/i18n';

interface I18n { locale: string; dir: 'ltr' | 'rtl'; t: (k: string, p?: Record<string, string | number>) => string; num: (v: string, maxFraction?: number) => string; money: (v: string, cur: string, minor?: number) => string; date: (d: string | Date) => string; pct: (bps: number) => string }
const Ctx = createContext<I18n | null>(null);
export function I18nProvider({ locale, messages, children }: { locale: string; messages: Messages; children: React.ReactNode }) {
  const v = useMemo<I18n>(() => ({
    locale, dir: dir(locale) as 'ltr' | 'rtl',
    t: (k, p) => translate(messages, k, p),
    num: (val, maxFraction) => formatDecimal(locale, val, { maxFraction }),
    money: (val, cur, minor) => formatMoney(locale, val, cur, minor),
    date: (d) => formatDate(locale, d),
    pct: (bps) => formatPercentBps(locale, bps),
  }), [locale, messages]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}
export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('I18nProvider missing');
  return v;
}
