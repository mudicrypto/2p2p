// Seeds N buyers (with session tokens) and S funded sellers each with one SELL ad. Writes fixtures.json.
import { writeFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { createDb, users, sessions, ads } from '@p2p/db';
import { createProviders } from '@p2p/providers';
import { seed, devFaucet, addPaymentMethod, createAd, memoryEvents } from '@p2p/core';

const N = Number(process.env.BUYERS ?? 5000), S = Number(process.env.SELLERS ?? 200);
const h = createDb(process.env.DATABASE_URL);
const ctx = { db: h.db, read: h.db, providers: createProviders('mock'), events: memoryEvents(), now: () => new Date() };
await seed(h.db);
const old = new Date(Date.now() - 90 * 86400_000);
const tokens = [];
for (let i = 0; i < N; i += 500) {
  const rows = await h.db.insert(users).values(Array.from({ length: Math.min(500, N - i) }, (_, j) => ({ email: `lt-b${Date.now()}-${i + j}@load.test`, country: 'DE', kycTier: 2, createdAt: old }))).returning({ id: users.id });
  const toks = rows.map(() => randomBytes(24).toString('base64url'));
  await h.db.insert(sessions).values(rows.map((r, k) => ({ userId: r.id, tokenHash: createHash('sha256').update(toks[k]).digest('hex'), expiresAt: new Date(Date.now() + 86400_000) })));
  tokens.push(...toks);
}
const adIds = [];
for (let i = 0; i < S; i++) {
  const [u] = await h.db.insert(users).values({ email: `lt-s${Date.now()}-${i}@load.test`, country: 'DE', kycTier: 3, createdAt: old }).returning();
  await devFaucet(ctx, u.id, 'USDT', 1_000_000_000n); // 1000 USDT
  const pm = await addPaymentMethod(ctx, u, { type: 'SEPA', holderName: 'Load Seller', details: { iban: 'DE89370400440532013000' } });
  const ad = await createAd(ctx, u, { side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: '0.95', minAmount: '1', maxAmount: '10000', totalAmount: '1000', paymentMethodIds: [pm.id], paymentWindowMin: 60, terms: '', minCounterpartyTier: 0, acceptReversible: false });
  adIds.push(ad.id);
}
writeFileSync(new URL('./fixtures.json', import.meta.url), JSON.stringify({ tokens, adIds }));
console.log(`seeded ${tokens.length} buyers, ${adIds.length} ads`);
await h.close();
void ads;
