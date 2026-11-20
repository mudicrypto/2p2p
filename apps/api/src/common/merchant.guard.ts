import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyMerchantRequest } from '@p2p/core';
import { DomainError } from '@p2p/shared';
import { CTX, type Ctx } from './ctx';

export const MERCHANT_SCOPE = 'merchantScope';
/** Required API-key scope for a merchant route. Routes without one are refused (fail closed). */
export const Scope = (s: string) => SetMetadata(MERCHANT_SCOPE, s);

/**
 * HMAC merchant authentication: X-P2P-Key, X-P2P-Timestamp (unix ms), X-P2P-Signature =
 * hex HMAC-SHA256(secret, `${timestamp}\n${METHOD}\n${originalUrl}\n${rawBody}`).
 */
@Injectable()
export class MerchantHmacGuard implements CanActivate {
  constructor(@Inject(CTX) private ctx: Ctx, private reflector: Reflector) {}
  async canActivate(c: ExecutionContext) {
    const req = c.switchToHttp().getRequest();
    const scope = this.reflector.getAllAndOverride<string>(MERCHANT_SCOPE, [c.getHandler(), c.getClass()]);
    if (!scope) throw new DomainError('FORBIDDEN', 'no scope declared');
    const body = req.rawBody ? req.rawBody.toString('utf8') : '';
    const r = await verifyMerchantRequest(this.ctx, {
      keyId: req.headers['x-p2p-key'], timestamp: req.headers['x-p2p-timestamp'], signature: req.headers['x-p2p-signature'],
      method: req.method, path: req.originalUrl, body,
    }, scope);
    req.user = r.user;
    req.merchantKey = r.keyId;
    return true;
  }
}
