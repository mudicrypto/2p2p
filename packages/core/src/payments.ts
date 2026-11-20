/** User payment methods. Details are validated against the catalog's JSON field schema and stored encrypted. */
import { paymentMethods, paymentMethodTypes, and, eq, inArray, type DbOrTx } from '@p2p/db';
import { DomainError } from '@p2p/shared';
import { z } from 'zod';
import type { Ctx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import { encryptJson, decryptJson } from './crypto';
import { getCountryRule } from './compliance';
import type { User } from './auth';

/** Field schema format stored in payment_method_types.fields_schema. */
export interface FieldSpec { name: string; type: 'string'; pattern?: string; min?: number; max?: number; optional?: boolean }
export function zodFromFields(fields: FieldSpec[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let s = z.string().min(f.min ?? 1).max(f.max ?? 128);
    if (f.pattern) s = s.regex(new RegExp(f.pattern));
    shape[f.name] = f.optional ? s.optional() : s;
  }
  return z.object(shape).strict();
}

export type PaymentMethodType = typeof paymentMethodTypes.$inferSelect;

export async function addPaymentMethod(ctx: Ctx, user: User, input: { type: string; holderName: string; details: Record<string, string> }) {
  const [t] = await ctx.db.select().from(paymentMethodTypes).where(eq(paymentMethodTypes.code, input.type));
  if (!t || !t.enabled) throw new DomainError('VALIDATION', 'payment method type unavailable');
  const rule = await getCountryRule(ctx.db, user.country);
  if (rule.allowedPaymentMethods && !rule.allowedPaymentMethods.includes(t.code)) throw new DomainError('FORBIDDEN', 'payment method not allowed in your country');
  if (t.reversible && user.kycTier < 2) throw new DomainError('TIER_REQUIRED', 'reversible methods require tier 2');
  const details = zodFromFields(t.fieldsSchema as FieldSpec[]).parse(input.details);
  return runTx(ctx, async (x) => {
    const [pm] = await x.tx.insert(paymentMethods).values({ userId: user.id, type: t.code, holderName: input.holderName.trim(), detailsEnc: encryptJson(details) }).returning();
    await audit(x.tx, { actorType: 'user', actorId: user.id, action: 'payment_method.added', subjectType: 'payment_method', subjectId: pm.id, after: { type: t.code } });
    return publicPaymentMethod(pm, true);
  });
}

export function publicPaymentMethod(pm: typeof paymentMethods.$inferSelect, withDetails: boolean) {
  return { id: pm.id, type: pm.type, holderName: pm.holderName, verified: pm.verified, details: withDetails ? decryptJson<Record<string, string>>(pm.detailsEnc) : undefined };
}

export async function listPaymentMethods(db: DbOrTx, userId: string) {
  const rows = await db.select().from(paymentMethods).where(and(eq(paymentMethods.userId, userId), eq(paymentMethods.active, true)));
  return rows.map((r) => publicPaymentMethod(r, true));
}

export async function getUserMethods(db: DbOrTx, userId: string, ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(paymentMethods).where(and(eq(paymentMethods.userId, userId), inArray(paymentMethods.id, ids), eq(paymentMethods.active, true)));
}

export async function getMethodTypes(db: DbOrTx, codes: string[]) {
  if (!codes.length) return [];
  return db.select().from(paymentMethodTypes).where(inArray(paymentMethodTypes.code, codes));
}
