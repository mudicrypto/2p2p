import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom, Observable } from 'rxjs';
import { withIdempotency, unwrapReplay } from '@p2p/core';
import { CTX, type Ctx } from './ctx';

export const NO_IDEMPOTENCY = 'noIdempotency';
/** Opt out (login/logout/webhooks use their own dedupe). */
export const NoIdempotency = () => SetMetadata(NO_IDEMPOTENCY, true);

/** Every mutating endpoint requires an Idempotency-Key and replays the stored result on retry (spec 0.4). */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(CTX) private ctx: Ctx, private reflector: Reflector) {}
  intercept(c: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (c.getType() !== 'http') return next.handle();
    const req = c.switchToHttp().getRequest();
    const res = c.switchToHttp().getResponse();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next.handle();
    if (this.reflector.getAllAndOverride<boolean>(NO_IDEMPOTENCY, [c.getHandler(), c.getClass()])) return next.handle();
    const key = req.headers['idempotency-key'] as string;
    const scope = req.user?.id ?? `ip:${req.ip}`;
    return from((async () => {
      const r = unwrapReplay(await withIdempotency(this.ctx.db, scope, key, { m: req.method, p: req.path, b: req.body }, async () => {
        const body = await lastValueFrom(next.handle(), { defaultValue: null });
        return { status: res.statusCode ?? 200, body };
      }));
      if (r.replayed) res.setHeader('Idempotent-Replayed', 'true');
      return r.body;
    })());
  }
}
