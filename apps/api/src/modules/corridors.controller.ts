import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { quoteCorridor, createCorridor, getCorridor, type User } from '@p2p/core';
import { zFiat } from '@p2p/shared';
import { CTX, type Ctx } from '../common/ctx';
import { CurrentUser } from '../common/auth.guard';
import { Zod } from '../common/zod';

const CorridorSchema = z.object({ fromFiat: zFiat, toFiat: zFiat, fiatIn: z.string().regex(/^\d+(\.\d+)?$/), payInType: z.string().optional(), receivePaymentMethodId: z.string().uuid() });

@Controller('v1/corridors')
export class CorridorsController {
  constructor(@Inject(CTX) private ctx: Ctx) {}
  @Post('quote') @HttpCode(200)
  async quote(@CurrentUser() u: User, @Body(new Zod(CorridorSchema, 'Corridor')) b: z.infer<typeof CorridorSchema>) {
    const q = await quoteCorridor(this.ctx, u, b);
    return { ...q.display, fromFiat: q.fromFiat, toFiat: q.toFiat, buyAdId: q.legA.ad.id, sellAdId: q.legB.ad.id };
  }
  @Post()
  create(@CurrentUser() u: User, @Body(new Zod(CorridorSchema)) b: z.infer<typeof CorridorSchema>) { return createCorridor(this.ctx, u, b); }
  @Get(':id')
  get(@CurrentUser() u: User, @Param('id', new Zod(z.string().uuid())) id: string) { return getCorridor(this.ctx, u.id, id); }
}
