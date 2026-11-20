import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  getDepositAddress, handleCustodyWebhook, listDeposits, listWithdrawals, addAllowlistAddress, listAllowlist, requestWithdrawal, internalTransfer, type User,
} from '@p2p/core';
import { WithdrawSchema, InternalTransferSchema, zAsset, zNetwork, fromMinor, assetDecimals, toMinor, type Asset, type Network } from '@p2p/shared';
import { CTX, type Ctx } from '../common/ctx';
import { CurrentUser, Public } from '../common/auth.guard';
import { NoIdempotency } from '../common/idempotency.interceptor';
import { RateLimit } from '../common/rate-limit.guard';
import { Zod } from '../common/zod';

const fmt = (asset: string, v: bigint) => fromMinor(v, assetDecimals(asset as Asset));
const AllowSchema = z.object({ asset: zAsset, network: zNetwork, address: z.string().min(10).max(128), label: z.string().max(64).optional(), totp: z.string().regex(/^\d{6}$/) });

@Controller('v1')
export class WalletController {
  constructor(@Inject(CTX) private ctx: Ctx) {}

  @Get('wallet/deposit-address')
  async address(@CurrentUser() u: User, @Query(new Zod(z.object({ asset: zAsset, network: zNetwork }))) q: { asset: Asset; network: Network }) {
    const a = await getDepositAddress(this.ctx, u, q.asset, q.network);
    return { asset: a.asset, network: a.network, address: a.address, memo: a.memo };
  }
  @Get('wallet/deposits')
  async deposits(@CurrentUser() u: User) {
    return (await listDeposits(this.ctx, u.id)).map((d) => ({ id: d.id, asset: d.asset, network: d.network, txHash: d.txHash, amount: fmt(d.asset, d.amount), confirmations: d.confirmations, status: d.status, createdAt: d.createdAt }));
  }
  @Get('wallet/withdrawals')
  async withdrawals(@CurrentUser() u: User) {
    return (await listWithdrawals(this.ctx, u.id)).map((w) => ({ id: w.id, asset: w.asset, network: w.network, address: w.address, amount: fmt(w.asset, w.amount), fee: fmt(w.asset, w.fee), status: w.status, txHash: w.txHash, createdAt: w.createdAt }));
  }
  @Get('wallet/addresses') addresses(@CurrentUser() u: User) { return listAllowlist(this.ctx, u.id); }
  @Post('wallet/addresses') @RateLimit(10)
  addAddress(@CurrentUser() u: User, @Body(new Zod(AllowSchema, 'AllowlistAddress')) b: z.infer<typeof AllowSchema>) { return addAllowlistAddress(this.ctx, u, b as any); }
  @Post('wallet/withdrawals') @RateLimit(10)
  async withdraw(@CurrentUser() u: User, @Body(new Zod(WithdrawSchema, 'Withdraw')) b: z.infer<typeof WithdrawSchema>) {
    const w = await requestWithdrawal(this.ctx, u, b as any);
    return { id: w.id, status: w.status, amount: fmt(w.asset, w.amount), fee: fmt(w.asset, w.fee), requiredApprovals: w.requiredApprovals };
  }
  @Post('wallet/transfers') @RateLimit(20)
  transfer(@CurrentUser() u: User, @Body(new Zod(InternalTransferSchema, 'InternalTransfer')) b: z.infer<typeof InternalTransferSchema>) { return internalTransfer(this.ctx, u, b as any); }

  @Public() @NoIdempotency() @Post('webhooks/custody') @HttpCode(200)
  webhook(@Req() req: any) {
    const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    return handleCustodyWebhook(this.ctx, raw, req.headers);
  }

  /** Mock-only: simulate an on-chain deposit arriving with N confirmations. */
  @Post('dev/custody/deposit') @HttpCode(200)
  async devDeposit(@CurrentUser() u: User, @Body(new Zod(z.object({ asset: zAsset, network: zNetwork, amount: z.string(), confirmations: z.number().int().min(0).default(100), txHash: z.string().optional(), fromAddress: z.string().optional() }))) b: any) {
    const m = this.ctx.providers.mocks?.custody;
    if (!m || this.ctx.providers.mode !== 'mock' || process.env.NODE_ENV === 'production') return { ok: false };
    const a = await getDepositAddress(this.ctx, u, b.asset, b.network);
    const wh = m.simulateDeposit({ network: b.network, asset: b.asset, address: a.address, memo: a.memo ?? undefined, txHash: b.txHash ?? `0x${crypto.randomUUID().replace(/-/g, '')}`, amount: toMinor(b.amount, assetDecimals(b.asset)), confirmations: b.confirmations, fromAddress: b.fromAddress });
    return handleCustodyWebhook(this.ctx, wh.body, wh.headers);
  }
}
