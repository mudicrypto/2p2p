import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type Redis from 'ioredis';
import { DomainError } from '@p2p/shared';
import { REDIS } from './ctx';

export const RATE = 'rateLimit';
/** Per-route override: requests per minute per IP and per user. */
export const RateLimit = (perMin: number) => SetMetadata(RATE, perMin);

/** Fixed-window limiter in Redis, per IP and per user (spec 10). */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(@Inject(REDIS) private redis: Redis | null, private reflector: Reflector) {}
  async canActivate(c: ExecutionContext) {
    if (!this.redis || process.env.RATE_LIMIT_DISABLED === '1') return true;
    const req = c.switchToHttp().getRequest();
    const limit = this.reflector.getAllAndOverride<number>(RATE, [c.getHandler(), c.getClass()]) ?? Number(process.env.RATE_LIMIT_PER_MIN ?? 300);
    const win = Math.floor(Date.now() / 60_000);
    const route = `${req.method}:${req.route?.path ?? req.path}`;
    const keys = [`rl:ip:${req.ip}:${route}:${win}`];
    if (req.user?.id) keys.push(`rl:u:${req.user.id}:${route}:${win}`);
    const m = this.redis.multi();
    for (const k of keys) m.incr(k).expire(k, 70);
    const out = await m.exec();
    const counts = (out ?? []).filter((_, i) => i % 2 === 0).map(([, v]) => Number(v));
    if (counts.some((n) => n > limit)) throw new DomainError('RATE_LIMITED', 'too many requests');
    return true;
  }
}
