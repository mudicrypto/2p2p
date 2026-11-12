import { CallHandler, CanActivate, ExecutionContext, Inject, Injectable, NestInterceptor, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { tap, catchError, throwError } from 'rxjs';
import { authenticateAdmin, can, audit, ipAllowed, safeEqual } from '@p2p/core';
import { DomainError } from '@p2p/shared';
import { CTX, type Ctx } from './ctx';

export const ADMIN_COOKIE = 'asid';
export const ADMIN_CSRF = 'acsrf';
export const PERM = 'adminPerm';
export const ADMIN_PUBLIC = 'adminPublic';
/** Required admin permission (see PERMISSIONS in core/admin.ts). */
export const Perm = (p: string) => SetMetadata(PERM, p);
export const AdminPublic = () => SetMetadata(ADMIN_PUBLIC, true);
export const CurrentAdmin = createParamDecorator((_d, c: ExecutionContext) => c.switchToHttp().getRequest().admin);

export function adminToken(req: any): { token?: string; viaCookie: boolean } {
  const h = req.headers['x-admin-token'] as string | undefined;
  if (h) return { token: h, viaCookie: false };
  return { token: req.cookies?.[ADMIN_COOKIE], viaCookie: true };
}

/** Separate admin auth: IP allowlist + session + completed WebAuthn + permission + CSRF for cookies. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(CTX) private ctx: Ctx, private reflector: Reflector) {}
  async canActivate(c: ExecutionContext) {
    const req = c.switchToHttp().getRequest();
    if (!ipAllowed(req.ip)) throw new DomainError('FORBIDDEN', 'IP not allowed');
    if (this.reflector.getAllAndOverride<boolean>(ADMIN_PUBLIC, [c.getHandler(), c.getClass()])) return true;
    const { token, viaCookie } = adminToken(req);
    const s = token ? await authenticateAdmin(this.ctx, token, req.ip) : null;
    if (!s) throw new DomainError('UNAUTHORIZED', 'admin login with hardware key required');
    if (viaCookie && !['GET', 'HEAD'].includes(req.method)) {
      const h = req.headers['x-csrf-token']; const ck = req.cookies?.[ADMIN_CSRF];
      if (!h || !ck || !safeEqual(String(h), String(ck))) throw new DomainError('FORBIDDEN', 'CSRF token mismatch');
    }
    const perm = this.reflector.getAllAndOverride<string>(PERM, [c.getHandler(), c.getClass()]);
    if (!perm) throw new DomainError('FORBIDDEN', 'no permission declared'); // fail closed
    if (!can(s.admin.roles, perm)) {
      await audit(this.ctx.db, { actorType: 'admin', actorId: s.admin.id, action: 'admin.permission_denied', subjectType: 'route', subjectId: `${req.method} ${req.route?.path}`, after: { perm }, ip: req.ip });
      throw new DomainError('FORBIDDEN', `missing permission ${perm}`);
    }
    req.admin = s.admin;
    return true;
  }
}

/** Catch-all: every mutating admin request is written to the audit log (success and failure). */
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(@Inject(CTX) private ctx: Ctx) {}
  intercept(c: ExecutionContext, next: CallHandler) {
    const req = c.switchToHttp().getRequest();
    if (['GET', 'HEAD'].includes(req.method) || !req.admin) return next.handle();
    const base = { actorType: 'admin' as const, actorId: req.admin.id, subjectType: 'route', subjectId: `${req.method} ${req.route?.path}`, ip: req.ip };
    const body = { params: req.params, body: redactBody(req.body) };
    return next.handle().pipe(
      tap(() => void audit(this.ctx.db, { ...base, action: 'admin.request', after: { ...body, ok: true } })),
      catchError((e) => { void audit(this.ctx.db, { ...base, action: 'admin.request', after: { ...body, ok: false, error: (e as Error).message } }); return throwError(() => e); }),
    );
  }
}
const redactBody = (b: any) => (b && typeof b === 'object' ? Object.fromEntries(Object.entries(b).map(([k, v]) => [k, /password|secret|token|response/i.test(k) ? '[redacted]' : v])) : b);
