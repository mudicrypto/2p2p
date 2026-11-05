import type { Ctx } from '@p2p/core';
import * as core from '@p2p/core';

/** Job registry: name -> handler. Repeatable schedules are defined in main.ts. */
export type JobHandler = (ctx: Ctx, data: any) => Promise<unknown>;
export const JOBS: Record<string, JobHandler> = {
  'invariants.check': (ctx) => core.runInvariantJob(ctx),
};
export const SCHEDULES: Array<{ name: string; everyMs: number }> = [
  { name: 'invariants.check', everyMs: 60_000 },
];
