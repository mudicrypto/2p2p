/**
 * Trade safety: automatic receipt checks, scam-pattern warnings in chat, payer-name confirmation
 * at release and risk signals about the buyer shown to the seller. Everything here is advisory:
 * the seller still decides, and the arbiter sees the same signals in a dispute.
 */
import { createHash } from 'node:crypto';
import { receiptChecks, orders, paymentMethods, reputation, users, and, eq, ne } from '@p2p/db';
import { DomainError, fromMinor } from '@p2p/shared';
import type { Ctx } from './context';
import { getKycName } from './kyc';
import { namesMatch } from './name-match';
import { fiatDecimals } from './fiat';

// ---------------------------------------------------------------- receipts
const EDITORS: Array<[string, RegExp]> = [
  ['Photoshop', /photoshop/i], ['GIMP', /\bgimp\b/i], ['Snapseed', /snapseed/i], ['PicsArt', /picsart/i], ['Canva', /canva/i],
  ['Pixelmator', /pixelmator/i], ['Lightroom', /lightroom/i], ['Affinity', /affinity (photo|designer)/i], ['Fotor', /fotor/i],
  ['Paint.NET', /paint\.net/i], ['Photopea', /photopea/i], ['PhotoDirector', /photodirector/i], ['Meitu', /meitu/i],
];
/** Metadata hints from the file itself (EXIF/XMP/PNG text): editing software and the earliest embedded date. */
export function receiptMetadata(file: Buffer) {
  const head = file.subarray(0, Math.min(file.length, 256 * 1024)).toString('latin1');
  const editor = EDITORS.find(([, re]) => re.test(head))?.[0];
  let earliest: Date | undefined;
  for (const m of head.matchAll(/(20\d\d|19\d\d):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/g)) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    if (!Number.isNaN(d.getTime()) && (!earliest || d < earliest)) earliest = d;
  }
  return { editor, earliest };
}

const norm = (s: string) => s.replace(/[^\d.]/g, '');
/**
 * Runs when a buyer uploads a file to an order. Flags: duplicate_receipt (same file used on another order),
 * edited:<tool>, older_than_order, and — when a receipt reader is configured — amount_mismatch, payee_mismatch, payer_mismatch.
 */
export async function checkReceipt(ctx: Ctx, orderId: string, userId: string, fileKey: string, file: Buffer, contentType: string) {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId));
  if (!o || o.buyerId !== userId) return null; // only buyers' uploads are payment proofs
  const sha = createHash('sha256').update(file).digest('hex');
  const flags: string[] = [];
  const dup = await ctx.db.select({ o: receiptChecks.orderId }).from(receiptChecks).where(and(eq(receiptChecks.sha256, sha), ne(receiptChecks.orderId, orderId))).limit(1);
  if (dup.length) flags.push('duplicate_receipt');
  const meta = receiptMetadata(file);
  if (meta.editor) flags.push(`edited:${meta.editor}`);
  if (meta.earliest && meta.earliest.getTime() < o.createdAt.getTime() - 24 * 3600_000) flags.push('older_than_order');
  let extracted: Awaited<ReturnType<NonNullable<Ctx['providers']['receiptReader']>['read']>> | null = null;
  if (ctx.providers.receiptReader) {
    extracted = await ctx.providers.receiptReader.read(file, contentType).catch(() => null);
    if (extracted) {
      const fd = await fiatDecimals(ctx.db, o.fiat);
      if (extracted.amount && Number(norm(extracted.amount)) !== Number(fromMinor(o.fiatAmount, fd))) flags.push('amount_mismatch');
      if (extracted.payeeName && o.paymentMethodId) {
        const [pm] = await ctx.db.select({ h: paymentMethods.holderName }).from(paymentMethods).where(eq(paymentMethods.id, o.paymentMethodId));
        if (pm && !namesMatch(pm.h, extracted.payeeName)) flags.push('payee_mismatch');
      }
      const buyerName = await getKycName(ctx.db, o.buyerId);
      if (extracted.payerName && buyerName && !namesMatch(buyerName, extracted.payerName)) flags.push('payer_mismatch');
    }
  }
  await ctx.db.insert(receiptChecks).values({ fileKey, orderId, userId, sha256: sha, flags, extracted }).onConflictDoNothing();
  return { flags, extracted };
}

/** Results for the order's participants (seller decides; buyer sees what the seller sees). */
export async function listReceiptChecks(ctx: Ctx, viewerId: string, orderId: string) {
  const [o] = await ctx.db.select({ b: orders.buyerId, s: orders.sellerId }).from(orders).where(eq(orders.id, orderId));
  if (!o || (o.b !== viewerId && o.s !== viewerId)) throw new DomainError('NOT_FOUND', 'order not found');
  const rows = await ctx.db.select().from(receiptChecks).where(eq(receiptChecks.orderId, orderId));
  return { automaticReading: !!ctx.providers.receiptReader, receipts: rows.map((r) => ({ fileKey: r.fileKey, flags: r.flags, extracted: r.extracted, createdAt: r.createdAt })) };
}

// ---------------------------------------------------------------- chat scam patterns
/** Phrases common in P2P scams. Messages are delivered, but the other party sees a caution next to them. */
const SCAM: Array<[string, RegExp]> = [
  ['release_first', /\brelease (it |the (coins?|crypto|usdt) )?(first|now|before)\b|\bsend (the )?(coins?|crypto|usdt) first\b|сначала (отпусти|отправь)|libera primero|libera antes/i],
  ['payment_pending', /\b(payment|transfer|money) (is )?(pending|on hold|processing|in process|stuck)\b|\bbank (is )?(holding|delayed)\b|платеж (в обработке|завис)|pago pendiente|pagamento pendente/i],
  ['other_account', /\b(refund|return|send|pay)\b.{0,30}\b(another|other|different|my (friend'?s?|wife'?s?|husband'?s?|brother'?s?|second))\s+(account|card|wallet|bank)\b|на другую карту|otra cuenta|outra conta/i],
  ['third_party', /\b(my )?(friend|wife|husband|brother|sister|cousin|company|boss|colleague) (will )?(pay|send|transfer)\b|заплатит (друг|жена|брат)/i],
  ['fake_fee', /\b(verification|unlock|activation|tax|clearance|release) fee\b|\bpay (a|the) fee to (release|unlock)\b|комиссия за разблокировку/i],
  ['chargeback', /\bchargeback\b|\bcancel (the )?(order|trade) and (pay|send|transfer)\b|\bscreenshot (is )?enough\b/i],
];
export function scamWarning(body: string): string | null {
  const n = body.normalize('NFKC');
  return SCAM.find(([, re]) => re.test(n))?.[0] ?? null;
}

// ---------------------------------------------------------------- buyer risk signals (for the seller)
/**
 * Plain facts about the buyer that call for extra care. Shown to the seller only, while the order is open.
 * new_account (<7 days), first_trade, unverified, large_for_history (>$1,000 with <5 trades), lost_disputes, high_risk.
 */
export async function buyerSignals(ctx: Ctx, o: { buyerId: string; usdValueCents: bigint; riskScore: number }) {
  const [u] = await ctx.db.select({ createdAt: users.createdAt, tier: users.kycTier }).from(users).where(eq(users.id, o.buyerId));
  const [rep] = await ctx.db.select().from(reputation).where(eq(reputation.userId, o.buyerId));
  const trades = rep?.tradesTotal ?? 0;
  const s: string[] = [];
  if (u && ctx.now().getTime() - u.createdAt.getTime() < 7 * 86400_000) s.push('new_account');
  if (trades === 0) s.push('first_trade');
  if ((u?.tier ?? 0) === 0) s.push('unverified');
  if (o.usdValueCents > 100_000n && trades < 5) s.push('large_for_history');
  if ((rep?.disputeRateBps ?? 0) >= 1000 && trades >= 3) s.push('lost_disputes');
  if (o.riskScore >= 50) s.push('high_risk');
  return s;
}

/** The buyer's verified legal name, for the seller's payer-name check (null when the buyer isn't ID-verified). */
export const buyerVerifiedName = (ctx: Ctx, buyerId: string) => getKycName(ctx.db, buyerId);
