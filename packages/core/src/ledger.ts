/**
 * Double-entry ledger (spec 0.2–0.5).
 * - Balances are never stored: balance = SUM(ledger_entries.amount) for an account.
 * - Every movement is one ledger_tx with >=2 entries that sum to zero per asset
 *   (validated here AND by a deferred DB constraint trigger).
 * - Must run inside a DB transaction. Debited accounts and all user accounts are locked
 *   with SELECT ... FOR UPDATE in ascending id order to avoid deadlocks.
 * - Idempotent: ledger_tx.idempotency_key is UNIQUE; a replay returns the original tx.
 */
import { accounts, ledgerEntries, ledgerTx, sql, and, eq, inArray, type Tx, type DbOrTx } from '@p2p/db';
import { DomainError, type Asset } from '@p2p/shared';

export type AccountKind =
  | 'available' | 'escrow' | 'hold' | 'withdraw_pending' | 'security_deposit' // user-owned
  | 'custody' | 'fee' | 'insurance' | 'deposit_suspense'; // system-owned
export interface AccountRef { ownerType: 'user' | 'system'; ownerId: string; asset: Asset | string; kind: AccountKind }

export const userAcct = (userId: string, asset: string, kind: AccountKind = 'available'): AccountRef => ({ ownerType: 'user', ownerId: userId, asset, kind });
export const systemAcct = (asset: string, kind: 'custody' | 'fee' | 'insurance' | 'deposit_suspense'): AccountRef => ({ ownerType: 'system', ownerId: kind, asset, kind });

/** System accounts allowed to go negative. Custody is the contra account: -(custody) == total liabilities. */
const NEGATIVE_ALLOWED = new Set<AccountKind>(['custody']);

export type LedgerTxType =
  | 'deposit' | 'withdraw' | 'withdraw_reverse' | 'withdraw_complete' | 'escrow_lock' | 'escrow_release' | 'escrow_refund' | 'escrow_split'
  | 'fee' | 'insurance_payout' | 'internal_transfer' | 'hold_release' | 'security_deposit' | 'security_deposit_return' | 'adjustment';

export interface Posting { account: AccountRef; amount: bigint }
export interface PostTxInput { type: LedgerTxType; refType?: string; refId?: string; idempotencyKey: string; postings: Posting[] }
export interface PostTxResult { txId: bigint; replayed: boolean }

const refKey = (r: AccountRef) => `${r.ownerType}|${r.ownerId}|${r.asset}|${r.kind}`;

export async function getOrCreateAccounts(tx: DbOrTx, refs: AccountRef[]): Promise<Map<string, bigint>> {
  const uniq = new Map(refs.map((r) => [refKey(r), r]));
  const rows = [...uniq.values()];
  if (!rows.length) return new Map();
  await tx.insert(accounts).values(rows.map((r) => ({ ownerType: r.ownerType, ownerId: r.ownerId, asset: r.asset, kind: r.kind }))).onConflictDoNothing();
  const found = await tx.select({ id: accounts.id, ownerType: accounts.ownerType, ownerId: accounts.ownerId, asset: accounts.asset, kind: accounts.kind })
    .from(accounts)
    .where(sql`(${accounts.ownerType}, ${accounts.ownerId}, ${accounts.asset}, ${accounts.kind}) in (${sql.join(rows.map((r) => sql`(${r.ownerType}, ${r.ownerId}, ${r.asset}, ${r.kind})`), sql`, `)})`);
  return new Map(found.map((f) => [refKey(f as AccountRef), f.id]));
}

export async function postTx(tx: Tx, input: PostTxInput): Promise<PostTxResult> {
  const { postings } = input;
  if (postings.length < 2) throw new Error('ledger tx needs at least 2 postings');
  const perAsset = new Map<string, bigint>();
  for (const p of postings) {
    if (p.amount === 0n) throw new Error('zero posting');
    perAsset.set(p.account.asset, (perAsset.get(p.account.asset) ?? 0n) + p.amount);
  }
  for (const [asset, s] of perAsset) if (s !== 0n) throw new Error(`ledger tx unbalanced for ${asset}: ${s}`);

  const ins = await tx.insert(ledgerTx).values({ type: input.type, refType: input.refType, refId: input.refId, idempotencyKey: input.idempotencyKey })
    .onConflictDoNothing({ target: ledgerTx.idempotencyKey }).returning({ id: ledgerTx.id });
  if (!ins.length) {
    const [existing] = await tx.select({ id: ledgerTx.id }).from(ledgerTx).where(eq(ledgerTx.idempotencyKey, input.idempotencyKey));
    return { txId: existing.id, replayed: true };
  }
  const txId = ins[0].id;

  const ids = await getOrCreateAccounts(tx, postings.map((p) => p.account));
  // Net delta per account.
  const delta = new Map<bigint, { ref: AccountRef; amount: bigint }>();
  for (const p of postings) {
    const id = ids.get(refKey(p.account))!;
    const d = delta.get(id) ?? { ref: p.account, amount: 0n };
    d.amount += p.amount;
    delta.set(id, d);
  }
  const mustLock = [...delta.entries()]
    .filter(([, d]) => d.ref.ownerType === 'user' || (d.amount < 0n && !NEGATIVE_ALLOWED.has(d.ref.kind)))
    .map(([id]) => id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (mustLock.length) {
    await tx.execute(sql`select id from accounts where id in (${sql.join(mustLock.map((i) => sql`${i}`), sql`, `)}) order by id for update`);
  }
  const debited = [...delta.entries()].filter(([, d]) => d.amount < 0n && !NEGATIVE_ALLOWED.has(d.ref.kind)).map(([id]) => id);
  if (debited.length) {
    const bals = await balancesById(tx, debited);
    for (const id of debited) {
      const d = delta.get(id)!;
      if ((bals.get(id) ?? 0n) + d.amount < 0n) {
        throw new DomainError('INSUFFICIENT_FUNDS', `insufficient ${d.ref.asset} in ${d.ref.kind}`);
      }
    }
  }
  await tx.insert(ledgerEntries).values(postings.map((p) => ({ txId, accountId: ids.get(refKey(p.account))!, asset: p.account.asset, amount: p.amount })));
  return { txId, replayed: false };
}

export async function balancesById(db: DbOrTx, ids: bigint[]): Promise<Map<bigint, bigint>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ id: ledgerEntries.accountId, s: sql<string>`coalesce(sum(${ledgerEntries.amount}),0)::text` })
    .from(ledgerEntries).where(inArray(ledgerEntries.accountId, ids)).groupBy(ledgerEntries.accountId);
  return new Map(rows.map((r) => [r.id, BigInt(r.s)]));
}

export async function balanceOf(db: DbOrTx, ref: AccountRef): Promise<bigint> {
  const [row] = await db.select({ s: sql<string>`coalesce(sum(${ledgerEntries.amount}),0)::text` })
    .from(ledgerEntries).innerJoin(accounts, eq(accounts.id, ledgerEntries.accountId))
    .where(and(eq(accounts.ownerType, ref.ownerType), eq(accounts.ownerId, ref.ownerId), eq(accounts.asset, ref.asset), eq(accounts.kind, ref.kind)));
  return BigInt(row?.s ?? '0');
}

export async function userBalances(db: DbOrTx, userId: string) {
  const rows = await db.select({ asset: accounts.asset, kind: accounts.kind, s: sql<string>`coalesce(sum(${ledgerEntries.amount}),0)::text` })
    .from(accounts).leftJoin(ledgerEntries, eq(accounts.id, ledgerEntries.accountId))
    .where(and(eq(accounts.ownerType, 'user'), eq(accounts.ownerId, userId)))
    .groupBy(accounts.asset, accounts.kind);
  const out: Record<string, Record<string, bigint>> = {};
  for (const r of rows) (out[r.asset] ??= {})[r.kind] = BigInt(r.s);
  return out;
}

export interface InvariantReport {
  ok: boolean;
  perAsset: Array<{ asset: string; ledgerSum: bigint; liabilities: bigint; custodyBalance: bigint | null; ok: boolean }>;
  negativeAccounts: Array<{ accountId: bigint; asset: string; kind: string; balance: bigint }>;
  unbalancedTx: bigint[];
}

/** Invariants (spec 0.5): per-asset entry sum == 0; no negative non-custody account; liabilities <= custody. */
export async function checkInvariants(db: DbOrTx, custodyBalance?: (asset: string) => Promise<bigint>): Promise<InvariantReport> {
  const sums = await db.execute<{ asset: string; total: string; liabilities: string }>(sql`
    select a.asset, coalesce(sum(e.amount),0)::text total,
      coalesce(sum(case when a.kind <> 'custody' then e.amount else 0 end),0)::text liabilities
    from accounts a left join ledger_entries e on e.account_id = a.id group by a.asset`);
  const neg = await db.execute<{ id: string; asset: string; kind: string; bal: string }>(sql`
    select a.id::text, a.asset, a.kind, sum(e.amount)::text bal from accounts a join ledger_entries e on e.account_id = a.id
    where a.kind <> 'custody' group by a.id having sum(e.amount) < 0 limit 100`);
  const unb = await db.execute<{ tx_id: string }>(sql`select tx_id::text from ledger_entries group by tx_id, asset having sum(amount) <> 0 limit 100`);
  const perAsset = [];
  for (const r of sums.rows) {
    const liabilities = BigInt(r.liabilities);
    const cb = custodyBalance ? await custodyBalance(r.asset) : null;
    const ok = BigInt(r.total) === 0n && (cb === null || liabilities <= cb);
    perAsset.push({ asset: r.asset, ledgerSum: BigInt(r.total), liabilities, custodyBalance: cb, ok });
  }
  const negativeAccounts = neg.rows.map((r) => ({ accountId: BigInt(r.id), asset: r.asset, kind: r.kind, balance: BigInt(r.bal) }));
  const unbalancedTx = unb.rows.map((r) => BigInt(r.tx_id));
  return { ok: perAsset.every((p) => p.ok) && !negativeAccounts.length && !unbalancedTx.length, perAsset, negativeAccounts, unbalancedTx };
}
