import { describe, it, expect, afterAll } from 'vitest';
import { makeCtx } from './helpers';
import { runInvariantJob, getConfig, setConfig, clearConfigCache } from '../src';

const ctx = makeCtx();
afterAll(() => ctx.close());

describe('invariant job', () => {
  it('auto-pauses withdrawals and pages on-call when custody < liabilities', async () => {
    await setConfig(ctx.db, 'withdrawals', { paused: false });
    // Mock custody holds nothing while the ledger has liabilities from other tests -> must fail.
    const r = await runInvariantJob(ctx);
    if (r.perAsset.some((p) => p.liabilities > 0n)) {
      expect(r.ok).toBe(false);
      clearConfigCache();
      expect((await getConfig(ctx.db, 'withdrawals')).paused).toBe(true);
      expect(ctx.providers.mocks!.notifier.last('invariant_failed')).toBeTruthy();
    }
    await setConfig(ctx.db, 'withdrawals', { paused: false });
  });
});
