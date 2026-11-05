# PROGRESS

Spec: `CLAUDE.md`. Milestones are executed in order (section 13). Each entry lists what was built, decisions and blockers.

## Status

| Milestone | Status |
|---|---|
| M1 Foundation | ✅ done |
| M2 Trading core | ⏳ next |
| M3 Web app & realtime | ☐ |
| M4 KYC & limits | ☐ |
| M5 Wallet & custody | ☐ |
| M6 Admin & compliance | ☐ |
| M7 Disputes & insurance | ☐ |
| M8 Anti-fraud | ☐ |
| M9 Global layer | ☐ |
| M10 Payment auto-confirm | ☐ |
| M11 Corridors | ☐ |
| M12 Telegram Mini App & mobile | ☐ |
| M13 Merchant program | ☐ |
| M14 Scale & observability | ☐ |
| M15 Security hardening & audit package | ☐ |
| M16 Launch readiness | ☐ |

## Running locally

```bash
pnpm install
cp .env.example .env               # placeholders only
docker compose up -d postgres redis # or local Postgres 16 + Redis
pnpm build && pnpm db:migrate
pnpm test                          # needs Postgres at TEST_DATABASE_URL (default postgres://postgres:postgres@localhost:5432/p2p_test)
```

## M1 — Foundation ✅

**Built**
- pnpm + Turborepo monorepo: `packages/{shared,db,providers,core}`, `apps/{api,worker}`.
- `packages/shared`: bigint money utils (parse/format, bps, rounding, crypto↔fiat with scaled prices, median), assets/networks, KYC tiers, error codes, zod schemas, the order state machine.
- `packages/db`: Drizzle schema for every table in spec §3 (plus sessions, tokens, passkeys, idempotency keys, risk flags, notifications, corridors, merchant keys…). Migrations; DB triggers make `audit_log`, `ledger_tx`, `ledger_entries` append-only, and a deferred constraint trigger rejects any ledger tx not summing to zero per asset.
- `packages/providers`: interfaces for Custody, KYC, ChainRisk, PaymentVerifier, Notifier, Rates, Storage, VirusScanner, AI triage. Deterministic mocks for all of them with signed-webhook simulators. Real adapters: Sumsub, TRM, Telegram Bot, Postmark, Twilio, Binance/Kraken/Coinbase/FX rate sources, Claude triage. Registry picks real only when keys exist.
- `packages/core`: double-entry ledger (`postTx`, FOR UPDATE locking in id order, idempotent replay, balances = SUM(entries), invariant check), idempotency keys, envelope encryption (AES-256-GCM DEK wrapped by KMS/KEK), PII redaction, audit log, runtime config, country rules, auth (argon2id, email verify, phone OTP, Telegram initData HMAC, TOTP, passkeys/WebAuthn, sessions, device tracking + multi-account flag), invariant job with auto-pause of withdrawals + on-call page.
- `apps/api` (NestJS): global auth guard (Bearer or httpOnly cookie + double-submit CSRF), Redis rate limiter (per IP + per user), global idempotency interceptor (all mutating routes; replays stored result), bigint-safe JSON, error mapping, OpenAPI generated from zod schemas at `/v1/openapi.json`, Socket.IO gateway with rooms `order:{id}`, `user:{id}`, `ads:{asset}:{fiat}` and Redis adapter.
- `apps/worker` (BullMQ): job registry + repeatable schedules (invariant check every minute).
- Dockerfile, docker-compose, GitHub Actions CI (build, typecheck, i18n check, tests with Postgres/Redis services, Playwright, pnpm audit, Semgrep incl. custom money rules, gitleaks).

**Acceptance**
- ✅ Ledger property tests (fast-check random deposit/withdraw/transfer/lock/release/refund sequences) keep sum = 0 and no negative balances; concurrency test proves no double spend; ETH wei > int64 works.
- ✅ A user can sign up, verify email and phone, enable TOTP, and log in with 2FA (core + API e2e tests).

**Decisions**
- Ledger amounts use `NUMERIC(78,0)` for every asset in `ledger_entries` (one column must hold ETH wei); mapped to JS `bigint`, never floats.
- Added `packages/core` for domain logic shared by api/worker/tests (NestJS controllers stay thin).
- Credits to system accounts (fee/insurance) are not row-locked: credits can't break non-negativity and SUM is commutative; this avoids a global hot lock on the fee account. Every debited account and every user account is locked `FOR UPDATE` in id order.
- `custody` is the contra account per asset: `-(custody ledger balance)` = total liabilities, compared against the custody provider's real balance.
- Domain errors under an idempotency key are stored and replayed; unexpected errors release the key so the client can retry.

**Blocked / TODO(provider)**
- Fireblocks/BitGo/Cobo custody, Sumsub, TRM, Postmark, Twilio, Telegram bot token, S3, KMS: mocks in use until keys exist.
