/**
 * Wallet & custody (spec 9 / M5).
 * Deposits: custody webhook -> screen source -> credit after N confirmations (per network); high risk held.
 * Withdrawals: 2FA + allowlist (24h delay for new addresses) + risk screen + tier daily limit + security cooldown;
 * large amounts need two distinct admins. Internal transfers are free, instant and ledger-only.
 */
import { depositAddresses, deposits, withdrawals, withdrawalApprovals, addressAllowlist, users, and, eq, sql, desc, inArray, lte } from '@p2p/db';
import { DomainError, assetSupportsNetwork, toMinor, assetDecimals, fromMinor, type Asset, type Network } from '@p2p/shared';
import type { Ctx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import { postTx, userAcct, systemAcct, balanceOf } from './ledger';
import { getConfig } from './config';
import { consumeWithdrawLimit, usdCents, reloadUser } from './limits';
import { require2fa, type User } from './auth';
import { flag } from './risk';
import { notify } from './notifications';
import { withIdempotency } from './idempotency';

export const ADDRESS_FORMATS: Record<Network, RegExp> = {
  TRON: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  ETHEREUM: /^0x[0-9a-fA-F]{40}$/, BSC: /^0x[0-9a-fA-F]{40}$/, POLYGON: /^0x[0-9a-fA-F]{40}$/,
  BITCOIN: /^(bc1|tb1)[02-9ac-hj-np-z]{11,71}$|^[13mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/,
  TON: /^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/,
};
function assertAddress(asset: Asset, network: string, address: string): asserts network is Network {
  if (!assetSupportsNetwork(asset, network)) throw new DomainError('VALIDATION', `${asset} is not supported on ${network}`);
  if (!ADDRESS_FORMATS[network].test(address)) throw new DomainError('VALIDATION', `invalid ${network} address`);
}

// ---------------------------------------------------------------- deposits
export async function getDepositAddress(ctx: Ctx, user: User, asset: Asset, network: Network) {
  if (!assetSupportsNetwork(asset, network)) throw new DomainError('VALIDATION', `${asset} is not supported on ${network}`);
  const [existing] = await ctx.db.select().from(depositAddresses).where(and(eq(depositAddresses.userId, user.id), eq(depositAddresses.asset, asset), eq(depositAddresses.network, network)));
  if (existing) return existing;
  const a = await ctx.providers.custody.createDepositAddress(user.id, asset, network);
  const [row] = await ctx.db.insert(depositAddresses).values({ userId: user.id, asset, network, address: a.address, memo: a.memo ?? null, custodyRef: a.custodyRef }).onConflictDoNothing().returning();
  return row ?? (await ctx.db.select().from(depositAddresses).where(and(eq(depositAddresses.userId, user.id), eq(depositAddresses.asset, asset), eq(depositAddresses.network, network))))[0];
}

export async function handleCustodyWebhook(ctx: Ctx, rawBody: string, headers: Record<string, string | undefined>) {
  const c = ctx.providers.custody;
  if (!c.verifyWebhook(rawBody, headers)) throw new DomainError('UNAUTHORIZED', 'bad webhook signature');
  const ev = c.parseWebhook(rawBody);
  if (!ev) return { outcome: 'ignored' as const };
  const r = await withIdempotency(ctx.db, 'webhook:custody', ev.eventId, { tx: ev.txHash, c: ev.confirmations }, async () => ({ status: 200, body: await processDeposit(ctx, ev) }));
  return r.body;
}

async function processDeposit(ctx: Ctx, ev: NonNullable<ReturnType<Ctx['providers']['custody']['parseWebhook']>>) {
  const conds = [eq(depositAddresses.network, ev.network), eq(depositAddresses.address, ev.address)];
  if (ev.memo) conds.push(eq(depositAddresses.memo, ev.memo));
  const [addr] = await ctx.db.select().from(depositAddresses).where(and(...conds));
  if (!addr || addr.asset !== ev.asset) return { outcome: 'unknown_address' as const };
  const risk = ev.fromAddress ? await ctx.providers.chainRisk.screenAddress(ev.network, ev.fromAddress) : { score: 0, sanctioned: false, categories: [] };
  const confCfg = await getConfig(ctx.db, 'confirmations');
  const riskCfg = await getConfig(ctx.db, 'risk');
  const needed = confCfg[ev.network] ?? 12;
  return runTx(ctx, async (t) => {
    await t.tx.insert(deposits).values({ userId: addr.userId, asset: ev.asset, network: ev.network, txHash: ev.txHash, fromAddress: ev.fromAddress, amount: ev.amount, confirmations: ev.confirmations, riskScore: risk.score })
      .onConflictDoUpdate({ target: [deposits.network, deposits.txHash], set: { confirmations: sql`greatest(${deposits.confirmations}, ${ev.confirmations})` } });
    const [d] = await t.tx.select().from(deposits).where(and(eq(deposits.network, ev.network), eq(deposits.txHash, ev.txHash))).for('update');
    if (d.status !== 'pending') return { outcome: d.status as string, depositId: d.id };
    if (d.confirmations < needed) return { outcome: 'pending', depositId: d.id, confirmations: d.confirmations, needed };
    if (risk.sanctioned || risk.score >= riskCfg.depositHoldScore) {
      await t.tx.update(deposits).set({ status: 'held' }).where(eq(deposits.id, d.id));
      await flag(t.tx, 'deposit', d.id, risk.sanctioned ? 'SANCTIONED_SOURCE' : 'HIGH_RISK_DEPOSIT', 'high', risk);
      if (risk.sanctioned) {
        await t.tx.update(users).set({ status: 'frozen' }).where(eq(users.id, d.userId));
        await flag(t.tx, 'user', d.userId, 'SANCTIONED_DEPOSIT_SOURCE', 'high', { depositId: d.id });
      }
      await audit(t.tx, { actorType: 'system', action: 'deposit.held', subjectType: 'deposit', subjectId: d.id, after: { risk } });
      return { outcome: 'held', depositId: d.id };
    }
    await creditDeposit(t, d);
    return { outcome: 'credited', depositId: d.id };
  });
}

async function creditDeposit(t: Parameters<Parameters<typeof runTx>[1]>[0], d: typeof deposits.$inferSelect) {
  await postTx(t.tx, { type: 'deposit', refType: 'deposit', refId: d.id, idempotencyKey: `deposit:${d.id}`, postings: [
    { account: systemAcct(d.asset, 'custody'), amount: -d.amount }, { account: userAcct(d.userId, d.asset), amount: d.amount },
  ] });
  await t.tx.update(deposits).set({ status: 'credited', creditedAt: t.now() }).where(eq(deposits.id, d.id));
  await audit(t.tx, { actorType: 'system', action: 'deposit.credited', subjectType: 'deposit', subjectId: d.id, after: { amount: d.amount, asset: d.asset } });
  await notify(t, t.tx, d.userId, 'deposit_credited', { amount: fromMinor(d.amount, assetDecimals(d.asset as Asset)), asset: d.asset });
}

/** Compliance review of a held deposit. */
export async function reviewHeldDeposit(ctx: Ctx, adminId: string, depositId: string, decision: 'credit' | 'reject', note: string) {
  return runTx(ctx, async (t) => {
    const [d] = await t.tx.select().from(deposits).where(eq(deposits.id, depositId)).for('update');
    if (!d || d.status !== 'held') throw new DomainError('CONFLICT', 'deposit is not held');
    if (decision === 'credit') await creditDeposit(t, d);
    else await t.tx.update(deposits).set({ status: 'rejected' }).where(eq(deposits.id, d.id)); // funds stay in custody pending return/seizure per compliance
    await audit(t.tx, { actorType: 'admin', actorId: adminId, action: `deposit.review_${decision}`, subjectType: 'deposit', subjectId: d.id, after: { note } });
    return { status: decision === 'credit' ? 'credited' : 'rejected' };
  });
}

// ---------------------------------------------------------------- allowlist
export async function addAllowlistAddress(ctx: Ctx, user: User, input: { asset: Asset; network: string; address: string; label?: string; totp?: string }) {
  await require2fa(ctx, user, input.totp);
  assertAddress(input.asset, input.network, input.address);
  const risk = await ctx.providers.chainRisk.screenAddress(input.network, input.address);
  if (risk.sanctioned) {
    await flag(ctx.db, 'user', user.id, 'SANCTIONED_ADDRESS_ATTEMPT', 'high', { address: input.address, network: input.network });
    throw new DomainError('SANCTIONED', 'address failed sanctions screening');
  }
  const wcfg = await getConfig(ctx.db, 'withdrawals');
  return runTx(ctx, async (t) => {
    const [row] = await t.tx.insert(addressAllowlist).values({ userId: user.id, asset: input.asset, network: input.network, address: input.address, label: input.label, riskScore: risk.score, activeAt: new Date(ctx.now().getTime() + wcfg.newAddressDelayHours * 3600_000) })
      .onConflictDoNothing().returning();
    if (!row) throw new DomainError('CONFLICT', 'address already on allowlist');
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'allowlist.added', subjectType: 'address', subjectId: row.id, after: { network: row.network, address: row.address } });
    await notify(t, t.tx, user.id, 'security_alert', { what: 'withdrawal address added' });
    return row;
  });
}
export const listAllowlist = async (ctx: Ctx, userId: string): Promise<Array<typeof addressAllowlist.$inferSelect>> => ctx.db.select().from(addressAllowlist).where(eq(addressAllowlist.userId, userId));

// ---------------------------------------------------------------- withdrawals
export type Withdrawal = typeof withdrawals.$inferSelect;

export async function requestWithdrawal(ctx: Ctx, userIn: User, input: { asset: Asset; network: string; address: string; amount: string; totp?: string }) {
  const wcfg = await getConfig(ctx.db, 'withdrawals');
  if (wcfg.paused) throw new DomainError('WITHDRAWALS_PAUSED', 'withdrawals are temporarily paused');
  const user = await reloadUser(ctx.db, userIn.id);
  if (user.status !== 'active') throw new DomainError('ACCOUNT_FROZEN', 'account not active');
  await require2fa(ctx, user, input.totp);
  assertAddress(input.asset, input.network, input.address);
  const cd = await getConfig(ctx.db, 'cooldowns');
  if (user.securityChangedAt && ctx.now().getTime() - user.securityChangedAt.getTime() < cd.securityChangeWithdrawHours * 3600_000)
    throw new DomainError('COOLDOWN', `withdrawals are locked for ${cd.securityChangeWithdrawHours}h after a password or 2FA change`);
  const [al] = await ctx.db.select().from(addressAllowlist).where(and(eq(addressAllowlist.userId, user.id), eq(addressAllowlist.network, input.network), eq(addressAllowlist.address, input.address)));
  if (!al) throw new DomainError('FORBIDDEN', 'address is not on your allowlist');
  if (al.activeAt > ctx.now()) throw new DomainError('COOLDOWN', `new address becomes usable at ${al.activeAt.toISOString()}`);
  const risk = await ctx.providers.chainRisk.screenAddress(input.network, input.address);
  const riskCfg = await getConfig(ctx.db, 'risk');
  if (risk.sanctioned || risk.score >= riskCfg.withdrawBlockScore) {
    await flag(ctx.db, 'user', user.id, risk.sanctioned ? 'SANCTIONED_ADDRESS_ATTEMPT' : 'HIGH_RISK_WITHDRAWAL', 'high', { address: input.address, risk });
    throw new DomainError(risk.sanctioned ? 'SANCTIONED' : 'RISK_BLOCKED', 'destination failed risk screening');
  }
  const dec = assetDecimals(input.asset);
  const amount = toMinor(input.amount, dec);
  if (amount <= 0n) throw new DomainError('VALIDATION', 'amount must be positive');
  const fee = toMinor(wcfg.networkFee[input.asset] ?? '0', dec);
  const usd = await usdCents(ctx, ctx.db, input.asset, amount);
  const manual = usd >= BigInt(wcfg.manualApprovalUsdCents) || risk.score >= riskCfg.manualConfirmScore;
  const w = await runTx(ctx, async (t) => {
    await consumeWithdrawLimit(ctx, t.tx, user, usd);
    const [w] = await t.tx.insert(withdrawals).values({
      userId: user.id, asset: input.asset, network: input.network, address: input.address, amount, fee, usdValueCents: usd,
      status: manual ? 'pending_approval' : 'approved', riskScore: risk.score, requiredApprovals: manual ? wcfg.requiredApprovals : 0,
    }).returning();
    const postings = [{ account: userAcct(user.id, input.asset), amount: -(amount + fee) }, { account: userAcct(user.id, input.asset, 'withdraw_pending'), amount }];
    if (fee > 0n) postings.push({ account: systemAcct(input.asset, 'fee'), amount: fee });
    await postTx(t.tx, { type: 'withdraw', refType: 'withdrawal', refId: w.id, idempotencyKey: `withdrawal:${w.id}:request`, postings });
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'withdrawal.requested', subjectType: 'withdrawal', subjectId: w.id, after: { amount, asset: w.asset, network: w.network, manual } });
    if (!manual) t.afterCommit(() => ctx.jobs?.enqueue('withdrawal.submit', { withdrawalId: w.id }));
    return w;
  });
  return w;
}

/** Two distinct admins must approve large withdrawals. */
export async function approveWithdrawal(ctx: Ctx, adminId: string, withdrawalId: string) {
  const w = await runTx(ctx, async (t) => {
    const [w] = await t.tx.select().from(withdrawals).where(eq(withdrawals.id, withdrawalId)).for('update');
    if (!w || w.status !== 'pending_approval') throw new DomainError('CONFLICT', 'withdrawal is not awaiting approval');
    if (w.userId === adminId) throw new DomainError('FORBIDDEN', 'cannot approve own withdrawal');
    const ins = await t.tx.insert(withdrawalApprovals).values({ withdrawalId, adminId }).onConflictDoNothing().returning();
    if (!ins.length) throw new DomainError('CONFLICT', 'you already approved this withdrawal');
    const [{ n }] = await t.tx.select({ n: sql<number>`count(*)::int` }).from(withdrawalApprovals).where(eq(withdrawalApprovals.withdrawalId, withdrawalId));
    await audit(t.tx, { actorType: 'admin', actorId: adminId, action: 'withdrawal.approval', subjectType: 'withdrawal', subjectId: withdrawalId, after: { approvals: n, required: w.requiredApprovals } });
    if (n >= w.requiredApprovals) {
      const [u] = await t.tx.update(withdrawals).set({ status: 'approved', updatedAt: ctx.now() }).where(and(eq(withdrawals.id, w.id), eq(withdrawals.status, 'pending_approval'))).returning();
      t.afterCommit(() => ctx.jobs?.enqueue('withdrawal.submit', { withdrawalId }));
      return u;
    }
    return w;
  });
  return w;
}

export async function rejectWithdrawal(ctx: Ctx, actor: { type: 'admin' | 'system'; id?: string }, withdrawalId: string, reason: string) {
  return runTx(ctx, async (t) => {
    const [w] = await t.tx.select().from(withdrawals).where(eq(withdrawals.id, withdrawalId)).for('update');
    if (!w || !['pending_approval', 'approved'].includes(w.status)) throw new DomainError('CONFLICT', 'withdrawal cannot be rejected');
    await reverseWithdrawal(t, w, 'rejected');
    await audit(t.tx, { actorType: actor.type, actorId: actor.id, action: 'withdrawal.rejected', subjectType: 'withdrawal', subjectId: w.id, after: { reason } });
    return { status: 'rejected' };
  });
}

async function reverseWithdrawal(t: Parameters<Parameters<typeof runTx>[1]>[0], w: Withdrawal, status: 'rejected' | 'failed') {
  const postings = [{ account: userAcct(w.userId, w.asset, 'withdraw_pending'), amount: -w.amount }, { account: userAcct(w.userId, w.asset), amount: w.amount + w.fee }];
  if (w.fee > 0n) postings.push({ account: systemAcct(w.asset, 'fee'), amount: -w.fee });
  await postTx(t.tx, { type: 'withdraw_reverse', refType: 'withdrawal', refId: w.id, idempotencyKey: `withdrawal:${w.id}:reverse`, postings });
  await t.tx.update(withdrawals).set({ status, updatedAt: t.now() }).where(eq(withdrawals.id, w.id));
  await notify(t, t.tx, w.userId, 'withdrawal_status', { withdrawalId: w.id, status });
}

/** Submit an approved withdrawal to custody and settle the ledger on completion/failure. */
export async function submitWithdrawal(ctx: Ctx, withdrawalId: string) {
  const wcfg = await getConfig(ctx.db, 'withdrawals');
  if (wcfg.paused) return { status: 'paused' };
  const [w] = await ctx.db.update(withdrawals).set({ status: 'submitting', updatedAt: ctx.now() }).where(and(eq(withdrawals.id, withdrawalId), eq(withdrawals.status, 'approved'))).returning();
  if (!w) return { status: 'noop' };
  let res;
  try {
    res = await ctx.providers.custody.submitWithdrawal({ withdrawalId: w.id, asset: w.asset as Asset, network: w.network as Network, address: w.address, amount: w.amount });
  } catch (e) {
    await ctx.db.update(withdrawals).set({ status: 'approved' }).where(eq(withdrawals.id, w.id)); // retryable; custody call is idempotent on withdrawalId
    throw e;
  }
  await ctx.db.update(withdrawals).set({ custodyRef: res.custodyRef, txHash: res.txHash, status: 'submitted' }).where(eq(withdrawals.id, w.id));
  return settleWithdrawal(ctx, w.id, res);
}

export async function settleWithdrawal(ctx: Ctx, withdrawalId: string, res: { status: 'submitted' | 'completed' | 'failed'; txHash?: string }) {
  if (res.status === 'submitted') return { status: 'submitted' };
  return runTx(ctx, async (t) => {
    const [w] = await t.tx.select().from(withdrawals).where(eq(withdrawals.id, withdrawalId)).for('update');
    if (w.status !== 'submitted') return { status: w.status };
    if (res.status === 'failed') { await reverseWithdrawal(t, w, 'failed'); return { status: 'failed' }; }
    await postTx(t.tx, { type: 'withdraw_complete', refType: 'withdrawal', refId: w.id, idempotencyKey: `withdrawal:${w.id}:complete`, postings: [
      { account: userAcct(w.userId, w.asset, 'withdraw_pending'), amount: -w.amount }, { account: systemAcct(w.asset, 'custody'), amount: w.amount },
    ] });
    await t.tx.update(withdrawals).set({ status: 'completed', txHash: res.txHash ?? w.txHash, updatedAt: ctx.now() }).where(eq(withdrawals.id, w.id));
    await audit(t.tx, { actorType: 'system', action: 'withdrawal.completed', subjectType: 'withdrawal', subjectId: w.id, after: { txHash: res.txHash } });
    await notify(t, t.tx, w.userId, 'withdrawal_status', { withdrawalId: w.id, status: 'completed' });
    return { status: 'completed' };
  });
}

/** Worker: submit approved and poll submitted withdrawals. */
export async function processWithdrawals(ctx: Ctx) {
  const approved = await ctx.db.select({ id: withdrawals.id }).from(withdrawals).where(eq(withdrawals.status, 'approved')).limit(100);
  for (const w of approved) await submitWithdrawal(ctx, w.id).catch(() => null);
  const pending = await ctx.db.select().from(withdrawals).where(and(eq(withdrawals.status, 'submitted'), lte(withdrawals.updatedAt, new Date(ctx.now().getTime() - 30_000)))).limit(100);
  for (const w of pending) if (w.custodyRef) await settleWithdrawal(ctx, w.id, await ctx.providers.custody.getWithdrawal(w.custodyRef)).catch(() => null);
}

// ---------------------------------------------------------------- internal transfer
export async function internalTransfer(ctx: Ctx, from: User, input: { asset: Asset; toUserId: string; amount: string; totp?: string }) {
  await require2fa(ctx, from, input.totp);
  if (input.toUserId === from.id) throw new DomainError('VALIDATION', 'cannot transfer to yourself');
  const to = await reloadUser(ctx.db, input.toUserId);
  if (!to || to.status !== 'active') throw new DomainError('NOT_FOUND', 'recipient not found');
  const f = await reloadUser(ctx.db, from.id);
  if (f.status !== 'active') throw new DomainError('ACCOUNT_FROZEN', 'account not active');
  const amount = toMinor(input.amount, assetDecimals(input.asset));
  if (amount <= 0n) throw new DomainError('VALIDATION', 'amount must be positive');
  return runTx(ctx, async (t) => {
    const ref = crypto.randomUUID();
    await postTx(t.tx, { type: 'internal_transfer', refType: 'transfer', refId: ref, idempotencyKey: `transfer:${ref}`, postings: [
      { account: userAcct(from.id, input.asset), amount: -amount }, { account: userAcct(to.id, input.asset), amount },
    ] });
    await audit(t.tx, { actorType: 'user', actorId: from.id, action: 'transfer.internal', subjectType: 'user', subjectId: to.id, after: { asset: input.asset, amount } });
    await notify(t, t.tx, to.id, 'deposit_credited', { amount: input.amount, asset: input.asset, internal: true });
    return { id: ref, fee: '0' };
  });
}

export const listDeposits = async (ctx: Ctx, userId: string): Promise<Array<typeof deposits.$inferSelect>> => ctx.db.select().from(deposits).where(eq(deposits.userId, userId)).orderBy(desc(deposits.createdAt)).limit(100);
export const listWithdrawals = async (ctx: Ctx, userId: string): Promise<Withdrawal[]> => ctx.db.select().from(withdrawals).where(eq(withdrawals.userId, userId)).orderBy(desc(withdrawals.createdAt)).limit(100);
export async function pendingApprovals(ctx: Ctx) {
  return ctx.db.select().from(withdrawals).where(inArray(withdrawals.status, ['pending_approval'])).orderBy(withdrawals.createdAt);
}
export { balanceOf };
