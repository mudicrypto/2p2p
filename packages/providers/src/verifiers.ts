import type { PaymentVerifier } from './interfaces';
/** Rails with API-based payment verification (M10). Real adapters are added in verifiers/*.ts. */
export const VERIFIER_RAILS = ['PIX', 'UPI', 'SEPA_INSTANT', 'FASTER_PAYMENTS', 'SPEI', 'SBP', 'MPESA', 'PROMPTPAY'] as const;
export function createRealVerifier(_rail: string): PaymentVerifier | null {
  return null; // filled in M10
}
