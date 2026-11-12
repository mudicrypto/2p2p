/** Stable machine-readable error codes shared by API and clients. */
export const ERROR_CODES = [
  'VALIDATION', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'IDEMPOTENCY_MISMATCH',
  'INSUFFICIENT_FUNDS', 'LIMIT_EXCEEDED', 'ILLEGAL_TRANSITION', 'COUNTRY_BLOCKED', 'TIER_REQUIRED',
  'TWO_FA_REQUIRED', 'TWO_FA_INVALID', 'RATE_LIMITED', 'RISK_BLOCKED', 'SANCTIONED', 'WITHDRAWALS_PAUSED',
  'AD_UNAVAILABLE', 'SELF_TRADE', 'ACCOUNT_FROZEN', 'COOLDOWN',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class DomainError extends Error {
  constructor(public readonly code: ErrorCode, message?: string, public readonly details?: unknown) {
    super(message ?? code);
  }
}
