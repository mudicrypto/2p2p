import type { PaymentVerifier } from './interfaces';
import { PixVerifier, UpiVerifier, OpenBankingVerifier, SpeiVerifier, SbpVerifier, MpesaVerifier, PromptPayVerifier } from './verifiers/rails';
export { REF_RE, amountMinor, hmacOk } from './verifiers/base';
export * from './verifiers/rails';

/** Rails with API-based payment verification (M10). */
export const VERIFIER_RAILS = ['PIX', 'UPI', 'SEPA_INSTANT', 'FASTER_PAYMENTS', 'SPEI', 'SBP', 'MPESA', 'PROMPTPAY'] as const;
const FACTORY: Record<string, () => PaymentVerifier> = {
  PIX: () => new PixVerifier(), UPI: () => new UpiVerifier(), SEPA_INSTANT: () => new OpenBankingVerifier('SEPA_INSTANT', 'EUR'),
  FASTER_PAYMENTS: () => new OpenBankingVerifier('FASTER_PAYMENTS', 'GBP'), SPEI: () => new SpeiVerifier(), SBP: () => new SbpVerifier(),
  MPESA: () => new MpesaVerifier(), PROMPTPAY: () => new PromptPayVerifier(),
};
/** Real adapter only when its webhook secret is configured; otherwise the registry keeps the mock. TODO(provider): sandbox keys per rail. */
export function createRealVerifier(rail: string): PaymentVerifier | null {
  return process.env[`${rail}_WEBHOOK_SECRET`] && FACTORY[rail] ? FACTORY[rail]() : null;
}
export const createRailAdapter = (rail: string): PaymentVerifier | null => FACTORY[rail]?.() ?? null;
