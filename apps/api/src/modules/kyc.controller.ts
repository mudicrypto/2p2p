import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { startKyc, kycStatus, handleKycWebhook, type User } from '@p2p/core';
import { DomainError } from '@p2p/shared';
import { CTX, type Ctx } from '../common/ctx';
import { CurrentUser, Public } from '../common/auth.guard';
import { NoIdempotency } from '../common/idempotency.interceptor';
import { RateLimit } from '../common/rate-limit.guard';
import { Zod } from '../common/zod';

const StartKycSchema = z.object({ level: z.number().int().min(1).max(3) });
const DevApproveSchema = z.object({ providerRef: z.string().min(1), status: z.enum(['approved', 'rejected', 'pending']).default('approved'), fullName: z.string().max(200).optional(), dob: z.string().optional(), rejectReason: z.string().optional() });

const headersOf = (req: any): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : (v as string | undefined)]));

@Controller('v1')
export class KycController {
  constructor(@Inject(CTX) private ctx: Ctx) {}

  @Post('kyc/start') @RateLimit(10)
  start(@CurrentUser() u: User, @Body(new Zod(StartKycSchema, 'StartKyc')) b: z.infer<typeof StartKycSchema>) {
    return startKyc(this.ctx, u, b.level);
  }

  @Get('kyc/status')
  status(@CurrentUser() u: User) { return kycStatus(this.ctx, u.id); }

  /** Provider webhook: signature over the raw body; deduped on the provider event id. */
  @Public() @NoIdempotency() @Post('webhooks/kyc') @HttpCode(200)
  webhook(@Req() req: any) {
    const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body ?? {});
    return handleKycWebhook(this.ctx, raw, headersOf(req));
  }

  /** Mock-mode only: simulate the provider's review decision and deliver the signed webhook. */
  @Post('dev/kyc/approve') @HttpCode(200)
  async devApprove(@Body(new Zod(DevApproveSchema)) b: z.infer<typeof DevApproveSchema>) {
    const m = this.ctx.providers.mocks;
    if (!m || this.ctx.providers.mode !== 'mock' || process.env.NODE_ENV === 'production' || this.ctx.providers.kyc !== m.kyc) throw new DomainError('FORBIDDEN', 'dev helpers disabled');
    const wh = m.kyc.simulateReview(b.providerRef, { status: b.status, fullName: b.fullName, dob: b.dob, rejectReason: b.rejectReason });
    return handleKycWebhook(this.ctx, wh.body, wh.headers);
  }
}
