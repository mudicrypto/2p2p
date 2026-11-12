# Scaling and observability (M14)

## Topology
- **Stateless API pods** (NestJS) in every region behind a regional load balancer; `API_WORKERS` adds processes per host, Kubernetes HPA adds pods. All state lives in Postgres/Redis.
- **WebSockets** scale horizontally through the Socket.IO **Redis adapter**; clients use the websocket transport only, so no sticky sessions are needed. Worker-originated events reach sockets via the `p2p:events` Redis channel.
- **Postgres 16**: one primary (money writes, ledger, orders) in the home region; **read replicas** per region serve the order book, profiles and other non-critical reads (`DATABASE_REPLICA_URL` → `ctx.read`). Ledger reads that gate money movement always use the primary inside the transaction.
- **Order-book cache**: Redis, 2 s TTL, invalidated on every `book.updated` event for that asset/fiat (cross-instance through `p2p:events`).
- **Workers** (BullMQ) run anywhere with Redis + primary access; repeatable jobs are de-duplicated by BullMQ job schedulers.
- **Multi-region**: active/active stateless tier, single-writer database (cross-region writes go to the primary; replica lag alert at 30 s). Regional Redis per region for cache/rate limits; the event channel is per region with the primary-region worker publishing to all regions. IaC lives in `infra/terraform` (M16).

## Observability
- `/metrics` (Prometheus; `METRICS_TOKEN` bearer or `METRICS_IP_ALLOWLIST`): HTTP latency histogram by route/status, domain events by type, order-book cache hits, `ledger_invariant_ok`, `withdrawals_paused`, Node runtime metrics.
- Alert rules: `infra/observability/alerts.yml` (invariant failure → page, withdrawals paused, order p95 > 300 ms, 5xx > 1 %, replica lag, Redis down). Dashboard: `infra/observability/grafana/p2p-overview.json`.
- Sentry (`SENTRY_DSN`, TODO(provider)): unhandled API errors, with cookies/auth headers/bodies stripped and PII redacted.
- The invariant job (every minute) auto-pauses withdrawals and pages on-call on failure (M1); its last result is exported as `ledger_invariant_ok`.

## Load test (k6)
`loadtest/setup.mjs` seeds 5,000 buyers + 200 funded sell ads; `loadtest/orders.k6.js` (CI) and `loadtest/run.mjs` (same scenario in Node) create one order per buyer; `loadtest/verify.mjs` checks for double spend afterwards. See `docs/audit/test-report.md` for results.
