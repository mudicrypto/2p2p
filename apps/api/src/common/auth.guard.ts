import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { authenticate, safeEqual } from '@p2p/core';
import { DomainError } from '@p2p/shared';
import { CTX, type Ctx } from './ctx';

export const PUBLIC = 'isPublic';
export const Public = () => SetMetadata(PUBLIC, true);
export const SESSION_COOKIE = 'sid';
export const CSRF_COOKIE = 'csrf';

export function tokenFrom(req: any): { token?: string; viaCookie: boolean } {
  const h = req.headers.authorization as string | undefined;
  if (h?.startsWith('Bearer ')) return { token: h.slice(7), viaCookie: false };
  return { token: req.cookies?.[SESSION_COOKIE], viaCookie: true };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(CTX) private ctx: Ctx, private reflector: Reflector) {}
  async canActivate(c: ExecutionContext) {
    const req = c.switchToHttp().getRequest();
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC, [c.getHandler(), c.getClass()]);
    const { token, viaCookie } = tokenFrom(req);
    if (token) {
      const a = await authenticate(this.ctx, token);
      if (a) { req.user = a.user; req.session = a.session; }
    }
    if (isPublic) return true;
    if (!req.user) throw new DomainError('UNAUTHORIZED', 'login required');
    // CSRF: cookie-authenticated mutations need the double-submit token.
    if (viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const header = req.headers['x-csrf-token'];
      const cookie = req.cookies?.[CSRF_COOKIE];
      if (!header || !cookie || !safeEqual(String(header), String(cookie))) throw new DomainError('FORBIDDEN', 'CSRF token mismatch');
    }
    return true;
  }
}

export const CurrentUser = createParamDecorator((_d, c: ExecutionContext) => c.switchToHttp().getRequest().user);
export const Meta = createParamDecorator((_d, c: ExecutionContext) => {
  const r = c.switchToHttp().getRequest();
  return { ip: r.ip, userAgent: r.headers['user-agent'], fingerprint: r.headers['x-device-fingerprint'] };
});
