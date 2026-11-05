import type { Db, Tx, DbOrTx } from '@p2p/db';
import type { Providers } from '@p2p/providers';

export interface DomainEvent { type: string; userIds?: string[]; orderId?: string; room?: string; payload: Record<string, unknown> }
export interface EventSink { publish(e: DomainEvent): void | Promise<void> }

export interface JobQueue { enqueue(name: string, data: Record<string, unknown>, opts?: { delayMs?: number; jobId?: string }): Promise<void> }

export interface Ctx {
  jobs?: JobQueue;
  db: Db;
  read: Db;
  providers: Providers;
  events: EventSink;
  now: () => Date;
}

/** Transaction context: queue side effects that must only happen after commit. */
export interface TxCtx extends Ctx {
  tx: Tx;
  afterCommit(fn: () => void | Promise<void>): void;
  emit(e: DomainEvent): void;
}

export async function runTx<T>(ctx: Ctx, fn: (t: TxCtx) => Promise<T>, opts: { isolation?: 'read committed' | 'repeatable read' | 'serializable' } = {}): Promise<T> {
  let hooks: Array<() => void | Promise<void>> = [];
  const attempt = () => ctx.db.transaction(async (tx) => {
    hooks = [];
    const t: TxCtx = {
      ...ctx, tx,
      afterCommit: (f) => hooks.push(f),
      emit: (e) => hooks.push(() => ctx.events.publish(e)),
    };
    return fn(t);
  }, opts.isolation ? { isolationLevel: opts.isolation } : undefined);
  let result!: T;
  // Retry on deadlock / serialization failure: the whole tx rolled back, so a retry is safe.
  for (let i = 0; ; i++) {
    try { result = await attempt(); break; }
    catch (e) {
      const code = (e as { cause?: { code?: string }; code?: string }).cause?.code ?? (e as { code?: string }).code;
      if ((code === '40P01' || code === '40001') && i < Number(process.env.TX_RETRIES ?? 4)) { await new Promise((r) => setTimeout(r, 5 + Math.random() * 20 * (i + 1))); continue; }
      throw e;
    }
  }
  for (const h of hooks) {
    try { await h(); } catch (e) { console.error('afterCommit hook failed', (e as Error).message); }
  }
  return result;
}

export const memoryEvents = (): EventSink & { events: DomainEvent[] } => {
  const events: DomainEvent[] = [];
  return { events, publish: (e) => void events.push(e) };
};
export type { Db, Tx, DbOrTx };
