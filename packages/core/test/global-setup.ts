import { Client } from 'pg';
import { runMigrations } from '@p2p/db';

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/p2p_test';
  process.env.DATABASE_URL = url;
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await c.end();
  await runMigrations(url);
}
