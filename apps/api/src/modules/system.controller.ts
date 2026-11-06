import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { getConfig, ipAllowed, safeEqual } from '@p2p/core';
import { registry, withdrawalsPaused, invariantOk } from '../common/metrics';
import { REDIS } from '../common/ctx';
import { sql } from '@p2p/db';
import { CTX, type Ctx } from '../common/ctx';
import { Public } from '../common/auth.guard';
import { buildOpenApi } from '../openapi';
import { ROUTES } from '../routes';

@Controller()
export class SystemController {
  constructor(@Inject(CTX) private ctx: Ctx, @Inject(REDIS) private redis: any) {}
  @Public() @Get('healthz') async health() {
    await this.ctx.db.execute(sql`select 1`);
    return { ok: true };
  }
  /** Prometheus scrape endpoint: METRICS_TOKEN bearer or allowlisted scraper IP. */
  @Public() @Get('metrics')
  async metrics(@Req() req: any, @Res() res: Response) {
    const tok = process.env.METRICS_TOKEN;
    const auth = String(req.headers.authorization ?? '');
    if (!(tok && safeEqual(auth, `Bearer ${tok}`)) && !ipAllowed(req.ip, process.env.METRICS_IP_ALLOWLIST ?? '127.0.0.1,::1,::ffff:127.0.0.1')) { res.status(403).end(); return; }
    withdrawalsPaused.set((await getConfig(this.ctx.db, 'withdrawals')).paused ? 1 : 0);
    const last = this.redis ? await this.redis.get('invariants:last').catch(() => null) : null;
    if (last) invariantOk.set(JSON.parse(last).ok ? 1 : 0);
    res.setHeader('content-type', registry.contentType);
    res.send(await registry.metrics());
  }
  @Public() @Get('v1/openapi.json') openapi() { return buildOpenApi(ROUTES()); }
}
