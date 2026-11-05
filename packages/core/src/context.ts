import type { Db, Tx, DbOrTx } from '@p2p/db';
import type { Providers } from '@p2p/providers';

export interface DomainEvent { type: string; userIds?: string[]; orderId?: string; room?: string; payload: Record<string, unknown> }
export interface EventSink { publish(e: DomainEvent): void | Promise<void> }

export interface Ctx {
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
  const hooks: Array<() => void | Promise<void>> = [];
  const result = await ctx.db.transaction(async (tx) => {
    const t: TxCtx = {
      ...ctx, tx,
      afterCommit: (f) => hooks.push(f),
      emit: (e) => hooks.push(() => ctx.events.publish(e)),
    };
    return fn(t);
  }, opts.isolation ? { isolationLevel: opts.isolation } : undefined);
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
