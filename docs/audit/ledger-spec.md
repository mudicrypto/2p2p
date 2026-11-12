# Ledger specification

## Units
All amounts are integers in minor units (`NUMERIC(78,0)` ↔ JS `bigint`): USDT 6, BTC 8, ETH 18 decimals; fiat per ISO 4217. Prices are fiat-minor per whole crypto unit × 10⁸. No floating point anywhere in money paths (enforced by Semgrep rule `no-float-money`).

## Accounts (`accounts`, unique on owner_type, owner_id, asset, kind)
| Kind | Owner | Meaning | May go negative |
|---|---|---|---|
| available | user | Spendable balance | no |
| escrow | user (seller) | Locked for open orders | no |
| hold | user (buyer) | Reversible-rail proceeds during chargeback window | no |
| withdraw_pending | user | Withdrawals submitted to custody, not yet settled | no |
| security_deposit | user (merchant) | Locked merchant deposit | no |
| custody | system | Contra account; `−balance` = total liabilities for the asset | **yes** |
| fee | system | Platform fee revenue | no |
| insurance | system | Insurance fund | no |

Balance = `SUM(ledger_entries.amount)` for the account. Balances are never stored or edited.

## Transactions
Each movement is one `ledger_tx` (unique `idempotency_key`) with ≥ 2 `ledger_entries`. Types and postings (A = amount, F = fee, I = insurance slice of F):
| Type | Postings |
|---|---|
| deposit | custody −A, user.available +A |
| escrow_lock | seller.available −(A + F·[maker=seller]), seller.escrow +same |
| escrow_release | seller.escrow −lock, buyer.available/hold +(A − F·[maker=buyer]), fee +(F − I), insurance +I |
| escrow_refund | seller.escrow −lock, seller.available +lock |
| escrow_split | seller.escrow −lock, buyer +⌊A·bps⌋, seller +rest (no fee) |
| hold_release | buyer.hold −X, buyer.available +X |
| withdraw | user.available −(A + fee), user.withdraw_pending +A, fee +fee |
| withdraw_complete | user.withdraw_pending −A, custody +A |
| withdraw_reverse | user.withdraw_pending −A, user.available +(A + fee), fee −fee |
| internal_transfer | from.available −A, to.available +A |
| insurance_payout | insurance −P, reporter.available +P |
| security_deposit / _return | user.available ↔ user.security_deposit |
| fee / adjustment | fee → insurance top-ups (admin, audited) |

## Invariants
1. **Per-tx balance**: every tx sums to 0 per asset — checked in `postTx` and by a **deferred constraint trigger** at commit.
2. **Global**: Σ entries per asset = 0.
3. **Non-negativity**: no non-custody account below 0 — checked under row locks in `postTx`.
4. **Solvency**: liabilities (Σ non-custody accounts) ≤ custody provider balance.
5. **Append-only**: UPDATE/DELETE/TRUNCATE on `ledger_tx`, `ledger_entries`, `audit_log` raise in triggers.
The invariant job runs every minute; on failure it pauses withdrawals, pages on-call and exports `ledger_invariant_ok=0`.

## Concurrency
`postTx` runs inside the caller's transaction. Every debited account and every user account is locked `SELECT … FOR UPDATE` in ascending id order. Global lock order across the system: **ad → limit_usage (by user id; day, month) → accounts (by id)**; order rows are locked before accounts. Credits to system fee/insurance accounts are not locked (they cannot violate non-negativity and SUM is commutative), avoiding a global hot row. `runTx` retries deadlock/serialization failures (backstop; the fuzz test passes with retries disabled). No code performs DB writes on another connection while holding a transaction (pool-deadlock rule; see findings F-6).

## Idempotency
Ledger: `ledger_tx.idempotency_key` (deterministic per business event, e.g. `order:{id}:release`) — replay returns the original tx. API: every mutating request needs `Idempotency-Key`; (scope, key) reserved with request hash; stored result replayed; mismatched payload rejected; orphaned reservations reclaimable after 120 s. Webhooks: provider event id / provider ref.
