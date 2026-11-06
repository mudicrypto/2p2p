# Incident & on-call runbooks

**Severity**: SEV1 = funds at risk or ledger invariant failed / platform down; SEV2 = a core flow degraded (orders, withdrawals, deposits) for many users; SEV3 = partial/one-region/one-rail degradation.
**On-call**: primary + secondary rotation (weekly), paged by Alertmanager → pager (Telegram/SMS via `ONCALL_*`). Ack within 5 min (SEV1) / 15 min (SEV2).
**Incident roles**: Incident Commander (on-call primary), Comms (status page + support macros), Scribe (timeline in the incident doc). Finance and Compliance leads join every SEV1.
**Golden rules**: never edit ledger rows (they are append-only by design — corrections are new, audited `adjustment` txs approved by two finance admins); when in doubt, **pause withdrawals** (`PUT /v1/admin/config/withdrawals {"paused": true}`) — trading can continue safely because escrow is internal.

| Runbook | Trigger |
|---|---|
| [invariant-failure.md](invariant-failure.md) | `LedgerInvariantFailed`, `WithdrawalsPaused` |
| [api-errors.md](api-errors.md) | `Api5xxRate`, `OrderLatencyP95High` |
| [database.md](database.md) | primary failover, replica lag, restore from backup |
| [custody-outage.md](custody-outage.md) | custody API/webhook failures, stuck withdrawals/deposits |
| [payment-rail-outage.md](payment-rail-outage.md) | a PaymentVerifier rail stops confirming |
| [security-incident.md](security-incident.md) | suspected compromise, key leak, account takeover wave |
| [country-shutdown.md](country-shutdown.md) | legal/regulatory order to stop service in a country |
| [dispute-backlog.md](dispute-backlog.md) | disputes escalating past SLA |
| [postmortem-template.md](postmortem-template.md) | after every SEV1/SEV2 |
