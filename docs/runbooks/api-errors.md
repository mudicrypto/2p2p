# API 5xx / latency

1. Grafana "P2P Overview": which routes/status codes; which region (`region` label); Sentry for the stack trace.
2. Recent deploy? → `kubectl rollout undo deploy/p2p-api -n p2p-production` (migrations are additive; rollback is safe unless the release notes say otherwise).
3. DB: Performance Insights for slow queries / lock waits; `idle_in_transaction_session_timeout` kills stuck sessions after 30 s. Pool exhaustion signature: many sessions `idle in transaction` waiting on `ClientRead` → look for code doing a second-connection write inside a transaction.
4. Redis down → rate limits/cache fail open, BullMQ timers pause (sweepers recover expiries when Redis returns); restore Redis first.
5. Scale: `kubectl scale deploy/p2p-api --replicas=N` (HPA max 30). Order-book load can be shed with `BOOK_CACHE_TTL_SEC=5`.
