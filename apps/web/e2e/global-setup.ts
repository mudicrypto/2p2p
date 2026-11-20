import { Client } from 'pg';
import { runMigrations, createDb } from '@p2p/db';
import { seed } from '@p2p/core';

export default async function setup() {
  const url = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/p2p_e2e';
  if (process.env.E2E_SKIP_RESET !== '1') {
    const c = new Client({ connectionString: url });
    await c.connect();
    await c.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
    await c.end();
    await runMigrations(url);
  }
  const h = createDb(url);
  await seed(h.db);
  await h.close();
}
