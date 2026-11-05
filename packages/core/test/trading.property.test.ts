import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import { orders, eq, inArray, sql } from '@p2p/db';
import { DomainError } from '@p2p/shared';
import { makeCtx, mkUser, fund, sepa, ensureSeed } from './helpers';
import { createAd, createOrder, markPaid, cancelOrder, releaseOrder, expireOrder, checkInvariants, devFaucet, escrowAmount, balanceOf, userAcct, type User } from '../src';

const ctx = makeCtx();
beforeAll(() => ensureSeed(ctx));
afterAll(() => ctx.close());

const OPS = Number(process.env.LEDGER_FUZZ_OPS ?? 10_000);

describe('M2 ledger fuzz', () => {
  it(`ledger stays balanced after ${OPS} random trading operations`, async () => {
    const us: User[] = [];
    for (let i = 0; i < 24; i++) { const u = await mkUser(ctx, { tier: 3 }); await fund(ctx, u, 'USDT', '1000000'); us.push(u); }
    const adsList: string[] = [];
    const pms = new Map<string, string>();
    for (const u of us) pms.set(u.id, (await sepa(ctx, u)).id);
    for (let i = 0; i < 8; i++) {
      const u = us[i];
      const ad = await createAd(ctx, u, { side: i % 2 ? 'buy' : 'sell', asset: 'USDT', fiat: 'EUR', priceType: i % 4 < 2 ? 'fixed' : 'floating', price: '0.93', marginBps: 25, minAmount: '1', maxAmount: '20000', totalAmount: '500000', paymentMethodIds: [pms.get(u.id)!], paymentWindowMin: 15, terms: '', minCounterpartyTier: 0, acceptReversible: false });
      adsList.push(ad.id);
    }
    const opArb = fc.record({ k: fc.integer({ min: 0, max: 99 }), u: fc.nat(us.length - 1), a: fc.nat(adsList.length - 1), amt: fc.integer({ min: 1, max: 15000 }), pick: fc.nat(1_000_000) });
    const ops = fc.sample(opArb, { numRuns: OPS, seed: 42 });
    const open: string[] = [];
    let ok = 0, rejected = 0;
    const run = async (op: (typeof ops)[number]) => {
      const u = us[op.u];
      try {
        if (op.k < 35) {
          const o = await createOrder(ctx, u, { adId: adsList[op.a], fiatAmount: String(op.amt), paymentMethodId: pms.get(u.id) });
          open.push(o.id);
        } else if (op.k < 62 && open.length) {
          const id = open[op.pick % open.length];
          const [o] = await ctx.db.select().from(orders).where(eq(orders.id, id));
          await markPaid(ctx, { ...u, id: o.buyerId }, id);
        } else if (op.k < 85 && open.length) {
          const id = open[op.pick % open.length];
          const [o] = await ctx.db.select().from(orders).where(eq(orders.id, id));
          await releaseOrder(ctx, { ...u, id: o.sellerId }, id, undefined, { skip2fa: true });
          open.splice(open.indexOf(id), 1);
        } else if (op.k < 93 && open.length) {
          const id = open[op.pick % open.length];
          const [o] = await ctx.db.select().from(orders).where(eq(orders.id, id));
          await cancelOrder(ctx, { ...u, id: o.buyerId }, id);
          open.splice(open.indexOf(id), 1);
        } else if (op.k < 97 && open.length) {
          const id = open[op.pick % open.length];
          await ctx.db.update(orders).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(orders.id, id));
          if (await expireOrder(ctx, id)) open.splice(open.indexOf(id), 1);
        } else {
          await devFaucet(ctx, u.id, 'USDT', BigInt(op.amt) * 1_000_000n);
        }
        ok++;
      } catch (e) {
        if (!(e instanceof DomainError)) throw e;
        rejected++;
      }
    };
    const CONC = 16;
    for (let i = 0; i < ops.length; i += CONC) {
      await Promise.all(ops.slice(i, i + CONC).map(run));
      if (open.length > 400) open.splice(0, 200);
    }
    const inv = await checkInvariants(ctx.db);
    expect(inv.unbalancedTx).toEqual([]);
    expect(inv.negativeAccounts).toEqual([]);
    expect(inv.perAsset.every((p) => p.ledgerSum === 0n)).toBe(true);
    // Escrow balances equal the escrow of each seller's open orders.
    const active = await ctx.db.select().from(orders).where(inArray(orders.status, ['AWAITING_PAYMENT', 'PAID', 'DISPUTED']));
    for (const u of us) {
      const expected = active.filter((o) => o.sellerId === u.id).reduce((s, o) => s + escrowAmount(o), 0n);
      expect(await balanceOf(ctx.db, userAcct(u.id, 'USDT', 'escrow'))).toBe(expected);
    }
    const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.status, 'COMPLETED'));
    console.log(`fuzz: ${ok} ok, ${rejected} rejected, completed orders total ${n}`);
    expect(ok).toBeGreaterThan(OPS / 4);
  }, 900_000);
});
