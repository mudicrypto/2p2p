# PROGRESS

Spec: `CLAUDE.md`. Milestones are executed in order (section 13). Each entry lists what was built, decisions and blockers.

## Status

| Milestone | Status |
|---|---|
| M1 Foundation | ✅ done |
| M2 Trading core | ✅ done |
| M3 Web app & realtime | ✅ done |
| M4 KYC & limits | ✅ done (parallel stream) |
| M5 Wallet & custody | ⏳ next |
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

## M2 — Trading core ✅

**Built**
- Payment methods (catalog-driven zod field validation, details envelope-encrypted, country allow-lists, reversible-rail rules).
- Reference rates: ≥3 sources, median, reject outliers >2%, stored in `rates`; floating ads re-priced on every refresh (worker every 60s).
- Ads: fixed + floating (margin bps), min/max fiat, total/remaining crypto, payment methods, window, terms, min counterparty tier, pause/close/reprice.
- Order book (read replica): filters asset, fiat, side, payment type, amount (incl. remaining capacity), advertiser tier, merchant-only; price-sorted with reputation tiebreak; cursor pagination.
- Orders: creation in one transaction (ad `FOR UPDATE` → limits → ad remaining → order row → escrow lock ledger tx → CREATED→AWAITING_PAYMENT), mark paid, buyer cancel, seller release (2FA re-prompt), auto-release hook, timeout. Every transition uses `WHERE status = :expected` plus `order_events` + `audit_log`.
- Escrow: lock / release (fee → fee account with insurance slice) / refund (restores ad remaining and limit usage) / split (for M7). Reversible rails release into a `hold` account until the hold window passes (`holds.release` job).
- Fee engine: maker 0.1% default, taker 0%, merchant-level discounts; fee charged in crypto at completion. Seller-maker escrows amount+fee; buyer-maker receives amount−fee.
- Timers: BullMQ delayed `order.expire` job per order + `orders.sweep` every 30s.
- Limits (used by M4): USD-equivalent usage consumed atomically inside the order transaction.
- Risk score per order (age, tier, payment risk, reversibility, amount spike, velocity, freeze reports, shared device) → manual-confirmation path when high.
- API: `/v1/payment-methods`, `/v1/ads` (book), `/v1/me/ads`, `/v1/orders/*`, `/v1/me/balances`, `/v1/me/limits`, mock-only `/v1/dev/{faucet,tier,seed}`.

**Acceptance**
- ✅ E2E buy and sell via the API on mocks (`apps/api/test/trading.e2e.test.ts`).
- ✅ Concurrency: 12 concurrent orders on an ad with room for 5 → exactly 5; concurrent release+cancel+timeout+markPaid races → exactly one outcome with consistent balances; idempotent concurrent duplicate order creation locks escrow once.
- ✅ Ledger balanced after 10,000 random concurrent operations (`packages/core/test/trading.property.test.ts`), escrow per seller equals open orders.

**Decisions**
- Global lock order: ad → limit_usage (sorted by user id; day then month) → accounts (sorted by id). Found by the fuzz test (a real deadlock); now passes with retries disabled. `runTx` also retries deadlock/serialization failures as a backstop.
- Prices are stored as fiat minor units per whole crypto unit ×10^8, so cheap fiats and expensive assets keep precision.

## M3 — Web app and realtime ✅

**Built**
- `packages/i18n`: 26 locale codes, RTL for ar/fa/ur, `translate` with fallback, locale formatting of decimals/money/dates/percent **without converting amounts to floats** (string-based grouping + locale digits). `en` is complete; the other languages land in M9 (CI's `i18n:check` fails on any missing key).
- `packages/ui`: shadcn/ui-style primitives (Button, Input, Select, Card, Badge, Tabs, Alert…) using logical properties so layouts flip in RTL; shared with the Telegram Mini App (M12).
- `apps/web` (Next.js 15 App Router, Tailwind v4): locale routing middleware, `/v1` proxied to the API (same-origin cookies, CSRF double-submit, automatic Idempotency-Key), strict CSP + security headers.
  Pages: market/order book with filters + live updates (`ads:{asset}:{fiat}` room), trade dialog, signup/verify/login (2FA prompt), post ad (fixed/floating), my orders, order page (countdown, reference code, payee details, mark paid / cancel / release with 2FA, dispute timer, feedback, realtime status), chat with attachments + typing indicator, wallet (balances, limits, faucet in mock mode, payment methods driven by the catalog's field schema, 2FA setup, KYC level-up), public profile with reputation, notifications. Responsive (stacked cards on mobile, bottom-sheet trade dialog).
- Backend: order chat (participant-only, magic-byte type sniffing, 10MB cap, virus scan, private storage keys, `nosniff` download), off-platform chat filter (phones, Telegram/WhatsApp handles/links, emails, "pay outside" in en/ru/es/pt; obfuscation-normalized) → message hidden + `OFF_PLATFORM_CHAT` flag; notifications (in-app rows + `user:{id}` socket + Telegram/email via Notifier after commit) on every order transition and chat message; reputation (trades 30d, completion, avg release, dispute rate, disputes lost, freeze reports, feedback, volume) recomputed on terminal transitions and nightly; feedback once per party per completed order; public profile endpoint.

**Acceptance**
- ✅ Playwright (`apps/web/e2e/trade.spec.ts`): two browser users — UI signup/verify/login, 2FA setup, faucet, payment method, post ad, browse book, place order, chat (incl. blocked off-platform message), mark paid, seller sees PAID in realtime, wrong then right 2FA release, buyer sees COMPLETED in realtime, feedback, balances. Arabic renders `dir=rtl` (desktop + Pixel 7).

## M4 — KYC & limits ✅ (built as a parallel stream, merged)

**Built**
- `packages/core/src/kyc.ts`: `startKyc` (next level only; level 1 needs verified email + phone + 2FA), `handleKycWebhook` (signature over raw body, dedupe on provider event id in the same tx, approved → encrypted verified name/DOB, person sanctions screen, raise tier — never lowered by stale approvals, `user.tier_changed` audit + event; rejected → reason), `kycStatus`, `getKycName` (for payer-name matching), `assertTierAllowed` (country `tier0Allowed` + `tierOverrides.minTierToTrade`, enforced for both parties in order creation), `setLimits` (validated, audited `limits.changed`, live without deploy).
- Sanctions screening on every tier change: hit → user frozen, `SANCTIONS_HIT` flag, audit, upgrade blocked (`manual_review`).
- API: `POST /v1/kyc/start`, `GET /v1/kyc/status`, `POST /v1/webhooks/kyc`, mock-only `POST /v1/dev/kyc/approve`.

**Acceptance**
- ✅ Tier upgrade via mock KYC webhook raises limits ($500 → $10,000 daily), core + API e2e.
- ✅ Over-limit order rejected with `LIMIT_EXCEEDED` inside the transaction (no order row, no escrow, ad remaining unchanged); succeeds after upgrade. Six concurrent $150 tier-0 orders → exactly 3 succeed.
- ✅ Sanctions hit on upgrade freezes and blocks; webhook replay is a no-op; bad signature → 401; blocked / tier-0-disallowed / min-tier countries cannot trade.

**Decisions**
- The sanctions screen (external call) runs before the DB transaction; its result is applied inside it. Tier 3 currently requires level-3 approval; M13 adds the merchant security deposit.
