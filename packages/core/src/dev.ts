/** Development-only helpers (mock mode). Refuse to run in production. */
import { users, eq } from '@p2p/db';
import { DomainError, type Asset } from '@p2p/shared';
import type { Ctx } from './context';
import { runTx } from './context';
import { postTx, userAcct, systemAcct } from './ledger';
import { audit } from './audit';
import { randomToken } from './crypto';

function assertDev(ctx: Ctx) {
  if (process.env.NODE_ENV === 'production' || ctx.providers.mode !== 'mock') throw new DomainError('FORBIDDEN', 'dev helpers disabled');
}
/** Credit test funds as if deposited: custody contra account + mock custody on-chain balance. */
export async function devFaucet(ctx: Ctx, userId: string, asset: Asset, amount: bigint) {
  assertDev(ctx);
  const m = ctx.providers.mocks!.custody;
  m.setBalance(asset, (await m.getBalance(asset)) + amount);
  return runTx(ctx, async (t) => {
    const r = await postTx(t.tx, { type: 'deposit', refType: 'faucet', refId: userId, idempotencyKey: `faucet:${randomToken(12)}`, postings: [
      { account: systemAcct(asset, 'custody'), amount: -amount }, { account: userAcct(userId, asset), amount },
    ] });
    await audit(t.tx, { actorType: 'system', action: 'dev.faucet', subjectType: 'user', subjectId: userId, after: { asset, amount } });
    return r;
  });
}
export async function devSetTier(ctx: Ctx, userId: string, tier: number) {
  assertDev(ctx);
  await ctx.db.update(users).set({ kycTier: tier }).where(eq(users.id, userId));
}
