// Single-connection latency profile of one order creation, split by phase (dev tool).
import { createDb } from '@p2p/db';
import { createProviders } from '@p2p/providers';
import { createOrder, memoryEvents, reloadUser } from '@p2p/core';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sessions, eq } from '@p2p/db';
const fx = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));
const h = createDb(process.env.DATABASE_URL);
const ctx = { db: h.db, read: h.db, providers: createProviders('mock'), events: memoryEvents(), now: () => new Date() };
let total = 0; const N = Number(process.env.N ?? 50);
for (let i = 0; i < N; i++) {
  const [s] = await h.db.select().from(sessions).where(eq(sessions.tokenHash, createHash('sha256').update(fx.tokens[fx.tokens.length - 1 - i]).digest('hex')));
  const u = await reloadUser(h.db, s.userId);
  const t0 = performance.now();
  await createOrder(ctx, u, { adId: fx.adIds[(i * 7) % fx.adIds.length], cryptoAmount: '10' }).catch((e) => console.log(e.message));
  total += performance.now() - t0;
}
console.log('avg createOrder ms', (total / N).toFixed(1));
await h.close();
