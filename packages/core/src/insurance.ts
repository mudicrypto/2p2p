/**
 * Insurance fund (spec 6): a system account funded by a slice of fees (see applyEscrow) and admin top-ups.
 * Sellers whose bank froze the received fiat submit a freeze report with the bank letter; an arbiter
 * reviews it and approved reports are paid out from the fund.
 */
import { freezeReports, orders, and, eq, desc } from '@p2p/db';
import { DomainError, type Asset } from '@p2p/shared';
import type { Ctx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import { getConfig } from './config';
import { postTx, systemAcct, userAcct, balanceOf } from './ledger';
import { usdCents } from './limits';
import { notify } from './notifications';
import { recomputeReputation } from './reputation';
import { flag } from './risk';
import type { User } from './auth';

export type FreezeReport = typeof freezeReports.$inferSelect;

export const insuranceBalance = (ctx: Ctx, asset: Asset | string) => balanceOf(ctx.db, systemAcct(asset, 'insurance'));

/** Admin top-up: move platform fees into the insurance fund. */
export async function fundInsurance(ctx: Ctx, adminId: string, asset: Asset, amount: bigint, idempotencyKey: string) {
  if (amount <= 0n) throw new DomainError('VALIDATION', 'amount must be positive');
  return runTx(ctx, async (t) => {
    const r = await postTx(t.tx, { type: 'adjustment', refType: 'insurance_topup', refId: adminId, idempotencyKey: `insurance:topup:${idempotencyKey}`, postings: [
      { account: systemAcct(asset, 'fee'), amount: -amount }, { account: systemAcct(asset, 'insurance'), amount },
    ] });
    if (!r.replayed) await audit(t.tx, { actorType: 'admin', actorId: adminId, action: 'insurance.funded', subjectType: 'system', subjectId: `insurance:${asset}`, after: { asset, amount } });
    return { txId: r.txId, replayed: r.replayed };
  });
}

export async function submitFreezeReport(ctx: Ctx, user: User, input: { orderId: string; bankLetterKey: string; claimedAmountFiat: bigint }) {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, input.orderId));
  if (!o || o.sellerId !== user.id) throw new DomainError('NOT_FOUND', 'order not found');
  if (o.status !== 'COMPLETED') throw new DomainError('CONFLICT', 'freeze reports are only for completed orders');
  if (!input.bankLetterKey.startsWith(`orders/${o.id}/`)) throw new DomainError('VALIDATION', 'bank letter must be uploaded to this order');
  if (input.claimedAmountFiat <= 0n || input.claimedAmountFiat > o.fiatAmount) throw new DomainError('VALIDATION', 'claimed amount must be between 0 and the order amount');
  return runTx(ctx, async (t) => {
    const ins = await t.tx.insert(freezeReports).values({ reporterId: user.id, orderId: o.id, bankLetterKey: input.bankLetterKey, claimedAmountFiat: input.claimedAmountFiat }).onConflictDoNothing().returning();
    if (!ins.length) throw new DomainError('CONFLICT', 'a freeze report already exists for this order');
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'freeze_report.submitted', subjectType: 'freeze_report', subjectId: ins[0].id, after: { orderId: o.id, claimed: input.claimedAmountFiat } });
    await flag(t.tx, 'user', o.buyerId, 'FREEZE_REPORT_PENDING', 'medium', { orderId: o.id, reportId: ins[0].id });
    return ins[0];
  });
}

export interface FreezeReview { approve: boolean; payoutAsset?: Asset; payoutAmount?: bigint; note: string }

export async function reviewFreezeReport(ctx: Ctx, adminId: string, reportId: string, input: FreezeReview) {
  if (!input.note?.trim()) throw new DomainError('VALIDATION', 'review note required');
  const cfg = await getConfig(ctx.db, 'insurance');
  let cents = 0n;
  if (input.approve) {
    if (!input.payoutAsset || !input.payoutAmount || input.payoutAmount <= 0n) throw new DomainError('VALIDATION', 'payout asset and positive amount required');
    cents = await usdCents(ctx, ctx.db, input.payoutAsset, input.payoutAmount);
    if (cents > BigInt(cfg.maxPayoutUsdCents)) throw new DomainError('LIMIT_EXCEEDED', 'payout exceeds the insurance cap', { capUsdCents: String(cfg.maxPayoutUsdCents) });
  }
  const r = await runTx(ctx, async (t) => {
    const [fr] = await t.tx.select().from(freezeReports).where(eq(freezeReports.id, reportId)).for('update');
    if (!fr) throw new DomainError('NOT_FOUND', 'report not found');
    if (fr.status !== 'pending') throw new DomainError('CONFLICT', `report already ${fr.status}`);
    const [o] = await t.tx.select().from(orders).where(eq(orders.id, fr.orderId));
    if (input.approve) {
      await postTx(t.tx, { type: 'insurance_payout', refType: 'freeze_report', refId: fr.id, idempotencyKey: `freeze:${fr.id}:payout`, postings: [
        { account: systemAcct(input.payoutAsset!, 'insurance'), amount: -input.payoutAmount! }, { account: userAcct(fr.reporterId, input.payoutAsset!), amount: input.payoutAmount! },
      ] });
      await t.tx.update(freezeReports).set({ status: 'paid', payoutAsset: input.payoutAsset, payoutAmount: input.payoutAmount, reviewedBy: adminId, reviewNote: input.note }).where(eq(freezeReports.id, fr.id));
      await flag(t.tx, 'user', o.buyerId, 'FREEZE_REPORT_CONFIRMED', 'high', { orderId: o.id, reportId: fr.id });
    } else {
      await t.tx.update(freezeReports).set({ status: 'rejected', reviewedBy: adminId, reviewNote: input.note }).where(eq(freezeReports.id, fr.id));
    }
    await audit(t.tx, { actorType: 'admin', actorId: adminId, action: input.approve ? 'freeze_report.paid' : 'freeze_report.rejected', subjectType: 'freeze_report', subjectId: fr.id,
      before: { status: fr.status }, after: { payoutAsset: input.payoutAsset, payoutAmount: input.payoutAmount, usdCents: cents, note: input.note } });
    await notify(t, t.tx, fr.reporterId, 'freeze_report_reviewed', { reportId: fr.id, orderId: fr.orderId, approved: input.approve, reason: input.note });
    return { buyerId: o.buyerId, status: input.approve ? 'paid' : 'rejected' };
  });
  await recomputeReputation(ctx, r.buyerId);
  return { status: r.status };
}

export async function listFreezeReports(ctx: Ctx, opts: { reporterId?: string; status?: string } = {}) {
  const conds = [];
  if (opts.reporterId) conds.push(eq(freezeReports.reporterId, opts.reporterId));
  if (opts.status) conds.push(eq(freezeReports.status, opts.status));
  return ctx.db.select().from(freezeReports).where(conds.length ? and(...conds) : undefined).orderBy(desc(freezeReports.createdAt)).limit(200);
}
