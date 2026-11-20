import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { openDispute, addEvidence, getDisputeForParticipant, submitFreezeReport, listFreezeReports, fiatDecimals, type User } from '@p2p/core';
import { OpenDisputeSchema, toMinor, fromMinor } from '@p2p/shared';
import { orders, eq } from '@p2p/db';
import { DomainError } from '@p2p/shared';
import { CTX, type Ctx } from '../common/ctx';
import { CurrentUser } from '../common/auth.guard';
import { RateLimit } from '../common/rate-limit.guard';
import { Zod } from '../common/zod';

const uuid = new Zod(z.string().uuid());
const EvidenceSchema = z.object({ fileKey: z.string().min(5).max(256), note: z.string().max(2000).optional() });
const FreezeSchema = z.object({ orderId: z.string().uuid(), bankLetterKey: z.string().min(5).max(256), claimedAmount: z.string().regex(/^\d+(\.\d+)?$/) });

/** User-facing dispute + freeze-report endpoints. Arbiter/admin endpoints live under /v1/admin. */
@Controller('v1')
export class DisputesController {
  constructor(@Inject(CTX) private ctx: Ctx) {}

  @Post('orders/:id/dispute') @RateLimit(10)
  async open(@CurrentUser() u: User, @Param('id', uuid) id: string, @Body(new Zod(OpenDisputeSchema, 'OpenDispute')) b: z.infer<typeof OpenDisputeSchema>) {
    await openDispute(this.ctx, u, id, b);
    return getDisputeForParticipant(this.ctx, u, id);
  }
  @Get('orders/:id/dispute')
  get(@CurrentUser() u: User, @Param('id', uuid) id: string) { return getDisputeForParticipant(this.ctx, u, id); }

  @Post('disputes/:id/evidence') @RateLimit(20)
  evidence(@CurrentUser() u: User, @Param('id', uuid) id: string, @Body(new Zod(EvidenceSchema, 'DisputeEvidence')) b: z.infer<typeof EvidenceSchema>) {
    return addEvidence(this.ctx, u, id, b.fileKey, b.note);
  }

  @Post('freeze-reports') @RateLimit(5)
  async freeze(@CurrentUser() u: User, @Body(new Zod(FreezeSchema, 'FreezeReport')) b: z.infer<typeof FreezeSchema>) {
    const [o] = await this.ctx.db.select({ fiat: orders.fiat }).from(orders).where(eq(orders.id, b.orderId));
    if (!o) throw new DomainError('NOT_FOUND', 'order not found');
    const fd = await fiatDecimals(this.ctx.db, o.fiat);
    const r = await submitFreezeReport(this.ctx, u, { orderId: b.orderId, bankLetterKey: b.bankLetterKey, claimedAmountFiat: toMinor(b.claimedAmount, fd) });
    return { id: r.id, orderId: r.orderId, status: r.status, claimedAmount: fromMinor(r.claimedAmountFiat, fd) };
  }
  @Get('freeze-reports')
  async mine(@CurrentUser() u: User) {
    const rows = await listFreezeReports(this.ctx, { reporterId: u.id });
    return rows.map((r) => ({ id: r.id, orderId: r.orderId, status: r.status, payoutAsset: r.payoutAsset, payoutAmount: r.payoutAmount, reviewNote: r.reviewNote, createdAt: r.createdAt }));
  }
}
