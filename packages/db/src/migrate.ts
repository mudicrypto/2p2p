import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

export async function runMigrations(url = process.env.DATABASE_URL) {
  const h = createDb(url, undefined, 2);
  try {
    await migrate(h.db, { migrationsFolder: path.join(__dirname, '..', 'migrations') });
  } finally {
    await h.close();
  }
}

if (require.main === module) {
  runMigrations().then(() => console.log('migrations applied'), (e) => { console.error(e); process.exit(1); });
}
