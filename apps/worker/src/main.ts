import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { createDb } from '@p2p/db';
import { createProviders } from '@p2p/providers';
import { redactPii, type Ctx, type DomainEvent } from '@p2p/core';
import { JOBS, SCHEDULES } from './jobs';

export const QUEUE = 'p2p';

async function main() {
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
  const dbh = createDb();
  const pub = connection.duplicate();
  const ctx: Ctx = {
    db: dbh.db, read: dbh.read, providers: createProviders(), now: () => new Date(),
    // Worker-originated events are relayed to API instances (which own the sockets) via Redis pub/sub.
    events: { publish: (e: DomainEvent) => void pub.publish('p2p:events', JSON.stringify(e, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) },
  };
  const queue = new Queue(QUEUE, { connection });
  for (const s of SCHEDULES) await queue.upsertJobScheduler(s.name, { every: s.everyMs }, { name: s.name });
  const worker = new Worker(QUEUE, async (job) => {
    const h = JOBS[job.name];
    if (!h) throw new Error(`unknown job ${job.name}`);
    return h(ctx, job.data);
  }, { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 8) });
  worker.on('failed', (job, err) => console.error(`[job ${job?.name}] failed: ${redactPii(err.message)}`));
  console.log('worker started');
  const stop = async () => { await worker.close(); await queue.close(); await dbh.close(); connection.disconnect(); pub.disconnect(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
