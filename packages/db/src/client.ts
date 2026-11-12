import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, types } from 'pg';
import * as schema from './schema';

// int8 -> bigint (never JS number), numeric stays string and is converted by the `amount` custom type.
types.setTypeParser(20, (v) => BigInt(v));

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle or the db itself — services accept either. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export interface DbHandle {
  db: Db;
  /** Read replica (falls back to primary). Use only for non-critical reads (order book, profiles). */
  read: Db;
  pool: Pool;
  close(): Promise<void>;
}

export function createDb(url = process.env.DATABASE_URL, replicaUrl = process.env.DATABASE_REPLICA_URL, max = Number(process.env.DB_POOL_MAX ?? 20)): DbHandle {
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString: url, max });
  const db = drizzle(pool, { schema });
  let replicaPool: Pool | undefined;
  let read = db;
  if (replicaUrl) {
    replicaPool = new Pool({ connectionString: replicaUrl, max });
    read = drizzle(replicaPool, { schema });
  }
  return {
    db, read, pool,
    async close() {
      await pool.end();
      await replicaPool?.end();
    },
  };
}
