/**
 * HMAC merchant API keys (spec 10).
 * signature = hex(HMAC-SHA256(secret, `${timestamp}\n${METHOD}\n${path}\n${body}`)), timestamp in unix ms.
 * Timestamp must be within ±30s; each signature is accepted once (replay protection via a unique DB row);
 * secrets are envelope-encrypted at rest and returned only once at creation.
 */
import { merchantApiKeys, merchantProfiles, idempotencyKeys, users, and, eq, isNull, lt } from '@p2p/db';
import { DomainError } from '@p2p/shared';
import type { Ctx } from './context';
import { runTx } from './context';
import { audit } from './audit';
import { encrypt, decrypt, hmacHex, randomToken, safeEqual, sha256 } from './crypto';
import { require2fa, type User } from './auth';
import { reloadUser } from './limits';

export const MERCHANT_SCOPES = ['ads:read', 'ads:write', 'orders:read', 'orders:write', 'orders:release'] as const;
export type MerchantScope = (typeof MERCHANT_SCOPES)[number];
export const SIGNATURE_WINDOW_MS = 30_000;

export const signMerchantRequest = (secret: string, timestamp: string, method: string, path: string, body: string) =>
  hmacHex(secret, `${timestamp}\n${method.toUpperCase()}\n${path}\n${body}`);

async function assertApprovedMerchant(ctx: Ctx, userId: string) {
  const [p] = await ctx.db.select().from(merchantProfiles).where(eq(merchantProfiles.userId, userId));
  if (!p || p.status !== 'approved') throw new DomainError('FORBIDDEN', 'approved merchants only');
}

export async function createApiKey(ctx: Ctx, userIn: User, scopes: string[], totp?: string, opts: { skip2fa?: boolean } = {}) {
  const user = await reloadUser(ctx.db, userIn.id);
  if (!opts.skip2fa) await require2fa(ctx, user, totp);
  if (user.status !== 'active' || user.kycTier < 1) throw new DomainError('FORBIDDEN', 'account not eligible');
  await assertApprovedMerchant(ctx, user.id);
  const bad = scopes.filter((s) => !(MERCHANT_SCOPES as readonly string[]).includes(s));
  if (!scopes.length || bad.length) throw new DomainError('VALIDATION', `invalid scopes ${bad.join(',')}`);
  const keyId = `mk_${randomToken(12)}`;
  const secret = randomToken(32);
  return runTx(ctx, async (t) => {
    await t.tx.insert(merchantApiKeys).values({ id: keyId, userId: user.id, secretEnc: encrypt(secret), scopes });
    await audit(t.tx, { actorType: 'user', actorId: user.id, action: 'merchant.api_key_created', subjectType: 'api_key', subjectId: keyId, after: { scopes } });
    return { keyId, secret, scopes };
  });
}

export async function revokeApiKey(ctx: Ctx, user: User, keyId: string) {
  const [k] = await ctx.db.update(merchantApiKeys).set({ revokedAt: ctx.now() })
    .where(and(eq(merchantApiKeys.id, keyId), eq(merchantApiKeys.userId, user.id), isNull(merchantApiKeys.revokedAt))).returning();
  if (!k) throw new DomainError('NOT_FOUND', 'key not found');
  await audit(ctx.db, { actorType: 'user', actorId: user.id, action: 'merchant.api_key_revoked', subjectType: 'api_key', subjectId: keyId });
  return { revoked: true };
}

export async function listApiKeys(ctx: Ctx, userId: string) {
  const rows = await ctx.db.select().from(merchantApiKeys).where(eq(merchantApiKeys.userId, userId));
  return rows.map((r) => ({ keyId: r.id, scopes: r.scopes, revoked: !!r.revokedAt, lastUsedAt: r.lastUsedAt, createdAt: r.createdAt }));
}

export interface SignedRequest { keyId?: string; timestamp?: string; signature?: string; method: string; path: string; body: string }

/** Verifies a signed merchant request; returns the merchant user. Throws UNAUTHORIZED / FORBIDDEN. */
export async function verifyMerchantRequest(ctx: Ctx, r: SignedRequest, requiredScope: string) {
  if (!r.keyId || !r.timestamp || !r.signature) throw new DomainError('UNAUTHORIZED', 'missing merchant signature headers');
  const ts = Number(r.timestamp);
  if (!Number.isFinite(ts) || Math.abs(ctx.now().getTime() - ts) > SIGNATURE_WINDOW_MS) throw new DomainError('UNAUTHORIZED', 'stale or invalid timestamp');
  const [k] = await ctx.db.select().from(merchantApiKeys).where(eq(merchantApiKeys.id, r.keyId));
  if (!k || k.revokedAt) throw new DomainError('UNAUTHORIZED', 'invalid API key');
  const expected = signMerchantRequest(decrypt(k.secretEnc), r.timestamp, r.method, r.path, r.body);
  if (!safeEqual(expected, r.signature.toLowerCase())) throw new DomainError('UNAUTHORIZED', 'bad signature');
  if (!k.scopes.includes(requiredScope)) throw new DomainError('FORBIDDEN', `API key lacks scope ${requiredScope}`);
  const [u] = await ctx.db.select().from(users).where(eq(users.id, k.userId));
  if (!u || u.status !== 'active') throw new DomainError('ACCOUNT_FROZEN', 'merchant account not active');
  await assertApprovedMerchant(ctx, u.id);
  // Replay protection: a signature is single-use.
  const ins = await ctx.db.insert(idempotencyKeys).values({ scope: 'merchant-sig', key: sha256(r.signature), requestHash: k.id, status: 'done' }).onConflictDoNothing().returning();
  if (!ins.length) throw new DomainError('UNAUTHORIZED', 'replayed signature');
  await ctx.db.update(merchantApiKeys).set({ lastUsedAt: ctx.now() }).where(eq(merchantApiKeys.id, k.id));
  return { user: u, keyId: k.id, scopes: k.scopes };
}

/** Housekeeping: drop used-signature rows well outside the timestamp window. */
export async function pruneMerchantSignatures(ctx: Ctx) {
  await ctx.db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.scope, 'merchant-sig'), lt(idempotencyKeys.createdAt, new Date(ctx.now().getTime() - 10 * 60_000))));
}
