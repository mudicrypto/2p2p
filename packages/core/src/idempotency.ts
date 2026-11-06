/**
 * Idempotency keys (spec 0.4). The first request with (scope,key) runs and stores its result;
 * retries with the same key replay the stored result. A different payload with the same key is rejected.
 * A concurrent duplicate blocks on the unique row until the first commits.
 */
import { idempotencyKeys, and, eq, lt, type Db } from '@p2p/db';

const STALE_MS = Number(process.env.IDEMPOTENCY_STALE_MS ?? 120_000);
import { DomainError, jsonBigint } from '@p2p/shared';
import { sha256 } from './crypto';

export interface IdemResult<T> { status: number; body: T; replayed: boolean }

export async function withIdempotency<T>(db: Db, scope: string, key: string, request: unknown, fn: () => Promise<{ status: number; body: T }>): Promise<IdemResult<T>> {
  if (!key || key.length > 200) throw new DomainError('VALIDATION', 'Idempotency-Key header required (max 200 chars)');
  const requestHash = sha256(JSON.stringify(request ?? null, jsonBigint));
  // Reserve the key in its own short transaction so the reservation is visible to retries.
  const reserved = await db.insert(idempotencyKeys).values({ scope, key, requestHash }).onConflictDoNothing().returning();
  if (!reserved.length) {
    const [row] = await db.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
    if (row.requestHash !== requestHash) throw new DomainError('IDEMPOTENCY_MISMATCH', 'Idempotency-Key reused with a different request');
    if (row.status === 'done') return { status: row.responseCode!, body: row.responseBody as T, replayed: true };
    // A reservation abandoned by a crashed process (no result after STALE_MS) can be taken over atomically.
    const takeover = await db.update(idempotencyKeys).set({ createdAt: new Date() })
      .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key), eq(idempotencyKeys.status, 'in_progress'), lt(idempotencyKeys.createdAt, new Date(Date.now() - STALE_MS)))).returning();
    if (!takeover.length) throw new DomainError('CONFLICT', 'request with this Idempotency-Key is still in progress');
  }
  try {
    const res = await fn();
    const body = JSON.parse(JSON.stringify(res.body ?? null, jsonBigint));
    await db.update(idempotencyKeys).set({ status: 'done', responseCode: res.status, responseBody: body }).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
    return { status: res.status, body, replayed: false };
  } catch (e) {
    // Domain rejections are deterministic: store them so retries get the same answer.
    if (e instanceof DomainError) {
      await db.update(idempotencyKeys).set({ status: 'done', responseCode: 0, responseBody: { error: e.code, message: e.message } })
        .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
    } else {
      await db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
    }
    throw e;
  }
}

/** Replay helper: stored domain errors are rethrown on replay. */
export function unwrapReplay<T>(r: IdemResult<T>): IdemResult<T> {
  const b = r.body as unknown as { error?: string; message?: string };
  if (r.replayed && r.status === 0 && b?.error) throw new DomainError(b.error as never, b.message);
  return r;
}
