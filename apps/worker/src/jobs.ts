import type { Ctx } from '@p2p/core';
import * as core from '@p2p/core';
import { fiatCurrencies, eq } from '@p2p/db';
import { ASSET_LIST } from '@p2p/shared';

/** Job registry: name -> handler. Repeatable schedules below. */
export type JobHandler = (ctx: Ctx, data: any) => Promise<unknown>;
export const JOBS: Record<string, JobHandler> = {
  'invariants.check': (ctx) => core.runInvariantJob(ctx),
  'order.expire': (ctx, d) => core.expireOrder(ctx, d.orderId),
  'orders.sweep': (ctx) => core.sweepExpiredOrders(ctx),
  'holds.release': (ctx) => core.releaseExpiredHolds(ctx),
  'rates.refresh': async (ctx) => {
    const fiats = await ctx.db.select({ code: fiatCurrencies.code }).from(fiatCurrencies).where(eq(fiatCurrencies.enabled, true));
    for (const f of [{ code: 'USD' }, ...fiats]) for (const a of ASSET_LIST) await core.refreshRate(ctx, a, f.code).catch(() => null);
  },
};
export const SCHEDULES: Array<{ name: string; everyMs: number }> = [
  { name: 'invariants.check', everyMs: 60_000 },
  { name: 'orders.sweep', everyMs: 30_000 },
  { name: 'holds.release', everyMs: 300_000 },
  { name: 'rates.refresh', everyMs: 60_000 },
];
JOBS['reputation.recompute'] = async (ctx, d) => { for (const id of d.userIds as string[]) await core.recomputeReputation(ctx, id); };
JOBS['reputation.nightly'] = (ctx) => core.recomputeAllReputation(ctx);
SCHEDULES.push({ name: 'reputation.nightly', everyMs: 24 * 3600_000 });
JOBS['withdrawal.submit'] = (ctx, d) => core.submitWithdrawal(ctx, d.withdrawalId);
JOBS['withdrawals.process'] = (ctx) => core.processWithdrawals(ctx);
SCHEDULES.push({ name: 'withdrawals.process', everyMs: 30_000 });
JOBS['dispute.triage'] = (ctx, d) => core.runTriage(ctx, d.disputeId);
JOBS['disputes.escalate'] = (ctx) => core.escalateOverdueDisputes(ctx);
SCHEDULES.push({ name: 'disputes.escalate', everyMs: 60_000 });
JOBS['payment.verify'] = (ctx, d) => core.verifyOrderPayment(ctx, d.orderId);
JOBS['corridors.sweep'] = (ctx) => core.sweepCorridors(ctx);
SCHEDULES.push({ name: 'corridors.sweep', everyMs: 60_000 });
JOBS['merchants.levels'] = (ctx) => core.recomputeMerchantLevels(ctx);
JOBS['merchants.prune_signatures'] = (ctx) => core.pruneMerchantSignatures(ctx);
SCHEDULES.push({ name: 'merchants.levels', everyMs: 3600_000 }, { name: 'merchants.prune_signatures', everyMs: 600_000 });
JOBS['totp.prune'] = (ctx) => core.pruneTotpState(ctx);
SCHEDULES.push({ name: 'totp.prune', everyMs: 15 * 60_000 });
