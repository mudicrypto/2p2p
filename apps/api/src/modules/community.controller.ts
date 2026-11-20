import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import {
  setNickname, setAwayMode, follow, block, listRelations, relationTo, setAntiPhishingCode, referralInfo,
  createPriceAlert, listPriceAlerts, deletePriceAlert, createOtcRequest, listOtcRequests, setBusinessHours, type BusinessHours, type User,
  listReceiptChecks, listSavedSearches, saveSearch, deleteSavedSearch, translateChatMessage, translationEnabled, referralRewardsInfo,
} from '@p2p/core';
import { DomainError, zAsset, zFiat } from '@p2p/shared';
import { CTX, type Ctx } from '../common/ctx';
import { CurrentUser, Public } from '../common/auth.guard';
import { Zod } from '../common/zod';
import { RateLimit } from '../common/rate-limit.guard';

const uuid = new Zod(z.string().uuid());
const decimal = z.string().regex(/^\d{1,18}(\.\d{1,18})?$/);

/** Nicknames, away mode, follow/block, anti-phishing code, referrals, price alerts, large-trade requests. */
@Controller('v1')
export class CommunityController {
  constructor(@Inject(CTX) private ctx: Ctx) {}

  @Put('me/nickname') @HttpCode(200) @RateLimit(10)
  nickname(@CurrentUser() u: User, @Body(new Zod(z.object({ displayName: z.string().max(40) }), 'Nickname')) b: { displayName: string }) {
    return setNickname(this.ctx, u, b.displayName);
  }
  @Put('me/away') @HttpCode(200)
  away(@CurrentUser() u: User, @Body(new Zod(z.object({ away: z.boolean() }), 'AwayMode')) b: { away: boolean }) {
    return setAwayMode(this.ctx, u, b.away);
  }
  @Put('me/anti-phishing') @HttpCode(200)
  antiPhishing(@CurrentUser() u: User, @Body(new Zod(z.object({ code: z.string().max(40).nullable() }), 'AntiPhishing')) b: { code: string | null }) {
    return setAntiPhishingCode(this.ctx, u, b.code);
  }
  @Put('me/business-hours') @HttpCode(200)
  hours(@CurrentUser() u: User, @Body(new Zod(z.object({ hours: z.object({ tz: z.string().max(64), start: z.string().max(5), end: z.string().max(5), days: z.array(z.number().int()).max(7) }).nullable() }), 'BusinessHours')) b: { hours: BusinessHours | null }) {
    return setBusinessHours(this.ctx, u, b.hours);
  }
  @Get('me/referral')
  referral(@CurrentUser() u: User) { return referralInfo(this.ctx, u); }

  // ------------------------------------------------------------ follow / block
  @Put('users/:id/follow') @HttpCode(200)
  follow(@CurrentUser() u: User, @Param('id', uuid) id: string) { return follow(this.ctx, u, id, true); }
  @Delete('users/:id/follow')
  unfollow(@CurrentUser() u: User, @Param('id', uuid) id: string) { return follow(this.ctx, u, id, false); }
  @Put('users/:id/block') @HttpCode(200)
  block(@CurrentUser() u: User, @Param('id', uuid) id: string) { return block(this.ctx, u, id, true); }
  @Delete('users/:id/block')
  unblock(@CurrentUser() u: User, @Param('id', uuid) id: string) { return block(this.ctx, u, id, false); }
  @Public() @Get('users/:id/relation')
  async relation(@CurrentUser() u: User | undefined, @Param('id', uuid) id: string) {
    return u ? relationTo(this.ctx.db, u.id, id) : { following: false, blocked: false };
  }
  @Get('me/following')
  following(@CurrentUser() u: User) { return listRelations(this.ctx, u, 'following'); }
  @Get('me/blocked')
  blocked(@CurrentUser() u: User) { return listRelations(this.ctx, u, 'blocked'); }

  // ------------------------------------------------------------ price alerts
  @Get('me/price-alerts')
  alerts(@CurrentUser() u: User) { return listPriceAlerts(this.ctx, u); }
  @Post('me/price-alerts') @RateLimit(20)
  addAlert(@CurrentUser() u: User, @Body(new Zod(z.object({ side: z.enum(['buy', 'sell']), asset: zAsset, fiat: zFiat, price: decimal }), 'PriceAlert')) b: any) {
    return createPriceAlert(this.ctx, u, b);
  }
  @Delete('me/price-alerts/:id')
  removeAlert(@CurrentUser() u: User, @Param('id', uuid) id: string) { return deletePriceAlert(this.ctx, u, id); }

  // ------------------------------------------------------------ large trades (OTC desk)
  @Get('me/otc-requests')
  myOtc(@CurrentUser() u: User) { return listOtcRequests(this.ctx, { userId: u.id }); }
  @Post('otc-requests') @RateLimit(5)
  otc(@CurrentUser() u: User, @Body(new Zod(z.object({ side: z.enum(['buy', 'sell']), asset: zAsset, fiat: zFiat, fiatAmount: decimal, note: z.string().max(1000).optional() }), 'OtcRequest')) b: any) {
    return createOtcRequest(this.ctx, u, b);
  }

  // ------------------------------------------------------------ saved searches
  @Get('me/saved-searches')
  searches(@CurrentUser() u: User) { return listSavedSearches(this.ctx, u); }
  @Post('me/saved-searches') @RateLimit(20)
  addSearch(@CurrentUser() u: User, @Body(new Zod(z.object({ name: z.string().max(40), params: z.record(z.string(), z.union([z.string().max(60), z.boolean(), z.number()])) }), 'SavedSearch')) b: { name: string; params: Record<string, unknown> }) {
    return saveSearch(this.ctx, u, b.name, b.params);
  }
  @Delete('me/saved-searches/:id')
  removeSearch(@CurrentUser() u: User, @Param('id', uuid) id: string) { return deleteSavedSearch(this.ctx, u, id); }

  // ------------------------------------------------------------ chat translation
  @Public() @Get('features')
  features() { return { chatTranslation: translationEnabled(this.ctx) }; }
  @Post('orders/:id/messages/:messageId/translate') @HttpCode(200) @RateLimit(60)
  translate(@CurrentUser() u: User, @Param('id', uuid) id: string, @Param('messageId') messageId: string, @Body(new Zod(z.object({ target: z.string().max(10) }), 'Translate')) b: { target: string }) {
    if (!/^\d{1,19}$/.test(messageId)) throw new DomainError('VALIDATION', 'bad message id');
    return translateChatMessage(this.ctx, u, id, messageId, b.target);
  }

  // ------------------------------------------------------------ receipt checks
  @Get('orders/:id/receipt-checks')
  receipts(@CurrentUser() u: User, @Param('id', uuid) id: string) { return listReceiptChecks(this.ctx, u.id, id); }

  // ------------------------------------------------------------ invite rewards
  @Get('me/referral/rewards')
  rewards(@CurrentUser() u: User) { return referralRewardsInfo(this.ctx, u); }
}
