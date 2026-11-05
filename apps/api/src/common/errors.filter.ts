import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { DomainError, TransitionError, type ErrorCode } from '@p2p/shared';
import { ZodError } from 'zod';
import { redactPii } from '@p2p/core';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, IDEMPOTENCY_MISMATCH: 422,
  INSUFFICIENT_FUNDS: 422, LIMIT_EXCEEDED: 422, ILLEGAL_TRANSITION: 409, COUNTRY_BLOCKED: 451, TIER_REQUIRED: 403,
  TWO_FA_REQUIRED: 401, TWO_FA_INVALID: 401, RATE_LIMITED: 429, RISK_BLOCKED: 403, SANCTIONED: 403, WITHDRAWALS_PAUSED: 503,
  AD_UNAVAILABLE: 409, SELF_TRADE: 422, ACCOUNT_FROZEN: 403, COOLDOWN: 403,
};

@Catch()
export class ErrorsFilter implements ExceptionFilter {
  private log = new Logger('Errors');
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (!res?.status) return; // ws context
    if (e instanceof DomainError) return res.status(STATUS[e.code] ?? 400).json({ error: e.code, message: e.message, details: e.details });
    if (e instanceof TransitionError) return res.status(409).json({ error: 'ILLEGAL_TRANSITION', message: e.message });
    // Duck-typed: schemas from @p2p/shared may come from a different zod instance than this package's.
    if (e instanceof ZodError || (e as { name?: string })?.name === 'ZodError') return res.status(400).json({ error: 'VALIDATION', message: 'invalid request', details: (e as ZodError).flatten() });
    if (e instanceof HttpException) return res.status(e.getStatus()).json({ error: e.getStatus() === 404 ? 'NOT_FOUND' : 'HTTP_ERROR', message: e.message });
    this.log.error(redactPii(String((e as Error)?.stack ?? e)));
    return res.status(500).json({ error: 'INTERNAL', message: 'internal error' });
  }
}
