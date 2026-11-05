import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from '@p2p/db';
import { CTX, type Ctx } from '../common/ctx';
import { Public } from '../common/auth.guard';
import { buildOpenApi } from '../openapi';
import { ROUTES } from '../routes';

@Controller()
export class SystemController {
  constructor(@Inject(CTX) private ctx: Ctx) {}
  @Public() @Get('healthz') async health() {
    await this.ctx.db.execute(sql`select 1`);
    return { ok: true };
  }
  @Public() @Get('v1/openapi.json') openapi() { return buildOpenApi(ROUTES()); }
}
