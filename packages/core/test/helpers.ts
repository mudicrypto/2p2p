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

import { users, eq } from '@p2p/db';
import { seed, devFaucet, addPaymentMethod, createAd, type User } from '../src';
import { toMinor } from '@p2p/shared';

let seeded = false;
export async function ensureSeed(ctx: Ctx) {
  if (seeded) return;
  await seed(ctx.db);
  seeded = true;
}
export async function mkUser(ctx: Ctx, opts: { tier?: number; country?: string; createdAt?: Date } = {}): Promise<User> {
  const [u] = await ctx.db.insert(users).values({
    email: `${uniq()}@t.io`, country: opts.country ?? 'DE', kycTier: opts.tier ?? 1,
    createdAt: opts.createdAt ?? new Date(Date.now() - 30 * 86400_000), totpEnabledAt: null,
  }).returning();
  return u;
}
export const refresh = async (ctx: Ctx, u: User) => (await ctx.db.select().from(users).where(eq(users.id, u.id)))[0];
export async function fund(ctx: Ctx, u: User, asset: 'USDT' | 'BTC' | 'ETH', amount: string) {
  await devFaucet(ctx, u.id, asset, toMinor(amount, asset === 'USDT' ? 6 : asset === 'BTC' ? 8 : 18));
}
export async function sepa(ctx: Ctx, u: User) {
  return addPaymentMethod(ctx, u, { type: 'SEPA', holderName: 'Test Holder', details: { iban: 'DE89370400440532013000' } });
}
/** A maker with funds and a SELL USDT/EUR ad at 0.92. */
export async function sellAd(ctx: Ctx, opts: { total?: string; price?: string; min?: string; max?: string; window?: number } = {}) {
  const maker = await mkUser(ctx, { tier: 2 });
  await fund(ctx, maker, 'USDT', '100000');
  const pm = await sepa(ctx, maker);
  const ad = await createAd(ctx, maker, {
    side: 'sell', asset: 'USDT', fiat: 'EUR', priceType: 'fixed', price: opts.price ?? '0.92', minAmount: opts.min ?? '10', maxAmount: opts.max ?? '5000',
    totalAmount: opts.total ?? '10000', paymentMethodIds: [pm.id], paymentWindowMin: opts.window ?? 15, terms: '', minCounterpartyTier: 0, acceptReversible: false,
  });
  return { maker, ad, pm };
}
