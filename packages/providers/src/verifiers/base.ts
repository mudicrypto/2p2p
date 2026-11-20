import { createHmac, timingSafeEqual } from 'node:crypto';
import { toMinor } from '@p2p/shared';
import type { IncomingPayment, PaymentCheckRequest, PaymentVerifier } from '../interfaces';

export const REF_RE = /P2P[A-HJ-NP-Z2-9]{8}/;
export const decimals = (fiat: string) => (['JPY', 'KRW', 'VND', 'CLP', 'XOF', 'XAF', 'UGX', 'RWF'].includes(fiat) ? 0 : 2);
/** Provider decimal amount ("92.5", 92.5 or "92,50") -> minor units, without float math. */
export function amountMinor(v: string | number, fiat: string): bigint {
  const s = typeof v === 'number' ? v.toFixed(decimals(fiat)) : v.replace(',', '.').trim();
  const [i, f = ''] = s.split('.');
  return toMinor(`${i}.${f.slice(0, decimals(fiat)).padEnd(decimals(fiat), '0')}`.replace(/\.$/, ''), decimals(fiat));
}
export function hmacOk(secret: string | undefined, body: string, sig: string | undefined, algo: 'sha256' | 'sha512' = 'sha256', enc: 'hex' | 'base64' = 'hex') {
  if (!secret || !sig) return false;
  const exp = createHmac(algo, secret).update(body).digest(enc);
  const a = Buffer.from(exp); const b = Buffer.from(sig.replace(/^sha256=/, ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Base for real rail adapters. Subclasses map the provider's payload to IncomingPayment.
 * Polling (`findPayment`) is implemented where the provider offers a statement/transactions API.
 */
export abstract class RailVerifier implements PaymentVerifier {
  abstract readonly rail: string;
  protected abstract secretEnv: string;
  protected sigHeader = 'x-signature';
  abstract parseWebhook(rawBody: string): IncomingPayment;
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>) {
    return hmacOk(process.env[this.secretEnv], rawBody, headers[this.sigHeader]);
  }
  async findPayment(_req: PaymentCheckRequest): Promise<IncomingPayment | null> {
    return null; // webhook-driven rails
  }
}
