/**
 * Money utilities. All amounts are bigint in minor units. Floats are never used.
 * Decimal strings are the only human/wire representation.
 */
export class MoneyError extends Error {}

const DEC_RE = /^(-)?(\d+)(?:\.(\d+))?$/;

/** Parse a decimal string ("12.345") into minor units. Rejects excess precision instead of rounding. */
export function toMinor(value: string, decimals: number): bigint {
  if (typeof value !== 'string') throw new MoneyError('amount must be a decimal string');
  const m = DEC_RE.exec(value.trim());
  if (!m) throw new MoneyError(`invalid amount: ${value}`);
  const [, neg, int, frac = ''] = m;
  if (frac.length > decimals) throw new MoneyError(`too many decimals (max ${decimals})`);
  const v = BigInt(int + frac.padEnd(decimals, '0'));
  return neg ? -v : v;
}

/** Format minor units as a canonical decimal string (trailing zeros trimmed). */
export function fromMinor(value: bigint, decimals: number, opts: { trim?: boolean } = {}): string {
  const trim = opts.trim ?? true;
  const neg = value < 0n;
  let s = (neg ? -value : value).toString();
  if (decimals === 0) return (neg ? '-' : '') + s;
  s = s.padStart(decimals + 1, '0');
  const int = s.slice(0, -decimals);
  let frac = s.slice(-decimals);
  if (trim) frac = frac.replace(/0+$/, '');
  return (neg ? '-' : '') + int + (frac ? '.' + frac : '');
}

export type Rounding = 'floor' | 'ceil' | 'half_up';

/** Integer division with explicit rounding (for non-negative numerators/denominators). */
export function divRound(n: bigint, d: bigint, mode: Rounding = 'floor'): bigint {
  if (d === 0n) throw new MoneyError('division by zero');
  if (n < 0n || d < 0n) throw new MoneyError('divRound expects non-negative operands');
  const q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  if (mode === 'floor') return q;
  if (mode === 'ceil') return q + 1n;
  return r * 2n >= d ? q + 1n : q;
}

/** Apply basis points: amount * bps / 10000. */
export function applyBps(amount: bigint, bps: number | bigint, mode: Rounding = 'floor'): bigint {
  return divRound(amount * BigInt(bps), 10_000n, mode);
}

export const pow10 = (n: number): bigint => 10n ** BigInt(n);

/**
 * Prices are stored as fiat minor units per ONE whole crypto unit, scaled by PRICE_SCALE
 * so that sub-minor precision is preserved for cheap fiats/expensive assets.
 * price_scaled = fiat_minor_per_whole_crypto * 10^PRICE_SCALE_DECIMALS
 */
export const PRICE_SCALE_DECIMALS = 8;
export const PRICE_SCALE = pow10(PRICE_SCALE_DECIMALS);

/** Parse a human price ("1.0234" EUR per USDT) into scaled price units. */
export function parsePrice(value: string, fiatDecimals: number): bigint {
  return toMinor(value, fiatDecimals + PRICE_SCALE_DECIMALS);
}
export function formatPrice(price: bigint, fiatDecimals: number): string {
  return fromMinor(price, fiatDecimals + PRICE_SCALE_DECIMALS);
}

/** fiat_minor = crypto_minor * price / (10^cryptoDecimals * PRICE_SCALE) */
export function cryptoToFiat(cryptoMinor: bigint, price: bigint, cryptoDecimals: number, mode: Rounding = 'half_up'): bigint {
  return divRound(cryptoMinor * price, pow10(cryptoDecimals) * PRICE_SCALE, mode);
}

/** crypto_minor = fiat_minor * 10^cryptoDecimals * PRICE_SCALE / price  (floor: never give out more crypto than paid for) */
export function fiatToCrypto(fiatMinor: bigint, price: bigint, cryptoDecimals: number, mode: Rounding = 'floor'): bigint {
  if (price <= 0n) throw new MoneyError('price must be positive');
  return divRound(fiatMinor * pow10(cryptoDecimals) * PRICE_SCALE, price, mode);
}

/** Apply a margin in bps (may be negative) to a price. */
export function applyMargin(price: bigint, marginBps: number): bigint {
  return divRound(price * BigInt(10_000 + marginBps), 10_000n, 'half_up');
}

export function sumBig(xs: Iterable<bigint>): bigint {
  let s = 0n;
  for (const x of xs) s += x;
  return s;
}
export const minBig = (a: bigint, b: bigint) => (a < b ? a : b);
export const maxBig = (a: bigint, b: bigint) => (a > b ? a : b);

/** Median of bigints (lower median for even counts to stay integral, averaged with floor). */
export function medianBig(xs: bigint[]): bigint {
  if (!xs.length) throw new MoneyError('median of empty list');
  const s = [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2n;
}

/** JSON-safe serialization of bigints. */
export function jsonBigint(_k: string, v: unknown) {
  return typeof v === 'bigint' ? v.toString() : v;
}
