import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import { users } from '@p2p/db';
import { DomainError } from '@p2p/shared';
import { makeCtx, uniq } from './helpers';
import { postTx, userAcct, systemAcct, balanceOf, checkInvariants, runTx } from '../src';

const ctx = makeCtx();
afterAll(() => ctx.close());

async function mkUsers(n: number) {
  const rows = await ctx.db.insert(users).values(Array.from({ length: n }, () => ({ email: `${uniq()}@t.io`, country: 'DE' }))).returning({ id: users.id });
  return rows.map((r) => r.id);
}

type Op =
  | { k: 'deposit'; u: number; amt: bigint }
  | { k: 'withdraw'; u: number; amt: bigint }
  | { k: 'transfer'; from: number; to: number; amt: bigint }
  | { k: 'lock'; u: number; amt: bigint }
  | { k: 'release'; from: number; to: number; amt: bigint; fee: bigint }
  | { k: 'refund'; u: number; amt: bigint };

const amt = fc.bigInt({ min: 1n, max: 10n ** 12n });
const op = (n: number): fc.Arbitrary<Op> => fc.oneof(
  fc.record({ k: fc.constant('deposit' as const), u: fc.nat(n - 1), amt }),
  fc.record({ k: fc.constant('withdraw' as const), u: fc.nat(n - 1), amt }),
  fc.record({ k: fc.constant('transfer' as const), from: fc.nat(n - 1), to: fc.nat(n - 1), amt }),
  fc.record({ k: fc.constant('lock' as const), u: fc.nat(n - 1), amt }),
  fc.record({ k: fc.constant('release' as const), from: fc.nat(n - 1), to: fc.nat(n - 1), amt, fee: fc.bigInt({ min: 0n, max: 10n ** 6n }) }),
  fc.record({ k: fc.constant('refund' as const), u: fc.nat(n - 1), amt }),
);

describe('ledger property tests', () => {
  let ids: string[] = [];
  beforeAll(async () => { ids = await mkUsers(5); });

  it('random op sequences keep sum=0 and no negative balances', async () => {
    const asset = 'USDT';
    await fc.assert(fc.asyncProperty(fc.array(op(5), { minLength: 5, maxLength: 40 }), async (ops) => {
      const model = new Map<string, bigint>(); // expected balances
      const get = (k: string) => model.get(k) ?? 0n;
      // seed model with current DB balances
      for (const id of ids) for (const kind of ['available', 'escrow'] as const) model.set(`${id}:${kind}`, await balanceOf(ctx.db, userAcct(id, asset, kind)));
      for (const o of ops) {
        const key = uniq('k');
        const attempt = async (postings: Parameters<typeof postTx>[1]['postings'], apply: () => void, type: any) => {
          try {
            await runTx(ctx, (t) => postTx(t.tx, { type, idempotencyKey: key, postings }));
            apply();
          } catch (e) {
            if (!(e instanceof DomainError && e.code === 'INSUFFICIENT_FUNDS')) throw e;
          }
        };
        if (o.k === 'deposit') await attempt([{ account: systemAcct(asset, 'custody'), amount: -o.amt }, { account: userAcct(ids[o.u], asset), amount: o.amt }], () => model.set(`${ids[o.u]}:available`, get(`${ids[o.u]}:available`) + o.amt), 'deposit');
        if (o.k === 'withdraw') await attempt([{ account: userAcct(ids[o.u], asset), amount: -o.amt }, { account: systemAcct(asset, 'custody'), amount: o.amt }], () => model.set(`${ids[o.u]}:available`, get(`${ids[o.u]}:available`) - o.amt), 'withdraw');
        if (o.k === 'transfer' && o.from !== o.to) await attempt([{ account: userAcct(ids[o.from], asset), amount: -o.amt }, { account: userAcct(ids[o.to], asset), amount: o.amt }], () => { model.set(`${ids[o.from]}:available`, get(`${ids[o.from]}:available`) - o.amt); model.set(`${ids[o.to]}:available`, get(`${ids[o.to]}:available`) + o.amt); }, 'internal_transfer');
        if (o.k === 'lock') await attempt([{ account: userAcct(ids[o.u], asset), amount: -o.amt }, { account: userAcct(ids[o.u], asset, 'escrow'), amount: o.amt }], () => { model.set(`${ids[o.u]}:available`, get(`${ids[o.u]}:available`) - o.amt); model.set(`${ids[o.u]}:escrow`, get(`${ids[o.u]}:escrow`) + o.amt); }, 'escrow_lock');
        if (o.k === 'refund') await attempt([{ account: userAcct(ids[o.u], asset, 'escrow'), amount: -o.amt }, { account: userAcct(ids[o.u], asset), amount: o.amt }], () => { model.set(`${ids[o.u]}:available`, get(`${ids[o.u]}:available`) + o.amt); model.set(`${ids[o.u]}:escrow`, get(`${ids[o.u]}:escrow`) - o.amt); }, 'escrow_refund');
        if (o.k === 'release' && o.from !== o.to && o.fee < o.amt) await attempt([
          { account: userAcct(ids[o.from], asset, 'escrow'), amount: -o.amt },
          { account: userAcct(ids[o.to], asset), amount: o.amt - o.fee },
          ...(o.fee > 0n ? [{ account: systemAcct(asset, 'fee'), amount: o.fee }] : []),
        ], () => { model.set(`${ids[o.from]}:escrow`, get(`${ids[o.from]}:escrow`) - o.amt); model.set(`${ids[o.to]}:available`, get(`${ids[o.to]}:available`) + o.amt - o.fee); }, 'escrow_release');
      }
      for (const id of ids) for (const kind of ['available', 'escrow'] as const) {
        const b = await balanceOf(ctx.db, userAcct(id, asset, kind));
        expect(b).toBe(get(`${id}:${kind}`));
        expect(b >= 0n).toBe(true);
      }
      const inv = await checkInvariants(ctx.db);
      expect(inv.ok).toBe(true);
    }), { numRuns: 25 });
  });

  it('rejects unbalanced txs and is idempotent', async () => {
    const [u] = await mkUsers(1);
    await expect(runTx(ctx, (t) => postTx(t.tx, { type: 'deposit', idempotencyKey: uniq(), postings: [{ account: systemAcct('BTC', 'custody'), amount: -5n }, { account: userAcct(u, 'BTC'), amount: 4n }] }))).rejects.toThrow(/unbalanced/);
    const key = uniq();
    const p = [{ account: systemAcct('BTC', 'custody'), amount: -5n }, { account: userAcct(u, 'BTC'), amount: 5n }];
    const a = await runTx(ctx, (t) => postTx(t.tx, { type: 'deposit', idempotencyKey: key, postings: p }));
    const b = await runTx(ctx, (t) => postTx(t.tx, { type: 'deposit', idempotencyKey: key, postings: p }));
    expect(b.replayed).toBe(true);
    expect(b.txId).toBe(a.txId);
    expect(await balanceOf(ctx.db, userAcct(u, 'BTC'))).toBe(5n);
  });

  it('handles ETH wei amounts beyond int64', async () => {
    const [u] = await mkUsers(1);
    const big = 123_456_789n * 10n ** 18n; // > 2^63
    await runTx(ctx, (t) => postTx(t.tx, { type: 'deposit', idempotencyKey: uniq(), postings: [{ account: systemAcct('ETH', 'custody'), amount: -big }, { account: userAcct(u, 'ETH'), amount: big }] }));
    expect(await balanceOf(ctx.db, userAcct(u, 'ETH'))).toBe(big);
  });

  it('concurrent debits never overdraw (no double spend)', async () => {
    const [u, v] = await mkUsers(2);
    await runTx(ctx, (t) => postTx(t.tx, { type: 'deposit', idempotencyKey: uniq(), postings: [{ account: systemAcct('USDT', 'custody'), amount: -100n }, { account: userAcct(u, 'USDT'), amount: 100n }] }));
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => runTx(ctx, (t) => postTx(t.tx, { type: 'internal_transfer', idempotencyKey: uniq(), postings: [{ account: userAcct(u, 'USDT'), amount: -10n }, { account: userAcct(v, 'USDT'), amount: 10n }] }))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    expect(await balanceOf(ctx.db, userAcct(u, 'USDT'))).toBe(0n);
    expect(await balanceOf(ctx.db, userAcct(v, 'USDT'))).toBe(100n);
  });

  it('ledger rows are append-only at the DB level', async () => {
    const msg = async (q: string) => { try { await ctx.db.execute(q as any); return 'ok'; } catch (e: any) { return String(e.cause?.message ?? e.message); } };
    expect(await msg('update ledger_entries set amount = amount + 1')).toMatch(/append-only/);
    await ctx.db.execute("insert into audit_log(actor_type, action) values ('system','test')" as any);
    expect(await msg('delete from audit_log')).toMatch(/append-only/);
    expect(await msg('truncate audit_log')).toMatch(/append-only/);
  });

  it('invariant detects custody shortfall', async () => {
    const inv = await checkInvariants(ctx.db, async () => 0n);
    expect(inv.ok).toBe(false);
  });
});
