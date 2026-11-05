import en from '../locales/en.json';

/** Supported locales (spec 2b). RTL: ar, fa, ur. */
export const LOCALES = ['en', 'es', 'pt', 'ru', 'uk', 'tr', 'ar', 'fa', 'ur', 'hi', 'bn', 'id', 'ms', 'vi', 'th', 'fil', 'zh-Hant', 'ko', 'ja', 'fr', 'de', 'it', 'pl', 'sw', 'ha', 'yo'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const RTL_LOCALES = new Set<Locale>(['ar', 'fa', 'ur']);
export const dir = (l: string) => (RTL_LOCALES.has(l as Locale) ? 'rtl' : 'ltr');
export const isLocale = (l: string): l is Locale => (LOCALES as readonly string[]).includes(l);
export type Messages = typeof en;

const loaders: Record<string, () => Promise<{ default: Messages }>> = {};
/** Register lazily-loaded locale bundles (filled by locales/index.ts). */
export function registerLocale(l: string, loader: () => Promise<{ default: Messages }>) { loaders[l] = loader; }
registerLocale('en', async () => ({ default: en }));

export async function loadMessages(l: string): Promise<Messages> {
  const loader = loaders[l] ?? loaders.en;
  return (await loader()).default;
}
export const enMessages = en;

/** Lookup "a.b.c" with {param} interpolation; falls back to English, then the key. */
export function translate(messages: Messages, key: string, params?: Record<string, string | number>): string {
  const get = (m: unknown) => key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), m);
  let s = get(messages) ?? get(en);
  if (typeof s !== 'string') return key;
  if (params) s = (s as string).replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
  return s as string;
}

/** Intl locale tag for formatting (fil -> fil-PH etc. handled by Intl). */
const intlTag = (l: string) => (l === 'zh-Hant' ? 'zh-Hant-TW' : l);

/** Format a canonical decimal string by locale without converting to float (keeps all digits). */
export function formatDecimal(l: string, value: string, opts: { maxFraction?: number; minFraction?: number } = {}) {
  const neg = value.startsWith('-');
  const [int, frac = ''] = (neg ? value.slice(1) : value).split('.');
  const parts = new Intl.NumberFormat(intlTag(l)).formatToParts(12345.6);
  const group = parts.find((p) => p.type === 'group')?.value ?? ',';
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
  // Locale digits (e.g. Arabic-Indic) via formatting single digits.
  const digitFmt = new Intl.NumberFormat(intlTag(l), { useGrouping: false });
  const loc = (s: string) => s.replace(/\d/g, (d) => digitFmt.format(Number(d)));
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u0000');
  let f = frac.slice(0, opts.maxFraction ?? frac.length);
  if (opts.minFraction && f.length < opts.minFraction) f = f.padEnd(opts.minFraction, '0');
  return (neg ? '-' : '') + loc(grouped).replace(/\u0000/g, group) + (f ? decimal + loc(f) : '');
}
export function formatMoney(l: string, value: string, currency: string, minorUnits = 2) {
  const n = formatDecimal(l, value, { minFraction: minorUnits, maxFraction: minorUnits });
  let sym = currency;
  try { sym = new Intl.NumberFormat(intlTag(l), { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency; } catch { /* unknown code */ }
  return dir(l) === 'rtl' ? `${n} ${sym}` : `${sym} ${n}`;
}
export const formatDate = (l: string, d: string | Date) => new Intl.DateTimeFormat(intlTag(l), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
export const formatPercentBps = (l: string, bps: number) => new Intl.NumberFormat(intlTag(l), { style: 'percent', maximumFractionDigits: 2 }).format(bps / 10000);
