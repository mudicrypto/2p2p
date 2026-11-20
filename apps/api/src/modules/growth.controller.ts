import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  promoteAd, merchantStats, bulkAds, merchantPage, priceHistory, telegramStatus, createTelegramLink, unlinkTelegram, handleTelegramUpdate, checkWebhookSecret,
  type BulkAction, type User,
} from '@p2p/core';
import { DomainError, zAsset, zFiat } from '@p2p/shared';
import { CTX, type Ctx } from '../common/ctx';
import { CurrentUser, Public } from '../common/auth.guard';
import { NoIdempotency } from '../common/idempotency.interceptor';
import { RateLimit } from '../common/rate-limit.guard';
import { Zod } from '../common/zod';

const uuid = new Zod(z.string().uuid());
const BulkSchema = z.object({
  adIds: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['pause', 'resume', 'close', 'margin', 'price']),
  marginBps: z.number().int().min(-2000).max(2000).optional(),
  price: z.string().regex(/^\d+(\.\d+)?$/).optional(),
}).refine((b) => (b.action !== 'margin' || b.marginBps !== undefined) && (b.action !== 'price' || !!b.price), 'margin needs marginBps, price needs price');

/** Promoted ads, merchant analytics, bulk ad tools, public merchant pages, price history, Telegram alerts. */
@Controller('v1')
export class GrowthController {
  constructor(@Inject(CTX) private ctx: Ctx) {}

  @Post('ads/:id/promote') @HttpCode(200) @RateLimit(10)
  promote(@CurrentUser() u: User, @Param('id', uuid) id: string, @Body(new Zod(z.object({ days: z.number().int().min(1).max(365) }), 'PromoteAd')) b: { days: number }) {
    return promoteAd(this.ctx, u, id, b.days);
  }
  @Get('me/stats')
  stats(@CurrentUser() u: User, @Query('days') days?: string) { return merchantStats(this.ctx, u, Number(days) || 30); }
  @Post('me/ads/bulk') @HttpCode(200) @RateLimit(20)
  bulk(@CurrentUser() u: User, @Body(new Zod(BulkSchema, 'BulkAds')) b: z.infer<typeof BulkSchema>) {
    const a = (b.action === 'margin' ? { action: 'margin', marginBps: b.marginBps! } : b.action === 'price' ? { action: 'price', price: b.price! } : { action: b.action }) as BulkAction;
    return bulkAds(this.ctx, u, b.adIds, a);
  }

  @Public() @Get('m/:handle')
  page(@Param('handle') handle: string) {
    if (!/^[\p{L}\p{N} _-]{3,40}$/u.test(handle) && !/^[0-9a-f-]{36}$/i.test(handle)) throw new DomainError('NOT_FOUND', 'merchant not found');
    return merchantPage(this.ctx, handle);
  }
  @Public() @Get('market/history')
  history(@Query('asset') asset: string, @Query('fiat') fiat: string, @Query('hours') hours?: string) {
    const a = zAsset.safeParse(asset); const f = zFiat.safeParse(fiat);
    if (!a.success || !f.success) throw new DomainError('VALIDATION', 'asset and fiat required');
    return priceHistory(this.ctx, a.data, f.data, Number(hours) || 24);
  }

  @Get('me/telegram')
  tg(@CurrentUser() u: User) { return telegramStatus(this.ctx, u); }
  @Post('me/telegram/link') @HttpCode(200) @RateLimit(10)
  tgLink(@CurrentUser() u: User) { return createTelegramLink(this.ctx, u); }
  @Delete('me/telegram')
  tgUnlink(@CurrentUser() u: User) { return unlinkTelegram(this.ctx, u); }
  /** Telegram bot webhook (set up by deploy.sh with the derived secret). */
  @Public() @NoIdempotency() @Post('telegram/webhook') @HttpCode(200) @RateLimit(120)
  tgWebhook(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() body: unknown) {
    if (!checkWebhookSecret(secret)) throw new DomainError('UNAUTHORIZED', 'bad secret');
    return handleTelegramUpdate(this.ctx, (body ?? {}) as never);
  }
}
