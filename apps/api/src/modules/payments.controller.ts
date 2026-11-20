import { Body, Controller, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { handlePaymentWebhook, handleIncomingPayment, getOrderFor, type User } from '@p2p/core';
import { CTX, type Ctx } from '../common/ctx';
import { CurrentUser, Public } from '../common/auth.guard';
import { NoIdempotency } from '../common/idempotency.interceptor';
import { Zod } from '../common/zod';

@Controller('v1')
export class PaymentsController {
  constructor(@Inject(CTX) private ctx: Ctx) {}

  /** PSP / open-banking push notifications per rail. Dedupe is by (rail, providerRef). */
  @Public() @NoIdempotency() @Post('webhooks/payments/:rail') @HttpCode(200)
  webhook(@Param('rail') rail: string, @Req() req: any) {
    const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    return handlePaymentWebhook(this.ctx, rail.toUpperCase(), raw, req.headers);
  }

  /** Mock-only: simulate the buyer's fiat payment arriving on the order's rail. */
  @Post('dev/payments/simulate') @HttpCode(200)
  async simulate(@CurrentUser() u: User, @Body(new Zod(z.object({ orderId: z.string().uuid(), payerName: z.string().min(2), amountMinor: z.string().regex(/^\d+$/).optional(), reference: z.string().optional() }))) b: any) {
    if (this.ctx.providers.mode !== 'mock' || process.env.NODE_ENV === 'production') return { ok: false };
    const o = await getOrderFor(this.ctx, u.id, b.orderId);
    return handleIncomingPayment(this.ctx, o.id, { providerRef: `sim-${crypto.randomUUID()}`, rail: o.paymentType ?? 'MOCK', fiat: o.fiat, amount: b.amountMinor ? BigInt(b.amountMinor) : o.fiatAmount, reference: b.reference ?? o.referenceCode, payerName: b.payerName, receivedAt: new Date() });
  }
}
