import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import * as core from '@p2p/core';
import { reports, deposits, withdrawals, countryRules, paymentMethodTypes, fiatCurrencies, adminUsers, eq, inArray, desc } from '@p2p/db';
import { toMinor, fromMinor, assetDecimals, type Asset } from '@p2p/shared';
import { CTX, type Ctx } from '../common/ctx';
import { Public } from '../common/auth.guard';
import { NoIdempotency } from '../common/idempotency.interceptor';
import { RateLimit } from '../common/rate-limit.guard';
import { Zod } from '../common/zod';
import { AdminGuard, AdminAuditInterceptor, AdminPublic, CurrentAdmin, Perm, ADMIN_COOKIE, ADMIN_CSRF, adminToken } from '../common/admin.guard';

type Admin = core.Admin;
const uuid = new Zod(z.string().uuid());
const note = z.object({ note: z.string().min(1).max(2000) });
const cents = (s: string) => toMinor(s, 2);
const secure = () => process.env.NODE_ENV === 'production';

@Public() // user auth guard skipped; AdminGuard enforces admin auth
@UseGuards(AdminGuard)
@UseInterceptors(AdminAuditInterceptor)
@Controller('v1/admin')
export class AdminController {
  constructor(@Inject(CTX) private ctx: Ctx) {}

  // ---------------------------------------------------------- auth
  @AdminPublic() @NoIdempotency() @Post('auth/login') @HttpCode(200) @RateLimit(10)
  async login(@Body(new Zod(z.object({ email: z.string().email(), password: z.string().min(1) }))) b: { email: string; password: string }, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const r = await core.adminLogin(this.ctx, b.email, b.password, req.ip);
    res.cookie(ADMIN_COOKIE, r.token, { httpOnly: true, secure: secure(), sameSite: 'strict', path: '/', maxAge: 8 * 3600_000 });
    const csrf = core.randomToken(16);
    res.cookie(ADMIN_CSRF, csrf, { httpOnly: false, secure: secure(), sameSite: 'strict', path: '/' });
    return { token: r.token, csrf, webauthnOptions: r.webauthnOptions, needsRegistration: r.needsRegistration };
  }
  @AdminPublic() @NoIdempotency() @Post('auth/webauthn') @HttpCode(200)
  webauthn(@Body() b: { response: unknown }, @Req() req: any) { return core.adminWebauthn(this.ctx, adminToken(req).token ?? '', b.response, req.ip); }
  @AdminPublic() @NoIdempotency() @Post('auth/register-key/options') @HttpCode(200)
  regOptions(@Req() req: any): Promise<unknown> { return core.adminKeyRegistrationOptions(this.ctx, adminToken(req).token ?? ''); }
  @AdminPublic() @NoIdempotency() @Post('auth/register-key') @HttpCode(200)
  register(@Body() b: { response: unknown }, @Req() req: any) { return core.adminKeyRegister(this.ctx, adminToken(req).token ?? '', b.response); }
  @Perm('config.read') @Get('me')
  me(@CurrentAdmin() a: Admin) { return { id: a.id, email: a.email, roles: a.roles }; }
  @Get('whoami') @Perm('users.search')
  whoami(@CurrentAdmin() a: Admin) { return { id: a.id, roles: a.roles }; }

  // ---------------------------------------------------------- users
  @Perm('users.search') @Get('users')
  search(@CurrentAdmin() a: Admin, @Query('q') q = '') { return core.searchUsers(this.ctx, a, String(q).slice(0, 100)); }
  @Perm('users.read') @Get('users/:id')
  user(@CurrentAdmin() a: Admin, @Param('id', uuid) id: string) { return core.userDetail(this.ctx, a, id); }
  @Perm('users.freeze') @Post('users/:id/status') @HttpCode(200)
  status(@CurrentAdmin() a: Admin, @Param('id', uuid) id: string, @Body(new Zod(z.object({ status: z.enum(['active', 'frozen', 'banned']), reason: z.string().min(1) }))) b: any) { return core.setUserStatus(this.ctx, a, id, b.status, b.reason); }

  // ---------------------------------------------------------- KYC
  @Perm('kyc.review') @Get('kyc') kyc() { return core.kycQueue(this.ctx); }
  @Perm('kyc.review') @Post('kyc/:id/review') @HttpCode(200)
  kycReview(@CurrentAdmin() a: Admin, @Param('id', uuid) id: string, @Body(new Zod(z.object({ approve: z.boolean(), note: z.string().min(1) }))) b: any) { return core.reviewKyc(this.ctx, a, id, b.approve, b.note); }

  // ---------------------------------------------------------- wallet ops
  @Perm('withdrawals.read') @Get('withdrawals')
  async withdrawals(@Query('status') status = 'pending_approval') {
    const rows = await this.ctx.db.select().from(withdrawals).where(inArray(withdrawals.status, status.split(','))).orderBy(desc(withdrawals.createdAt)).limit(200);
    return rows.map((w) => ({ ...w, amount: fromMinor(w.amount, assetDecimals(w.asset as Asset)), usd: fromMinor(w.usdValueCents, 2) }));
  }
  @Perm('withdrawals.approve') @Post('withdrawals/:id/approve') @HttpCode(200)
  approve(@CurrentAdmin() a: Admin, @Param('id', uuid) id: string) { return core.approveWithdrawal(this.ctx, a.id, id); }
  @Perm('withdrawals.approve') @Post('withdrawals/:id/reject') @HttpCode(200)
  reject(@CurrentAdmin() a: Admin, @Param('id', uuid) id: string, @Body(new Zod(note)) b: { note: string }) { return core.rejectWithdrawal(this.ctx, { type: 'admin', id: a.id }, id, b.note); }
  @Perm('deposits.review') @Get('deposits/held')
  held() { return this.ctx.db.select().from(deposits).where(eq(deposits.status, 'held')); }
  @Perm('deposits.review') @Post('deposits/:id/review') @HttpCode(200)
  depositReview(@CurrentAdmin() a: Admin, @Param('id', uuid) id: string, @Body(new Zod(z.object({ decision: z.enum(['credit', 'reject']), note: z.string().min(1) }))) b: any) { return core.reviewHeldDeposit(this.ctx, a.id, id, b.decision, b.note); }

  // ---------------------------------------------------------- editors
  @Perm('config.read') @Get('limits') limits() { return core.limitsTable(this.ctx); }
  @Perm('limits.write') @Put('limits/:tier')
  setLimits(@CurrentAdmin() a: Admin, @Param('tier') tier: string, @Body(new Zod(z.object({ daily: z.string(), monthly: z.string(), perOrder: z.string(), withdrawDaily: z.string() }), 'AdminLimits')) b: any) {
    return core.setLimits(this.ctx, a.id, Number(tier), { dailyLimit: cents(b.daily), monthlyLimit: cents(b.monthly), perOrderMax: cents(b.perOrder), withdrawDaily: cents(b.withdrawDaily) });
  }
  @Perm('config.read') @Get('country-rules') countries() { return this.ctx.db.select().from(countryRules); }
  @Perm('country_rules.write') @Put('country-rules/:country')
  country(@CurrentAdmin() a: Admin, @Param('country') c: string, @Body(new Zod(z.object({
    status: z.enum(['allowed', 'blocked']).optional(), tier0Allowed: z.boolean().optional(), limitMultiplierBps: z.number().int().min(0).max(100000).optional(),
    allowedPaymentMethods: z.array(z.string()).nullable().optional(), requiredDisclosures: z.array(z.string()).optional(), tierOverrides: z.record(z.string(), z.unknown()).optional(), launchEnabled: z.boolean().optional(),
  }).strict(), 'AdminCountryRule')) b: any) { return core.upsertCountryRule(this.ctx, a, c, b); }
  @Perm('config.read') @Get('payment-method-types') pmts() { return this.ctx.db.select().from(paymentMethodTypes); }
  @Perm('payment_methods.write') @Patch('payment-method-types/:code')
  pmt(@CurrentAdmin() a: Admin, @Param('code') code: string, @Body(new Zod(z.object({ enabled: z.boolean().optional(), riskLevel: z.enum(['low', 'medium', 'high']).optional(), reversible: z.boolean().optional(), holdHours: z.number().int().min(0).optional(), countries: z.array(z.string()).optional(), currencies: z.array(z.string()).optional(), verifierAvailable: z.boolean().optional() }).strict())) b: any) {
    return core.updatePaymentMethodType(this.ctx, a, code, b);
  }
  @Perm('config.read') @Get('fiat') fiats() { return this.ctx.db.select().from(fiatCurrencies); }
  @Perm('fiat.write') @Patch('fiat/:code')
  fiat(@CurrentAdmin() a: Admin, @Param('code') code: string, @Body(new Zod(z.object({ enabled: z.boolean().optional(), minOrder: z.string().nullable().optional(), maxOrder: z.string().nullable().optional(), rateSource: z.string().optional() }).strict())) b: any) {
    return core.updateFiat(this.ctx, a, code, { ...b, minOrder: b.minOrder == null ? b.minOrder : BigInt(b.minOrder), maxOrder: b.maxOrder == null ? b.maxOrder : BigInt(b.maxOrder) });
  }
  @Perm('config.read') @Get('config/:key')
  config(@Param('key') key: string) { if (!(key in core.CONFIG_DEFAULTS)) return {}; return core.getConfig(this.ctx.db, key as core.ConfigKey); }
  @Perm('fees.write') @Put('config/fees')
  fees(@CurrentAdmin() a: Admin, @Body(new Zod(z.object({ makerBps: z.number().int().min(0).max(500).optional(), takerBps: z.number().int().min(0).max(500).optional(), insuranceShareBps: z.number().int().min(0).max(10000).optional(), merchantLevelMakerBps: z.record(z.string(), z.number().int().min(0).max(500)).optional() }).strict(), 'AdminFees')) b: any) {
    return core.adminSetConfig(this.ctx, a, 'fees', b);
  }
  @Perm('withdrawals.pause') @Put('config/withdrawals')
  wcfg(@CurrentAdmin() a: Admin, @Body(new Zod(z.object({ paused: z.boolean().optional(), manualApprovalUsdCents: z.number().int().min(0).optional(), newAddressDelayHours: z.number().int().min(0).optional() }).strict())) b: any) {
    return core.adminSetConfig(this.ctx, a, 'withdrawals', b);
  }
  @Perm('admins.manage') @Put('config/:key')
  anyConfig(@CurrentAdmin() a: Admin, @Param('key') key: string, @Body() b: Record<string, unknown>) {
    if (!(key in core.CONFIG_DEFAULTS)) throw new Error('unknown config key');
    return core.adminSetConfig(this.ctx, a, key as core.ConfigKey, b);
  }

  // ---------------------------------------------------------- compliance
  @Perm('audit.read') @Get('audit')
  audit(@Query() q: any) { return core.queryAudit(this.ctx, { action: q.action, subjectId: q.subjectId, actorId: q.actorId, from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined, limit: q.limit ? Number(q.limit) : undefined }); }
  @Perm('risk.read') @Get('flags') flags(@Query('all') all?: string) { return core.listFlags(this.ctx, all !== 'true'); }
  @Perm('risk.resolve') @Post('flags/:id/resolve') @HttpCode(200)
  resolve(@CurrentAdmin() a: Admin, @Param('id') id: string, @Body(new Zod(note)) b: { note: string }) { return core.resolveFlag(this.ctx, a, BigInt(id), b.note); }
  @Perm('reports.sar') @Post('reports')
  report(@CurrentAdmin() a: Admin, @Body(new Zod(z.object({ kind: z.enum(['SAR', 'STR']), userId: z.string().uuid(), narrative: z.string().min(1).max(10000) }), 'AdminReport')) b: any) { return core.createSuspiciousActivityReport(this.ctx, a, b); }
  @Perm('reports.sar') @Get('reports/:id')
  async getReport(@CurrentAdmin() a: Admin, @Param('id', uuid) id: string, @Query('format') format: string | undefined, @Res() res: Response) {
    const [r] = await this.ctx.db.select().from(reports).where(eq(reports.id, id));
    if (!r) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
    await core.audit(this.ctx.db, { actorType: 'admin', actorId: a.id, action: 'report.exported', subjectType: 'report', subjectId: id, after: { format: format ?? 'json' } });
    if (format === 'csv') { res.setHeader('content-type', 'text/csv'); res.setHeader('content-disposition', `attachment; filename="${r.kind}-${r.id}.csv"`); res.send(core.reportToCsv(r.payload)); return; }
    res.json(r);
  }

  // ---------------------------------------------------------- disputes (arbiter) & insurance
  @Perm('disputes.read') @Get('disputes')
  disputes(@Query('status') status?: string) { return core.arbiterQueue(this.ctx, status ? { status: status.split(',') } : undefined); }
  @Perm('disputes.read') @Get('disputes/:id')
  dispute(@Param('id', uuid) id: string) { return core.getDisputeDetail(this.ctx, id); }
  @Perm('disputes.decide') @Post('disputes/:id/assign') @HttpCode(200)
  assign(@CurrentAdmin() a: Admin, @Param('id', uuid) id: string) { return core.assignDispute(this.ctx, a.id, id); }
  @Perm('disputes.decide') @Post('disputes/:id/triage') @HttpCode(200)
  triage(@Param('id', uuid) id: string) { return core.runTriage(this.ctx, id); }
  @Perm('disputes.decide') @Post('disputes/:id/decide') @HttpCode(200)
  decide(@CurrentAdmin() a: Admin, @Param('id', uuid) id: string, @Body(new Zod(z.object({ decision: z.enum(['release', 'refund', 'split']), splitBuyerBps: z.number().int().min(1).max(9999).optional(), note: z.string().min(1).max(4000) }), 'ArbiterDecision')) b: any) {
    return core.decideDispute(this.ctx, a.id, id, b);
  }
  @Perm('freeze_reports.review') @Get('freeze-reports')
  freezeReports(@Query('status') status?: string) { return core.listFreezeReports(this.ctx, { status: status ?? 'pending' }); }
  @Perm('freeze_reports.review') @Post('freeze-reports/:id/review') @HttpCode(200)
  reviewFreeze(@CurrentAdmin() a: Admin, @Param('id', uuid) id: string, @Body(new Zod(z.object({ approve: z.boolean(), payoutAsset: z.enum(['USDT', 'BTC', 'ETH']).optional(), payoutAmount: z.string().optional(), note: z.string().min(1) }))) b: any) {
    return core.reviewFreezeReport(this.ctx, a.id, id, { approve: b.approve, note: b.note, payoutAsset: b.payoutAsset, payoutAmount: b.payoutAsset && b.payoutAmount ? toMinor(b.payoutAmount, assetDecimals(b.payoutAsset)) : undefined });
  }
  @Perm('insurance.fund') @Get('insurance/:asset')
  async insurance(@Param('asset') asset: string) { return { asset, balance: fromMinor(await core.insuranceBalance(this.ctx, asset), assetDecimals(asset as Asset)) }; }
  @Perm('insurance.fund') @Post('insurance/:asset/fund') @HttpCode(200)
  fund(@CurrentAdmin() a: Admin, @Param('asset') asset: string, @Body(new Zod(z.object({ amount: z.string() }))) b: { amount: string }, @Req() req: any) {
    return core.fundInsurance(this.ctx, a.id, asset as Asset, toMinor(b.amount, assetDecimals(asset as Asset)), String(req.headers['idempotency-key']));
  }

  // ---------------------------------------------------------- merchants
  @Perm('users.read') @Get('merchants')
  merchants() { return core.listMerchants(this.ctx); }
  @Perm('kyc.review') @Post('merchants/:userId/review') @HttpCode(200)
  reviewMerchant(@CurrentAdmin() a: Admin, @Param('userId', uuid) userId: string, @Body(new Zod(z.object({ approve: z.boolean(), note: z.string().min(1).max(2000) }))) b: { approve: boolean; note: string }) {
    return core.reviewMerchant(this.ctx, a.id, userId, b);
  }
  @Perm('withdrawals.approve') @Post('merchants/:userId/deposit/release') @HttpCode(200)
  releaseDeposit(@CurrentAdmin() a: Admin, @Param('userId', uuid) userId: string) { return core.releaseSecurityDeposit(this.ctx, a.id, userId); }

  // ---------------------------------------------------------- admins
  @Perm('admins.manage') @Get('admins')
  admins() { return this.ctx.db.select({ id: adminUsers.id, email: adminUsers.email, roles: adminUsers.roles, active: adminUsers.active, createdAt: adminUsers.createdAt }).from(adminUsers); }
  @Perm('admins.manage') @Post('admins')
  async createAdmin(@CurrentAdmin() a: Admin, @Body(new Zod(z.object({ email: z.string().email(), password: z.string().min(12), roles: z.array(z.enum(core.ADMIN_ROLES)).min(1) }))) b: any) {
    const x = await core.createAdmin(this.ctx, a.id, b); return { id: x.id, email: x.email, roles: x.roles };
  }
  @Perm('admins.manage') @Patch('admins/:id')
  async roles(@CurrentAdmin() a: Admin, @Param('id', uuid) id: string, @Body(new Zod(z.object({ roles: z.array(z.enum(core.ADMIN_ROLES)).min(1), active: z.boolean().default(true) }))) b: any) {
    if (id === a.id) throw new Error('cannot change own roles');
    const x = await core.setAdminRoles(this.ctx, a.id, id, b.roles, b.active); return { id: x.id, roles: x.roles, active: x.active };
  }
}
