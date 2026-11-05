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
