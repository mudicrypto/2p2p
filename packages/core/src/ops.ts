/** Operational jobs: invariant check with auto-pause (spec 0.5). */
import { ASSET_LIST, type Asset } from '@p2p/shared';
import type { Ctx } from './context';
import { checkInvariants, type InvariantReport } from './ledger';
import { getConfig, setConfig } from './config';
import { audit } from './audit';

export async function runInvariantJob(ctx: Ctx): Promise<InvariantReport> {
  const report = await checkInvariants(ctx.db, (asset) => (ASSET_LIST.includes(asset as Asset) ? ctx.providers.custody.getBalance(asset as Asset) : Promise.resolve(0n)));
  if (!report.ok) {
    const cfg = await getConfig(ctx.db, 'withdrawals');
    if (!cfg.paused) {
      await setConfig(ctx.db, 'withdrawals', { paused: true });
      await audit(ctx.db, { actorType: 'system', action: 'withdrawals.auto_paused', subjectType: 'system', subjectId: 'invariants', after: report });
    }
    await ctx.providers.notifier.send({
      channel: (process.env.ONCALL_CHANNEL as 'telegram' | 'sms' | 'email') ?? 'telegram', to: process.env.ONCALL_TARGET ?? 'oncall', template: 'invariant_failed',
      params: { assets: report.perAsset.filter((p) => !p.ok).map((p) => p.asset).join(','), negative: report.negativeAccounts.length, unbalanced: report.unbalancedTx.length },
    });
  }
  return report;
}
