import { createDb } from '@p2p/db';
import { createProviders } from '@p2p/providers';
import { memoryEvents, type Ctx } from '../src';

export function makeCtx(): Ctx & { close(): Promise<void>; events: ReturnType<typeof memoryEvents> } {
  const h = createDb(process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/p2p_test', undefined, 30);
  const events = memoryEvents();
  return { db: h.db, read: h.db, providers: createProviders('mock'), events, now: () => new Date(), close: () => h.close() };
}
let n = 0;
export const uniq = (p = 'u') => `${p}${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
