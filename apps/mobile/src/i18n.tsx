import { createContext, useContext, useMemo } from 'react';
import { MESSAGES, LOCALES, RTL } from './locales';

const tag = (l: string) => (l === 'fil' ? 'fil-PH' : l);
export function translate(locale: string, key: string, params?: Record<string, string | number>): string {
  const get = (m: unknown) => key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), m);
  let v = get(MESSAGES[locale]) ?? get(MESSAGES.en);
  if (typeof v !== 'string') return key;
  if (params) for (const [k, p] of Object.entries(params)) v = (v as string).split(`{${k}}`).join(String(p));
  return v as string;
}
const decSep = (l: string) => new Intl.NumberFormat(tag(l)).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.';
const groupInt = (l: string, digits: string) => {
  const g = new Intl.NumberFormat(tag(l)).formatToParts(1000000).find((p) => p.type === 'group')?.value ?? ',';
  return digits.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, g);
};
/** Group digits of a decimal string without converting to float. */
export function formatDecimal(locale: string, value: string, maxFraction = 8, minFraction = 0) {
  const s = String(value ?? '0');
  const neg = s.startsWith('-');
  const [i, f = ''] = (neg ? s.slice(1) : s).split('.');
  let frac = f.slice(0, maxFraction).replace(/0+$/, '');
  if (frac.length < minFraction) frac = frac.padEnd(minFraction, '0');
  return `${neg ? '-' : ''}${groupInt(locale, i || '0')}${frac ? decSep(locale) + frac : ''}`;
}
export function formatMoney(locale: string, value: string, currency: string) {
  let parts: Intl.NumberFormatPart[] = [];
  try { parts = new Intl.NumberFormat(tag(locale), { style: 'currency', currency }).formatToParts(1); } catch { /* unknown currency */ }
  const sym = parts.find((p) => p.type === 'currency')?.value ?? currency;
  const before = parts.length === 0 || parts.findIndex((p) => p.type === 'currency') < parts.findIndex((p) => p.type === 'integer');
  const n = formatDecimal(locale, value, 8, 2);
  return before ? `${sym}\u00a0${n}` : `${n}\u00a0${sym}`;
}
export const pickLocale = (pref?: string | null) => {
  const sys = (pref || Intl.DateTimeFormat().resolvedOptions().locale || 'en').replace('_', '-');
  if ((LOCALES as readonly string[]).includes(sys)) return sys;
  if (/^zh-(Hant|TW|HK|MO)/i.test(sys)) return 'zh-Hant';
  const base = sys.split('-')[0];
  return base === 'tl' ? 'fil' : (LOCALES as readonly string[]).includes(base) ? base : 'en';
};

export interface I18n { locale: string; rtl: boolean; t: (k: string, p?: Record<string, string | number>) => string; num: (v: string, max?: number) => string; money: (v: string, c: string) => string; date: (d: string) => string; pct: (bps: number) => string }
const Ctx = createContext<I18n | null>(null);
export function I18nProvider({ locale, children }: { locale: string; children: React.ReactNode }) {
  const v = useMemo<I18n>(() => ({
    locale, rtl: RTL.has(locale),
    t: (k, p) => translate(locale, k, p),
    num: (val, max) => formatDecimal(locale, val, max),
    money: (val, c) => formatMoney(locale, val, c),
    date: (d) => new Intl.DateTimeFormat(tag(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)),
    pct: (bps) => new Intl.NumberFormat(tag(locale), { style: 'percent', maximumFractionDigits: 2 }).format(bps / 10000),
  }), [locale]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}
export const useI18n = () => { const v = useContext(Ctx); if (!v) throw new Error('I18nProvider missing'); return v; };
