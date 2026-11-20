/** Risk engine (M8 extends this). Device / multi-account checks are used from M1 device tracking. */
import { devices, riskFlags, and, eq, isNull, sql } from '@p2p/db';
import type { Ctx } from './context';
import type { DbOrTx } from '@p2p/db';
import { getConfig } from './config';

export async function flag(db: DbOrTx, subjectType: string, subjectId: string, code: string, severity: 'low' | 'medium' | 'high', details?: unknown) {
  const [existing] = await db.select({ id: riskFlags.id }).from(riskFlags)
    .where(and(eq(riskFlags.subjectType, subjectType), eq(riskFlags.subjectId, subjectId), eq(riskFlags.code, code), isNull(riskFlags.resolvedAt)));
  if (existing) return existing.id;
  const [r] = await db.insert(riskFlags).values({ subjectType, subjectId, code, severity, details: details as object }).returning({ id: riskFlags.id });
  return r.id;
}

export async function evaluateDeviceRisk(ctx: Ctx, userId: string, fingerprint: string, _ip?: string) {
  const cfg = await getConfig(ctx.db, 'risk');
  const [{ c }] = await ctx.db.select({ c: sql<number>`count(distinct ${devices.userId})::int` }).from(devices).where(eq(devices.fingerprint, fingerprint));
  if (c > cfg.maxAccountsPerDevice) {
    const others = await ctx.db.select({ u: devices.userId }).from(devices).where(eq(devices.fingerprint, fingerprint));
    for (const o of others) await flag(ctx.db, 'user', o.u, 'MULTI_ACCOUNT_DEVICE', 'high', { fingerprint, accounts: c });
  }
}

export interface RiskFlagSpec { code: string; severity: 'low' | 'medium' | 'high'; details?: unknown }
export interface OrderRiskInput {
  buyer: { id: string; kycTier: number; createdAt: Date };
  seller: { id: string; kycTier: number; createdAt: Date };
  usdCents: bigint; paymentRisk: string; reversible: boolean;
}
/**
 * Order risk score 0-100 from account age, tier, device, amount vs history and counterparty freeze reports.
 * High scores force the manual-confirmation path (no auto-release). Extended in M8.
 */
export async function scoreOrder(ctx: Ctx, db: DbOrTx, i: OrderRiskInput): Promise<{ score: number; manual: boolean; flags: RiskFlagSpec[] }> {
  const { scoreOrderFull } = await import('./fraud');
  return scoreOrderFull(ctx, db, i);
}
