import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  addPaymentMethod, listPaymentMethods, createAd, setAdStatus, updateAdPricing, orderBook, myAds, getAd, presentAd, fiatDecimals,
  createOrder, markPaid, cancelOrder, releaseOrder, getOrderFor, presentOrder, listMyOrders, userBalances, getLimits, limitUsageFor, type User,
} from '@p2p/core';
import { CreateAdSchema, OrderBookQuerySchema, CreateOrderSchema, fromMinor, assetDecimals, type Asset } from '@p2p/shared';
import { paymentMethodTypes, fiatCurrencies, countryRules, eq } from '@p2p/db';
import { CTX, type Ctx } from '../common/ctx';
import { CurrentUser, Public } from '../common/auth.guard';
import { Zod } from '../common/zod';

const AddPmSchema = z.object({ type: z.string().max(64), holderName: z.string().min(2).max(128), details: z.record(z.string()) });
const uuid = new Zod(z.string().uuid());

@Controller('v1')
export class TradingController {
  constructor(@Inject(CTX) private ctx: Ctx) {}

  // ---- wallet overview
  @Get('me/balances')
  async balances(@CurrentUser() u: User) {
    const b = await userBalances(this.ctx.db, u.id);
    const out: Record<string, Record<string, string>> = {};
    for (const [asset, kinds] of Object.entries(b)) out[asset] = Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, fromMinor(v, assetDecimals(asset as Asset))]));
    return out;
  }
  @Get('me/limits')
  async limits(@CurrentUser() u: User) {
    const l = await getLimits(this.ctx, this.ctx.db, u);
    const used = await limitUsageFor(this.ctx.db, u.id, this.ctx.now());
    const usd = (v: bigint) => fromMinor(v, 2);
    return { tier: u.kycTier, cooldown: l.cooldown, daily: usd(l.daily), monthly: usd(l.monthly), perOrder: usd(l.perOrder), withdrawDaily: usd(l.withdrawDaily), usedToday: usd(used.tradeDay), usedMonth: usd(used.tradeMonth), withdrawnToday: usd(used.withdrawDay) };
  }

  // ---- global reference data
  @Public() @Get('fiats')
  async fiats() {
    const rows = await this.ctx.read.select({ code: fiatCurrencies.code, name: fiatCurrencies.name, minorUnits: fiatCurrencies.minorUnits }).from(fiatCurrencies).where(eq(fiatCurrencies.enabled, true));
    return rows.sort((a, b) => a.code.localeCompare(b.code));
  }
  @Public() @Get('countries/:code')
  async country(@Param('code') code: string) {
    const [r] = await this.ctx.read.select().from(countryRules).where(eq(countryRules.country, code.toUpperCase()));
    return { country: code.toUpperCase(), allowed: !r || (r.status === 'allowed' && r.launchEnabled), tier0Allowed: r?.tier0Allowed ?? true, allowedPaymentMethods: r?.allowedPaymentMethods ?? null, requiredDisclosures: r?.requiredDisclosures ?? [] };
  }

  // ---- payment methods
  @Public() @Get('payment-method-types')
  async types(@Query('country') country?: string, @Query('fiat') fiat?: string) {
    const rows = await this.ctx.read.select().from(paymentMethodTypes).where(eq(paymentMethodTypes.enabled, true));
    return rows.filter((r) => (!country || r.countries.includes(country) || r.countries.includes('*')) && (!fiat || r.currencies.includes(fiat) || r.currencies.includes('*')));
  }
  @Get('payment-methods') list(@CurrentUser() u: User) { return listPaymentMethods(this.ctx.db, u.id); }
  @Post('payment-methods')
  add(@CurrentUser() u: User, @Body(new Zod(AddPmSchema, 'AddPaymentMethod')) b: z.infer<typeof AddPmSchema>) { return addPaymentMethod(this.ctx, u, b); }

  // ---- ads
  @Public() @Get('ads')
  book(@Query(new Zod(OrderBookQuerySchema, 'OrderBookQuery')) q: z.infer<typeof OrderBookQuerySchema>) { return orderBook(this.ctx, q); }
  @Get('me/ads') mine(@CurrentUser() u: User) { return myAds(this.ctx, u.id); }
  @Public() @Get('ads/:id')
  async one(@Param('id', uuid) id: string) { const a = await getAd(this.ctx, id); return presentAd(a, await fiatDecimals(this.ctx.db, a.fiat)); }
  @Post('ads')
  async create(@CurrentUser() u: User, @Body(new Zod(CreateAdSchema, 'CreateAd')) b: z.infer<typeof CreateAdSchema>) {
    const a = await createAd(this.ctx, u, b);
    return presentAd(a, await fiatDecimals(this.ctx.db, a.fiat));
  }
  @Patch('ads/:id')
  async patch(@CurrentUser() u: User, @Param('id', uuid) id: string, @Body(new Zod(z.object({ status: z.enum(['active', 'paused', 'closed']).optional(), price: z.string().optional(), marginBps: z.number().int().min(-2000).max(2000).optional() }), 'PatchAd')) b: any) {
    let a = b.status ? await setAdStatus(this.ctx, u, id, b.status) : await getAd(this.ctx, id);
    if (b.price || b.marginBps !== undefined) a = await updateAdPricing(this.ctx, u, id, b);
    return presentAd(a, await fiatDecimals(this.ctx.db, a.fiat));
  }

  // ---- orders
  @Post('orders')
  async order(@CurrentUser() u: User, @Body(new Zod(CreateOrderSchema, 'CreateOrder')) b: z.infer<typeof CreateOrderSchema>) {
    return presentOrder(this.ctx, await createOrder(this.ctx, u, b), u.id);
  }
  @Get('orders') myOrders(@CurrentUser() u: User, @Query('status') status?: string) { return listMyOrders(this.ctx, u.id, status?.split(',')); }
  @Get('orders/:id') async get(@CurrentUser() u: User, @Param('id', uuid) id: string) { return presentOrder(this.ctx, await getOrderFor(this.ctx, u.id, id), u.id); }
  @Post('orders/:id/paid') @HttpCode(200)
  async paid(@CurrentUser() u: User, @Param('id', uuid) id: string) { return presentOrder(this.ctx, await markPaid(this.ctx, u, id), u.id); }
  @Post('orders/:id/cancel') @HttpCode(200)
  async cancel(@CurrentUser() u: User, @Param('id', uuid) id: string) { return presentOrder(this.ctx, await cancelOrder(this.ctx, u, id), u.id); }
  @Post('orders/:id/release') @HttpCode(200)
  async release(@CurrentUser() u: User, @Param('id', uuid) id: string, @Body(new Zod(z.object({ totp: z.string().regex(/^\d{6}$/) }), 'ReleaseOrder')) b: { totp: string }) {
    return presentOrder(this.ctx, await releaseOrder(this.ctx, u, id, b.totp), u.id);
  }
}
