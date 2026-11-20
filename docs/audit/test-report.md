# Test report (2026-11-06)

Environment: Postgres 16, Redis 7, Node 22, Chromium (Playwright 1.63); single 4-vCPU sandbox.

| Suite | Location | Tests | Result |
|---|---|---|---|
| Money utils + exhaustive state machine (every status × event × actor) | `packages/shared/test` | 367 | ✅ |
| Provider mocks | `packages/providers/test` | 5 | ✅ |
| Domain (ledger property tests, 10k-op fuzz, races, trading, KYC, wallet ×7 networks, admin/WebAuthn, disputes, insurance, fraud suite, global catalog, verifiers ×8 rails, corridors, merchants, security) | `packages/core/test` | 92 | ✅ |
| API E2E (auth/CSRF/idempotency, trading, KYC, wallet webhooks, admin RBAC matrix, disputes, payment webhooks, corridors, merchant bot over HTTP, mobile client) | `apps/api/test` | 25 | ✅ |
| i18n completeness/formatting | `packages/i18n/test` | 3 | ✅ |
| Mobile logic (deep links, biometric lock) | `apps/mobile/test` | 2 | ✅ |
| Browser E2E: full trade flow + 26 locales × (desktop, Pixel 7) | `apps/web/e2e` | 55 | ✅ |
| Telegram Mini App full trade flow | `apps/tg/e2e` | 1 | ✅ |
| Load: 5,000 orders / 5,000 buyers, open model 60/s | `loadtest/` | — | ✅ 0 failures, p50 35 ms, **p95 73 ms**, p99 586 ms; no double spend |

## Highlights
- **Ledger property tests** (fast-check): random deposit/withdraw/transfer/lock/release/refund sequences keep Σ = 0 and no negative balance; model balances match DB exactly.
- **10,000 random concurrent trading operations** (16-way concurrency): invariants hold, escrow per seller = open orders. This test found a real deadlock (fixed; passes with retries disabled).
- **Races**: concurrent release + cancel + timeout + mark-paid → exactly one outcome; 12 concurrent orders on capacity for 5 → exactly 5; duplicate idempotent requests lock escrow once; concurrent limit consumption cannot exceed a limit.
- **Fraud suite**: third-party payment → flags + auto-dispute + no release; multi-account device; shared-device counterparties → manual path; order/signup/login velocity; off-platform chat.
- **Load**: post-run verification found 0 unbalanced txs, 0 negative accounts, 0 ad-capacity mismatches, 0 escrow mismatches. At 90/s the sandbox saturates (p95 543 ms) with correctness intact; production capacity scales with API pods. The k6 job runs in CI (binary unavailable in this sandbox; Node runner executes the identical scenario).

## Not covered here (credentials/devices required)
Real custody testnet run (Fireblocks/BitGo/Cobo), live payment-rail sandboxes, Sumsub sandbox, native app runs on devices/simulators and store builds.
