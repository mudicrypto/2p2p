/** Float-free decimal helpers for display-side conversions (server is authoritative for amounts). */
const D = 8;
const P = 10n ** BigInt(D);
export function toScaled(v: string): bigint {
  if (!/^\d*(\.\d*)?$/.test(v) || v === '' || v === '.') return 0n;
  const [i, f = ''] = v.split('.');
  return BigInt(i || '0') * P + BigInt((f + '0'.repeat(D)).slice(0, D) || '0');
}
export function fromScaled(v: bigint, keep = 6): string {
  const neg = v < 0n; const a = neg ? -v : v;
  const i = a / P; const f = (a % P).toString().padStart(D, '0').slice(0, keep).replace(/0+$/, '');
  return `${neg ? '-' : ''}${i}${f ? `.${f}` : ''}`;
}
export const cryptoFor = (fiat: string, price: string) => (!fiat || toScaled(price) === 0n ? '' : fromScaled((toScaled(fiat) * P) / toScaled(price)));
export const fiatFor = (crypto: string, price: string) => (!crypto || !price ? '' : fromScaled((toScaled(crypto) * toScaled(price)) / P, 2));
export const inRange = (v: string, min: string, max: string) => { const x = toScaled(v); return x >= toScaled(min) && x <= toScaled(max); };
export const cleanDecimal = (s: string) => { const x = s.replace(',', '.').replace(/[^\d.]/g, ''); const [i, ...r] = x.split('.'); return r.length ? `${i}.${r.join('')}` : i; };
