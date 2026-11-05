import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  createAd, setAdStatus, updateAdPricing, myAds, presentAd, fiatDecimals, orderBook, listMyOrders, getOrderFor, presentOrder, releaseOrder, markPaid,
  applyMerchant, lockSecurityDeposit, getMerchantProfile, createApiKey, revokeApiKey, listApiKeys, MERCHANT_SCOPES, type User,
} from '@p2p/core';
import { CreateAdSchema, OrderBookQuerySchema, DomainError, zAsset, fromMinor, assetDecimals, type Asset } from '@p2p/shared';
import { CTX, type Ctx } from '../common/ctx';
import { CurrentUser, Public } from '../common/auth.guard';
import { RateLimit } from '../common/rate-limit.guard';
import { Zod } from '../common/zod';
import { MerchantHmacGuard, Scope } from '../common/merchant.guard';

const uuid = new Zod(z.string().uuid());
const BulkCreate = z.object({ ads: z.array(z.unknown()).min(1).max(50) });
const BulkPatch = z.object({ ads: z.array(z.object({ id: z.string().uuid(), status: z.enum(['active', 'paused', 'closed']).optional(), price: z.string().regex(/^\d+(\.\d+)?$/).optional(), marginBps: z.number().int().min(-2000).max(2000).optional() })).min(1).max(100) });

const err = (e: unknown) => (e instanceof DomainError ? { error: e.code, message: e.message } : { error: 'VALIDATION', message: (e as Error).message });

/** HMAC-signed merchant API (spec 10). Docs: docs/merchant-api.md. */
@Public() // session auth skipped; MerchantHmacGuard authenticates every route
@UseGuards(MerchantHmacGuard)
@Controller('v1/merchant')
export class MerchantApiController {
  constructor(@Inject(CTX) private ctx: Ctx) {}

  @Scope('ads:read') @Get('book') @RateLimit(600)
  book(@Query(new Zod(OrderBookQuerySchema)) q: z.infer<typeof OrderBookQuerySchema>) { return orderBook(this.ctx, q); }
  @Scope('ads:read') @Get('ads') @RateLimit(600)
  ads(@CurrentUser() u: User) { return myAds(this.ctx, u.id); }
  @Scope('ads:write') @Post('ads')
  async create(@CurrentUser() u: User, @Body(new Zod(CreateAdSchema)) b: z.infer<typeof CreateAdSchema>) {
    const a = await createAd(this.ctx, u, b);
    return presentAd(a, await fiatDecimals(this.ctx.db, a.fiat));
  }
  /** Bulk create: each ad is its own transaction; per-item results. */
  @Scope('ads:write') @Post('ads/bulk') @HttpCode(200)
  async bulkCreate(@CurrentUser() u: User, @Body(new Zod(BulkCreate, 'MerchantBulkCreate')) b: z.infer<typeof BulkCreate>) {
    const results = [];
    for (const raw of b.ads) {
      try {
        const a = await createAd(this.ctx, u, CreateAdSchema.parse(raw));
        results.push({ ok: true, ad: presentAd(a, await fiatDecimals(this.ctx.db, a.fiat)) });
      } catch (e) { results.push({ ok: false, ...err(e) }); }
    }
    return { results };
  }
  @Scope('ads:write') @Patch('ads/bulk')
  async bulkPatch(@CurrentUser() u: User, @Body(new Zod(BulkPatch, 'MerchantBulkPatch')) b: z.infer<typeof BulkPatch>) {
    const results = [];
    for (const it of b.ads) {
      try {
        let a = it.status ? await setAdStatus(this.ctx, u, it.id, it.status) : undefined;
        if (it.price || it.marginBps !== undefined) a = await updateAdPricing(this.ctx, u, it.id, { price: it.price, marginBps: it.marginBps });
        results.push({ id: it.id, ok: true, ad: a ? presentAd(a, await fiatDecimals(this.ctx.db, a.fiat)) : undefined });
      } catch (e) { results.push({ id: it.id, ok: false, ...err(e) }); }
    }
    return { results };
  }

  @Scope('orders:read') @Get('orders') @RateLimit(600)
  orders(@CurrentUser() u: User, @Query('status') status?: string) { return listMyOrders(this.ctx, u.id, status?.split(',')); }
  @Scope('orders:read') @Get('orders/:id')
  async order(@CurrentUser() u: User, @Param('id', uuid) id: string) { return presentOrder(this.ctx, await getOrderFor(this.ctx, u.id, id), u.id); }
  @Scope('orders:write') @Post('orders/:id/paid') @HttpCode(200)
  async paid(@CurrentUser() u: User, @Param('id', uuid) id: string) { return presentOrder(this.ctx, await markPaid(this.ctx, u, id), u.id); }
  /** The signed request with an `orders:release`-scoped key is the second factor, so no TOTP here. */
  @Scope('orders:release') @Post('orders/:id/release') @HttpCode(200)
  async release(@CurrentUser() u: User, @Param('id', uuid) id: string) { return presentOrder(this.ctx, await releaseOrder(this.ctx, u, id, undefined, { skip2fa: true }), u.id); }
}

const ApplySchema = z.object({ businessName: z.string().min(2).max(200), country: z.string().regex(/^[A-Z]{2}$/), expectedMonthlyVolumeUsd: z.number().int().min(0), website: z.string().url().optional(), notes: z.string().max(2000).optional() });

/** Session-authenticated merchant program management. */
@Controller('v1/merchant-program')
export class MerchantProgramController {
  constructor(@Inject(CTX) private ctx: Ctx) {}
  @Post('apply')
  apply(@CurrentUser() u: User, @Body(new Zod(ApplySchema, 'MerchantApply')) b: z.infer<typeof ApplySchema>) { return applyMerchant(this.ctx, u, b); }
  @Post('deposit')
  deposit(@CurrentUser() u: User, @Body(new Zod(z.object({ asset: zAsset, amount: z.string().regex(/^\d+(\.\d+)?$/), totp: z.string().regex(/^\d{6}$/) }), 'MerchantDeposit')) b: { asset: string; amount: string; totp: string }) {
    return lockSecurityDeposit(this.ctx, u, b.asset as Asset, b.amount, b.totp);
  }
  @Get('status')
  async status(@CurrentUser() u: User) {
    const p = await getMerchantProfile(this.ctx, u.id);
    return p ? { status: p.status, level: p.level, verifiedBadge: p.verifiedBadge, deposit: fromMinor(p.depositAmount, assetDecimals(p.depositAsset as Asset)), depositAsset: p.depositAsset, apiKeys: await listApiKeys(this.ctx, u.id) } : { status: 'none' };
  }
  @Post('api-keys')
  keys(@CurrentUser() u: User, @Body(new Zod(z.object({ scopes: z.array(z.enum(MERCHANT_SCOPES)).min(1), totp: z.string().regex(/^\d{6}$/) }), 'MerchantApiKey')) b: { scopes: string[]; totp: string }) {
    return createApiKey(this.ctx, u, b.scopes, b.totp);
  }
  @Post('api-keys/:id/revoke') @HttpCode(200)
  revoke(@CurrentUser() u: User, @Param('id') id: string) { return revokeApiKey(this.ctx, u, id); }
}
