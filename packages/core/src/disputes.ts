/**
 * Disputes (spec 7): opening with evidence, AI triage (advisory only), arbiter queue with SLA + escalation,
 * decisions that write ledger transactions + audit, repeat-offender auto-freeze.
 */
import { disputes, disputeEvidence, orders, chatMessages, paymentConfirmations, users, and, eq, inArray, asc, sql } from '@p2p/db';
import { DomainError, type OrderActor } from '@p2p/shared';
import type { Ctx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import { getConfig } from './config';
import { transition, applyEscrow, lockOrder, type Order } from './orders';
import { notify } from './notifications';
import { recomputeReputation } from './reputation';
import { flag } from './risk';
import type { User } from './auth';

export type Dispute = typeof disputes.$inferSelect;
export type DisputeReason = 'not_paid' | 'not_released' | 'wrong_amount' | 'third_party_payment' | 'fraud' | 'other';

async function createDisputeRow(ctx: Ctx, o: Order, actor: OrderActor, actorId: string | null, input: { reason: string; note?: string; evidenceKeys: string[] }) {
  const cfg = await getConfig(ctx.db, 'disputes');
  return runTx(ctx, async (t) => {
    const locked = await lockOrder(t, o.id);
    await transition(t, locked, 'OPEN_DISPUTE', actor, actorId, input.reason);
    const [d] = await t.tx.insert(disputes).values({
      orderId: o.id, openedBy: actorId, reason: input.reason, note: input.note, slaDueAt: new Date(ctx.now().getTime() + cfg.slaMin * 60_000),
    }).returning();
    if (input.evidenceKeys.length)
      await t.tx.insert(disputeEvidence).values(input.evidenceKeys.map((k) => ({ disputeId: d.id, userId: actorId, fileKey: k, note: input.note })));
    await t.tx.insert(chatMessages).values({ orderId: o.id, senderId: null, system: true, body: `Dispute opened (${input.reason}). An arbiter will review within ${cfg.slaMin} minutes.` });
    await audit(t.tx, { actorType: actor === 'system' ? 'system' : 'user', actorId, action: 'dispute.opened', subjectType: 'dispute', subjectId: d.id, after: { orderId: o.id, reason: input.reason } });
    t.afterCommit(async () => {
      if (ctx.jobs) await ctx.jobs.enqueue('dispute.triage', { disputeId: d.id });
      else await runTriage(ctx, d.id).catch(() => null);
    });
    return d;
  });
}

export async function openDispute(ctx: Ctx, user: User, orderId: string, input: { reason: DisputeReason; note: string; evidenceKeys: string[] }) {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId));
  if (!o || (o.buyerId !== user.id && o.sellerId !== user.id)) throw new DomainError('NOT_FOUND', 'order not found');
  if (o.status !== 'PAID') throw new DomainError('ILLEGAL_TRANSITION', 'disputes can only be opened on paid orders');
  if (!input.reason || !input.note?.trim()) throw new DomainError('VALIDATION', 'reason and note required');
  if (!input.evidenceKeys?.length) throw new DomainError('VALIDATION', 'evidence required');
  if (input.evidenceKeys.some((k) => !k.startsWith(`orders/${orderId}/`))) throw new DomainError('VALIDATION', 'evidence must be uploaded to this order');
  const trading = await getConfig(ctx.db, 'trading');
  const availableAt = (o.paidAt?.getTime() ?? 0) + trading.appealWaitMin * 60_000;
  if (ctx.now().getTime() < availableAt) throw new DomainError('COOLDOWN', `dispute available at ${new Date(availableAt).toISOString()}`, { availableAt });
  return createDisputeRow(ctx, o, o.buyerId === user.id ? 'buyer' : 'seller', user.id, input);
}

/** Automatic dispute (e.g. third-party payment detected). No appeal wait. */
export async function openDisputeSystem(ctx: Ctx, orderId: string, reason: DisputeReason, note?: string) {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) throw new DomainError('NOT_FOUND', 'order not found');
  return createDisputeRow(ctx, o, 'system', null, { reason, note: note ?? 'opened automatically', evidenceKeys: [] });
}

async function participantDispute(ctx: Ctx, userId: string, disputeId: string) {
  const [r] = await ctx.db.select({ d: disputes, o: orders }).from(disputes).innerJoin(orders, eq(orders.id, disputes.orderId)).where(eq(disputes.id, disputeId));
  if (!r || (r.o.buyerId !== userId && r.o.sellerId !== userId)) throw new DomainError('NOT_FOUND', 'dispute not found');
  return r;
}

export async function addEvidence(ctx: Ctx, user: User, disputeId: string, fileKey: string, note?: string) {
  const { d, o } = await participantDispute(ctx, user.id, disputeId);
  if (d.status === 'resolved') throw new DomainError('CONFLICT', 'dispute already resolved');
  if (!fileKey.startsWith(`orders/${o.id}/`)) throw new DomainError('VALIDATION', 'evidence must be uploaded to this order');
  return runTx(ctx, async (t) => {
    const [e] = await t.tx.insert(disputeEvidence).values({ disputeId, userId: user.id, fileKey, note }).returning();
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'dispute.evidence_added', subjectType: 'dispute', subjectId: disputeId });
    return { id: e.id.toString(), fileKey: e.fileKey, note: e.note };
  });
}

/** LLM/heuristic triage. Stores a recommendation + confidence; never decides. */
export async function runTriage(ctx: Ctx, disputeId: string) {
  const [d] = await ctx.db.select().from(disputes).where(eq(disputes.id, disputeId));
  if (!d) throw new DomainError('NOT_FOUND', 'dispute not found');
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, d.orderId));
  const chat = await ctx.db.select().from(chatMessages).where(eq(chatMessages.orderId, o.id)).orderBy(asc(chatMessages.id));
  const ev = await ctx.db.select().from(disputeEvidence).where(eq(disputeEvidence.disputeId, disputeId));
  const pc = await ctx.db.select().from(paymentConfirmations).where(eq(paymentConfirmations.orderId, o.id));
  const role = (id: string | null) => (id === o.buyerId ? 'buyer' : id === o.sellerId ? 'seller' : 'system');
  const out = await ctx.providers.triage.triage({
    orderSummary: { id: o.id, asset: o.asset, fiat: o.fiat, cryptoAmount: o.cryptoAmount.toString(), fiatAmount: o.fiatAmount.toString(), paymentType: o.paymentType, paidAt: o.paidAt?.toISOString(), reason: d.reason, note: d.note, riskScore: o.riskScore },
    chat: chat.map((c) => ({ from: role(c.senderId) + (c.flagged ? ' [blocked off-platform message]' : ''), body: c.body, at: c.createdAt.toISOString() })),
    evidenceNotes: ev.map((e) => `${role(e.userId)}: ${e.note ?? ''} (${e.fileKey})`),
    verifierData: pc.map((p) => ({ provider: p.provider, amountMatch: p.amountMatch, referenceMatch: p.referenceMatch, nameMatch: p.nameMatch })),
  });
  await ctx.db.update(disputes).set({ aiSummary: `${out.summary}\n\n${out.rationale}`, aiRecommendation: out.recommendation, aiConfidence: out.confidence }).where(eq(disputes.id, disputeId));
  return out;
}

// ---------------------------------------------------------------- arbiter
export async function assignDispute(ctx: Ctx, adminId: string, disputeId: string) {
  return runTx(ctx, async (t) => {
    const [d] = await t.tx.select().from(disputes).where(eq(disputes.id, disputeId)).for('update');
    if (!d) throw new DomainError('NOT_FOUND', 'dispute not found');
    if (d.status === 'resolved') throw new DomainError('CONFLICT', 'dispute already resolved');
    const [u] = await t.tx.update(disputes).set({ assignedArbiterId: adminId, status: d.status === 'escalated' ? 'escalated' : 'in_review' }).where(eq(disputes.id, disputeId)).returning();
    await audit(t.tx, { actorType: 'admin', actorId: adminId, action: 'dispute.assigned', subjectType: 'dispute', subjectId: disputeId, before: { arbiter: d.assignedArbiterId }, after: { arbiter: adminId } });
    return u;
  });
}

export interface DisputeDecision { decision: 'release' | 'refund' | 'split'; splitBuyerBps?: number; note: string }

export async function decideDispute(ctx: Ctx, adminId: string, disputeId: string, input: DisputeDecision) {
  if (!input.note?.trim()) throw new DomainError('VALIDATION', 'decision note required');
  if (input.decision === 'split' && (!Number.isInteger(input.splitBuyerBps) || input.splitBuyerBps! <= 0 || input.splitBuyerBps! >= 10_000))
    throw new DomainError('VALIDATION', 'splitBuyerBps must be between 1 and 9999');
  const cfg = await getConfig(ctx.db, 'disputes');
  const result = await runTx(ctx, async (t) => {
    const [d] = await t.tx.select().from(disputes).where(eq(disputes.id, disputeId)).for('update');
    if (!d) throw new DomainError('NOT_FOUND', 'dispute not found');
    if (d.status === 'resolved') throw new DomainError('CONFLICT', 'dispute already resolved');
    const o = await lockOrder(t, d.orderId);
    const event = input.decision === 'release' ? 'ARBITER_RELEASE' : input.decision === 'refund' ? 'ARBITER_REFUND' : 'ARBITER_SPLIT';
    const patch = input.decision === 'refund' ? { cancelledAt: ctx.now() } : { releasedAt: ctx.now() };
    await transition(t, o, event, 'arbiter', adminId, input.note, patch);
    await applyEscrow(ctx, t, o, input.decision, input.splitBuyerBps ?? 0);
    const loserId = input.decision === 'release' ? o.sellerId : input.decision === 'refund' ? o.buyerId : null;
    await t.tx.update(disputes).set({ status: 'resolved', decision: input.decision, splitBuyerBps: input.splitBuyerBps ?? null, decisionNote: input.note, loserId, resolvedAt: ctx.now(), assignedArbiterId: d.assignedArbiterId ?? adminId }).where(eq(disputes.id, d.id));
    await t.tx.insert(chatMessages).values({ orderId: o.id, senderId: null, system: true, body: `Dispute resolved: ${input.decision}. Reason: ${input.note}` });
    await audit(t.tx, { actorType: 'admin', actorId: adminId, action: 'dispute.decided', subjectType: 'dispute', subjectId: d.id, before: { status: d.status }, after: { decision: input.decision, splitBuyerBps: input.splitBuyerBps, note: input.note, loserId } });
    for (const uid of [o.buyerId, o.sellerId]) await notify(t, t.tx, uid, 'dispute_resolved', { orderId: o.id, decision: input.decision, reason: input.note });
    if (loserId) {
      const [{ lost }] = await t.tx.select({ lost: sql<number>`count(*)::int` }).from(disputes).where(eq(disputes.loserId, loserId));
      if (lost >= cfg.autoFreezeLostDisputes) {
        const [u] = await t.tx.select({ status: users.status }).from(users).where(eq(users.id, loserId));
        if (u?.status === 'active') {
          await t.tx.update(users).set({ status: 'frozen' }).where(eq(users.id, loserId));
          await audit(t.tx, { actorType: 'system', action: 'user.auto_frozen', subjectType: 'user', subjectId: loserId, before: { status: 'active' }, after: { status: 'frozen', lostDisputes: lost } });
          await flag(t.tx, 'user', loserId, 'REPEAT_DISPUTE_LOSER', 'high', { lostDisputes: lost });
        }
      }
    }
    return { orderId: o.id, decision: input.decision, loserId, buyerId: o.buyerId, sellerId: o.sellerId };
  });
  for (const uid of [result.buyerId, result.sellerId]) await recomputeReputation(ctx, uid);
  return { orderId: result.orderId, decision: result.decision, loserId: result.loserId };
}

/** SLA: escalate disputes past their due time and page on-call. */
export async function escalateOverdueDisputes(ctx: Ctx) {
  const rows = await ctx.db.update(disputes).set({ status: 'escalated', escalatedAt: ctx.now() })
    .where(and(inArray(disputes.status, ['open', 'in_review']), sql`${disputes.slaDueAt} < ${ctx.now().toISOString()}`)).returning();
  for (const d of rows) {
    await audit(ctx.db, { actorType: 'system', action: 'dispute.escalated', subjectType: 'dispute', subjectId: d.id, after: { slaDueAt: d.slaDueAt } });
    await ctx.providers.notifier.send({ channel: (process.env.ONCALL_CHANNEL as 'telegram') ?? 'telegram', to: process.env.ONCALL_TARGET ?? 'oncall', template: 'dispute_escalated', params: { disputeId: d.id, orderId: d.orderId } }).catch(() => null);
  }
  return rows.length;
}

export async function arbiterQueue(ctx: Ctx, opts: { status?: string[] } = {}) {
  const status = opts.status?.length ? opts.status : ['open', 'in_review', 'escalated'];
  const rows = await ctx.db.select({ d: disputes, o: { asset: orders.asset, fiat: orders.fiat, cryptoAmount: orders.cryptoAmount, fiatAmount: orders.fiatAmount, usdValueCents: orders.usdValueCents } })
    .from(disputes).innerJoin(orders, eq(orders.id, disputes.orderId)).where(inArray(disputes.status, status)).orderBy(asc(disputes.slaDueAt)).limit(200);
  const now = ctx.now().getTime();
  return rows.map(({ d, o }) => ({
    id: d.id, orderId: d.orderId, reason: d.reason, status: d.status, assignedArbiterId: d.assignedArbiterId, slaDueAt: d.slaDueAt,
    secondsRemaining: Math.floor((d.slaDueAt.getTime() - now) / 1000), overdue: d.slaDueAt.getTime() < now,
    aiRecommendation: d.aiRecommendation, aiConfidence: d.aiConfidence, ...o, createdAt: d.createdAt,
  }));
}

export async function getDisputeDetail(ctx: Ctx, disputeId: string) {
  const [d] = await ctx.db.select().from(disputes).where(eq(disputes.id, disputeId));
  if (!d) throw new DomainError('NOT_FOUND', 'dispute not found');
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, d.orderId));
  const chat = await ctx.db.select().from(chatMessages).where(eq(chatMessages.orderId, o.id)).orderBy(asc(chatMessages.id));
  const evidence = await ctx.db.select().from(disputeEvidence).where(eq(disputeEvidence.disputeId, d.id));
  const confirmations = await ctx.db.select().from(paymentConfirmations).where(eq(paymentConfirmations.orderId, o.id));
  return {
    dispute: d, order: o,
    chat: chat.map((c) => ({ id: c.id.toString(), senderId: c.senderId, body: c.body, attachmentKey: c.attachmentKey, flagged: c.flagged, system: c.system, createdAt: c.createdAt })),
    evidence: evidence.map((e) => ({ id: e.id.toString(), userId: e.userId, fileKey: e.fileKey, note: e.note, createdAt: e.createdAt })),
    paymentConfirmations: confirmations.map((p) => ({ provider: p.provider, providerRef: p.providerRef, amountMatch: p.amountMatch, referenceMatch: p.referenceMatch, nameMatch: p.nameMatch, createdAt: p.createdAt })),
  };
}

/** Participant view (no AI fields, no flagged chat). */
export async function getDisputeForParticipant(ctx: Ctx, user: User, orderId: string) {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId));
  if (!o || (o.buyerId !== user.id && o.sellerId !== user.id)) throw new DomainError('NOT_FOUND', 'order not found');
  const [d] = await ctx.db.select().from(disputes).where(eq(disputes.orderId, orderId));
  if (!d) return null;
  const evidence = await ctx.db.select().from(disputeEvidence).where(eq(disputeEvidence.disputeId, d.id));
  return {
    id: d.id, orderId, reason: d.reason, note: d.note, status: d.status, openedBy: d.openedBy, decision: d.decision, splitBuyerBps: d.splitBuyerBps,
    decisionNote: d.decisionNote, slaDueAt: d.slaDueAt, resolvedAt: d.resolvedAt, createdAt: d.createdAt,
    evidence: evidence.map((e) => ({ id: e.id.toString(), mine: e.userId === user.id, fileKey: e.userId === user.id ? e.fileKey : undefined, note: e.note, createdAt: e.createdAt })),
  };
}
