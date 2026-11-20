import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { devFaucet, devSetTier, seed, type User } from '@p2p/core';
import { toMinor, assetDecimals, type Asset, zAsset } from '@p2p/shared';
import { CTX, type Ctx } from '../common/ctx';
import { CurrentUser, Public } from '../common/auth.guard';
import { Zod } from '../common/zod';

/** Mock-mode helpers for local development and E2E tests. Disabled in production (core refuses). */
@Controller('v1/dev')
export class DevController {
  constructor(@Inject(CTX) private ctx: Ctx) {}
  @Post('faucet')
  async faucet(@CurrentUser() u: User, @Body(new Zod(z.object({ asset: zAsset, amount: z.string() }))) b: { asset: string; amount: string }) {
    await devFaucet(this.ctx, u.id, b.asset as Asset, toMinor(b.amount, assetDecimals(b.asset as Asset)));
    return { ok: true };
  }
  @Post('tier')
  async tier(@CurrentUser() u: User, @Body(new Zod(z.object({ tier: z.number().int().min(0).max(3) }))) b: { tier: number }) {
    await devSetTier(this.ctx, u.id, b.tier);
    return { ok: true };
  }
  /** E2E only (DEV_OUTBOX=1, never set on a server): the last test-mode email sent to an address. */
  @Public() @Get('outbox')
  outbox(@Query('to') to: string, @Query('template') template?: string) {
    const n = this.ctx.providers.mocks?.notifier;
    if (process.env.DEV_OUTBOX !== '1' || this.ctx.providers.mode !== 'mock' || !n) return { found: false };
    const m = [...n.outbox].reverse().find((x) => x.to === to && (!template || x.template === template));
    return m ? { found: true, ...m } : { found: false };
  }
  @Post('seed')
  async seed() { if (this.ctx.providers.mode !== 'mock' || process.env.NODE_ENV === 'production') return { ok: false }; await seed(this.ctx.db); return { ok: true }; }
}
