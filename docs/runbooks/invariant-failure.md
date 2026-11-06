# Ledger invariant failure (SEV1)

The minute job found Σ entries ≠ 0, a negative non-custody account, an unbalanced tx, or liabilities > custody balance. Withdrawals were **auto-paused**.

1. **Do not unpause.** Declare SEV1, page Finance lead.
2. Get the report: `audit_log` action `withdrawals.auto_paused` (contains the full report) or run `node -e "require('@p2p/core').checkInvariants(...)"` from an ops pod.
3. Classify:
   - **liabilities > custody**: compare `-(custody ledger balance)` with the custody provider console per asset. Look for deposits credited without on-chain funds (`deposits` with `status=credited` but unknown to custody), withdrawals completed on-chain but not settled (`withdrawals.status=submitted` long), or custody-side movements outside the platform. Freeze affected users (admin → users → freeze).
   - **negative account / unbalanced tx**: should be impossible (DB triggers + locks). Treat as a potential DB compromise → also follow [security-incident.md](security-incident.md). Identify the tx ids from the report; preserve DB snapshot (do not vacuum/rewrite).
4. Correct with **new** `adjustment` ledger txs (two finance admins, audited), never by editing rows.
5. Re-run the check; when OK for 3 consecutive runs, unpause withdrawals (finance), keep large-withdrawal manual approval for 24 h.
6. Postmortem within 48 h.
