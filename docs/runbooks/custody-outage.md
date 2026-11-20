# Custody outage

- **Deposits not arriving**: check provider status; webhooks are retried by the provider and deduped by event id — no action needed except comms. If webhooks were lost, request a webhook replay from the provider (safe: idempotent).
- **Withdrawals failing**: `withdrawal.submit` keeps them `approved` (retryable, idempotent on withdrawal id); failures reported by custody are reversed automatically (funds + fee back to the user). If the provider is degraded, pause withdrawals to stop new requests and post a status update.
- **Custody balance mismatch** → [invariant-failure.md](invariant-failure.md).
- Never move funds manually in the custody console without a matching, two-admin-approved ledger adjustment.
