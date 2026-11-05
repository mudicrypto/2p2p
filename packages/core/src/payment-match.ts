/**
 * Fiat payment verification (spec 4/6, M8 + M10). An incoming payment report is matched against the order:
 * amount, unique reference code, and payer name vs the buyer's KYC name. Auto-release only on a full match;
 * a third-party payer triggers an automatic dispute flag.
 */
import { orders, paymentConfirmations, paymentMethods, eq } from '@p2p/db';
import { DomainError } from '@p2p/shared';
import type { IncomingPayment } from '@p2p/providers';
import type { Ctx } from './context';
import { runTx } from './context';
import { transition, autoRelease, type Order } from './orders';
import { getKycName } from './kyc';
import { namesMatch } from './name-match';
import { encrypt, decryptJson } from './crypto';
import { flag } from './risk';
import { audit } from './audit';
import { openDisputeSystem } from './disputes';

export interface MatchResult { amountMatch: boolean; referenceMatch: boolean; nameMatch: boolean; full: boolean }

export function evaluatePayment(o: Pick<Order, 'fiatAmount' | 'fiat' | 'referenceCode'>, p: Pick<IncomingPayment, 'amount' | 'fiat' | 'reference' | 'payerName'>, kycName: string | null): MatchResult {
  const amountMatch = p.fiat === o.fiat && p.amount === o.fiatAmount;
  const referenceMatch = p.reference.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(o.referenceCode);
  const nameMatch = !!kycName && namesMatch(kycName, p.payerName);
  return { amountMatch, referenceMatch, nameMatch, full: amountMatch && referenceMatch && nameMatch };
}

export type PaymentOutcome = 'auto_released' | 'confirmed_manual' | 'third_party_flagged' | 'mismatch' | 'duplicate' | 'not_applicable';

/** Apply a verifier report to an order. Idempotent on (provider, providerRef). */
export async function handleIncomingPayment(ctx: Ctx, orderId: string, p: IncomingPayment): Promise<{ outcome: PaymentOutcome; match: MatchResult }> {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) throw new DomainError('NOT_FOUND', 'order not found');
  const kyc = await getKycName(ctx.db, o.buyerId);
  const m = evaluatePayment(o, p, kyc);
  const ins = await ctx.db.insert(paymentConfirmations).values({
    orderId, provider: p.rail, providerRef: p.providerRef, amountMatch: m.amountMatch, referenceMatch: m.referenceMatch, nameMatch: m.nameMatch,
    payerNameEnc: encrypt(p.payerName), raw: { amount: p.amount.toString(), fiat: p.fiat, reference: p.reference, receivedAt: p.receivedAt },
  }).onConflictDoNothing().returning();
  if (!ins.length) return { outcome: 'duplicate', match: m };
  if (!['AWAITING_PAYMENT', 'PAID'].includes(o.status)) return { outcome: 'not_applicable', match: m };

  // Third-party payment: amount+reference fit, but the payer is not the buyer.
  if (m.amountMatch && m.referenceMatch && !m.nameMatch) {
    await flag(ctx.db, 'order', o.id, 'THIRD_PARTY_PAYMENT', 'high', { rail: p.rail });
    await flag(ctx.db, 'user', o.buyerId, 'THIRD_PARTY_PAYMENT', 'high', { orderId: o.id });
    await ctx.db.update(orders).set({ manualConfirmRequired: true }).where(eq(orders.id, o.id));
    if (o.status === 'AWAITING_PAYMENT') {
      await runTx(ctx, async (t) => { const [cur] = await t.tx.select().from(orders).where(eq(orders.id, o.id)).for('update'); if (cur.status === 'AWAITING_PAYMENT') await transition(t, cur, 'VERIFIER_CONFIRMED', 'verifier', null, 'third_party_payer', { paidAt: ctx.now() }); });
    }
    await openDisputeSystem(ctx, o.id, 'third_party_payment', 'Payment verifier: payer name does not match the buyer\'s verified name.').catch((e) => { if (!(e instanceof DomainError)) throw e; });
    return { outcome: 'third_party_flagged', match: m };
  }
  if (!m.full) {
    await audit(ctx.db, { actorType: 'system', action: 'payment.mismatch', subjectType: 'order', subjectId: o.id, after: m });
    return { outcome: 'mismatch', match: m };
  }
  if (o.status === 'AWAITING_PAYMENT') {
    await runTx(ctx, async (t) => { const [cur] = await t.tx.select().from(orders).where(eq(orders.id, o.id)).for('update'); if (cur.status === 'AWAITING_PAYMENT') await transition(t, cur, 'VERIFIER_CONFIRMED', 'verifier', null, 'verifier_full_match', { paidAt: ctx.now() }); });
  }
  const [fresh] = await ctx.db.select().from(orders).where(eq(orders.id, o.id));
  if (fresh.manualConfirmRequired) return { outcome: 'confirmed_manual', match: m }; // high-risk: seller must release manually
  await autoRelease(ctx, o.id, 'verifier');
  return { outcome: 'auto_released', match: m };
}

/** Poll the rail's verifier for an order (worker job 'payment.verify'). */
export async function verifyOrderPayment(ctx: Ctx, orderId: string) {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId));
  if (!o || !['AWAITING_PAYMENT', 'PAID'].includes(o.status) || !o.paymentType) return null;
  const v = ctx.providers.verifiers.get(o.paymentType);
  if (!v) return null;
  const [pm] = o.paymentMethodId ? await ctx.db.select().from(paymentMethods).where(eq(paymentMethods.id, o.paymentMethodId)) : [];
  const kyc = await getKycName(ctx.db, o.buyerId);
  const found = await v.findPayment({ orderId, rail: o.paymentType, fiat: o.fiat, amount: o.fiatAmount, referenceCode: o.referenceCode, expectedPayerName: kyc ?? '', payeeDetails: pm ? decryptJson(pm.detailsEnc) : {} });
  if (!found) return null;
  return handleIncomingPayment(ctx, orderId, found);
}
