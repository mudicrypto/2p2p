# PROGRESS

Spec: `CLAUDE.md`. Milestones are executed in order (section 13). Each entry lists what was built, decisions and blockers.

## Status

| Milestone | Status |
|---|---|
| M1 Foundation | ✅ done |
| M2 Trading core | ✅ done |
| M3 Web app & realtime | ✅ done |
| M4 KYC & limits | ✅ done (parallel stream) |
| M5 Wallet & custody | ✅ done on mock custody — real testnet run blocked on custody sandbox keys |
| M6 Admin & compliance | ✅ done |
| M7 Disputes & insurance | ✅ done (parallel stream) |
| M8 Anti-fraud | ✅ done |
| M9 Global layer | ✅ done |
| M10 Payment auto-confirm | ✅ done on mocks + provider-format payloads — live sandboxes need keys |
| M11 Corridors | ✅ done |
| M12 Telegram Mini App & mobile | ⏳ next |
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

## M5 — Wallet and custody ✅ (mock custody) · ⛔ real testnet pending credentials

**Built** (`packages/core/src/wallet.ts`, `apps/api/src/modules/wallet.controller.ts`)
- Deposit addresses per user/asset/network via `CustodyProvider` (TON uses memos).
- Custody webhook: signature over raw body, dedupe on provider event id, source-address chain-risk screen, credit only after the network's configured confirmations (`confirmations` config: TRON 20, TON 10, BSC 15, ETH 12, POLYGON 128, BTC 2). High-risk or sanctioned sources are **held** (sanctioned also freezes the user and flags); compliance can credit or reject held deposits.
- Withdrawals: global pause switch (set by the invariant job), active account, 2FA re-prompt, 24h cooldown after password/2FA change, per-network address format validation, allowlist with 24h activation delay (risk-screened at add), destination risk screen (sanctioned/high risk blocked + flagged), tier daily withdrawal limit (tier-0 $500/day), network fee to the fee account, `withdraw_pending` ledger account until custody settles. Large (≥ $10k, configurable) or risky withdrawals need **two distinct admins** (`withdrawal_approvals` PK prevents double approval). Custody failures reverse the ledger and refund the fee; the custody call is idempotent on withdrawal id.
- Internal transfers: free, instant, ledger-only, 2FA.
- Worker: `withdrawal.submit` on approval + `withdrawals.process` every 30s (submit approved, poll submitted).
- Mock-only `POST /v1/dev/custody/deposit` simulates on-chain deposits.

**Acceptance**
- ✅ Deposit → trade → withdrawal end-to-end for **every** supported asset/network (USDT on TRON, TON, BSC, ETHEREUM, POLYGON; BTC; ETH) against the mock custody, with confirmation gating, webhook replay, ledger invariant incl. custody balance.
- ✅ Withdrawal rule tests (2FA, allowlist delay, security cooldown, sanctions, tier-0 limit, pause), two-admin approval, failed-submission reversal, held high-risk deposit review, internal transfers.
- ⛔ **Real testnet run blocked:** needs a Fireblocks/BitGo/Cobo sandbox workspace + API key/secret (`TODO(provider)` in `packages/providers/src/real/stubs.ts`). Everything else runs on the mock until then.

## M6 — Admin and compliance panel ✅

**Built**
- Admin auth (`packages/core/src/admin.ts`): separate `admin_users`/`admin_sessions`; step 1 password + IP allowlist (`ADMIN_IP_ALLOWLIST`), step 2 **WebAuthn hardware key** bound to that session (first-login key enrolment); sessions are unusable until WebAuthn completes and are pinned to allowlisted IPs. Separate cookies (`asid`/`acsrf`) with CSRF double-submit.
- Roles support, arbiter, compliance, finance, superadmin with a least-privilege permission matrix (`PERMISSIONS`); `AdminGuard` fails closed when a route declares no permission. PII is masked for roles without `users.read_pii`; viewing a user is itself audited.
- Every admin action is audited twice: the domain function writes its own before/after entry, and `AdminAuditInterceptor` writes a catch-all `admin.request` row for every mutating admin request (success or failure, secrets redacted). Denied permissions are audited too.
- Admin API (`/v1/admin/*`): user search/detail/freeze/ban, KYC manual review, withdrawal approvals (two distinct admins), held-deposit review, editors for limits, country rules, payment-method types, fiat currencies, fees, withdrawal switches, generic config (superadmin), audit-log viewer with filters, risk flags, SAR/STR creation + JSON/CSV export, admin management, plus the arbiter queue/decisions, freeze-report review and insurance fund (wired after M7 merged).
- `apps/admin` (Next.js, separate origin, edge IP allowlist, no-index, strict CSP/HSTS, no framing): password + security-key login via `@simplewebauthn/browser`, role-aware menu, generic table + action/editor pages for every section.
- `packages/core/src/testing/soft-authenticator.ts`: an ES256 software authenticator so tests exercise the real WebAuthn verification path.

**Acceptance**
- ✅ Every admin action appears in the audit log (API e2e checks domain entries + catch-all rows + denied-permission entries).
- ✅ Role matrix test: support, arbiter, compliance, finance and superadmin each hit every admin endpoint; only permitted ones succeed (superadmin all).

## M7 — Disputes and insurance ✅ (parallel stream, merged)

**Built**
- `packages/core/src/disputes.ts`: `openDispute` (buyer/seller, PAID only, after the appeal wait, reason + note + ≥1 evidence key uploaded to the order; DISPUTED via optimistic transition; SLA due = now + 30 min; system chat message; notifications; triage queued), `openDisputeSystem` (automatic flags, no appeal wait), `addEvidence`, `runTriage` (order + chat incl. flagged + evidence + payment-verifier records → `AiTriageProvider`; stores summary, recommendation, confidence; **never decides**), `assignDispute`, `decideDispute` (release/refund/split; ledger + loser + `dispute.decided` audit + both parties notified with the reason + reputation; repeat losers auto-frozen with `REPEAT_DISPUTE_LOSER`), `escalateOverdueDisputes` (worker every 60s, pages on-call), `arbiterQueue` (SLA-ordered with time remaining), `getDisputeDetail`, participant view without AI fields.
- `packages/core/src/insurance.ts`: fund fed by the fee slice; idempotent admin top-up; `submitFreezeReport` (seller of a completed order, once, bank letter attached, claim ≤ order amount, flags buyer); `reviewFreezeReport` (payout from the insurance account, idempotency key `freeze:{id}:payout`, capped by `maxPayoutUsdCents` and fund balance; feeds buyer reputation/risk).
- API: `POST/GET /v1/orders/:id/dispute`, `POST /v1/disputes/:id/evidence`, `POST/GET /v1/freeze-reports`; admin endpoints listed under M6.
- Fixed: validation errors from `@p2p/shared` schemas (separate zod instance) were 500s — the error filter now matches by name.

**Acceptance**
- ✅ Dispute E2E (core + API) for release, refund and split with exact balances (split 60%/70%: buyer share of crypto, seller gets the rest of the escrow incl. fee, no fee charged).
- ✅ Appeal wait, wrong-state and evidence rules; triage stored but arbiter still required; SLA escalation; repeat-offender freeze.
- ✅ Insurance payout balances the ledger (`checkInvariants` ok); payouts capped; double payout impossible.

## M8 — Anti-fraud engine ✅

**Built**
- Payer-name matching (`name-match.ts`): normalizes case, order, diacritics, honorifics, particles (da/van/bin…), initials, Cyrillic transliteration; needs ≥2 full-token matches for multi-part names.
- Payment matching (`payment-match.ts`): amount + unique reference code + payer name vs the buyer's KYC name, stored in `payment_confirmations` (payer name encrypted, idempotent per provider ref). Full match → verifier marks PAID and auto-releases unless the order is on the manual path. **Third-party payer** → `THIRD_PARTY_PAYMENT` flags on order and buyer, manual path, order moved to PAID and an automatic system dispute opened. Partial matches are audited, never released.
- Order risk score (age, tier, payment-rail risk, reversibility, amount vs history, velocity, counterparty freeze reports, open high flags, shared device). Any high-severity flag forces manual confirmation.
- Velocity: orders/hour (`VELOCITY`), signups per IP per hour (`SIGNUP_IP_VELOCITY` on all accounts), failed logins per IP per 15 min (`RATE_LIMITED`).
- Multi-account detection: device fingerprint shared by >2 accounts flags all of them; buyer/seller sharing a device flags the order (`SHARED_DEVICE_COUNTERPARTIES`).
- New-account cooldown (48h lower limits) and 24h withdrawal lock after password/2FA changes (from M4/M5); off-platform chat filter + flag (M3).
- `userRiskScore` (flags, disputes lost, freeze reports, shared devices, age, tier, sanctions) shown in the admin user view; worker `payment.verify` job polls the rail verifier.

**Acceptance**
- ✅ Simulated fraud suite (`packages/core/test/fraud.test.ts`): third-party payment → flags + automatic dispute + no release; full match auto-releases while wrong amount / missing reference do not; multiple accounts on one device flagged; shared-device counterparties forced to manual confirmation; order velocity, signup-IP velocity and login brute-force all trigger; cooldown limits and off-platform chat flags.

## M9 — Global layer ✅

**Built**
- All 155 active ISO 4217 currencies seeded (`packages/core/src/data/currencies.ts`, generated from CLDR with ISO minor-unit overrides: KWD/BHD/JOD/OMR/TND/IQD/LYD = 3, JPY/KRW/VND/CLP/XOF/XAF… = 0). Each has `enabled`, `min_order`, `max_order`, `rate_source` (admin-editable); 64 fiats enabled by default.
- Full payment-method catalog from §2b — 73 methods across Europe, North America, LatAm, Asia, CIS, Middle East, Africa, Oceania, Global — each with countries, currencies, zod-validated field schema (stored as JSON), `reversible`, `risk_level`, `verifier_available`, hold hours. Card/PayPal/Cash App/Venmo are reversible + opt-in + hold; cash in person is opt-in/high risk; gift cards are disabled.
- Rates: ≥3 sources, median, reject >2% outliers (real: Binance, Kraken, Coinbase + FX cross for fiats with no direct market; mock: three jittered sources).
- 26 languages: en, es, pt, ru, uk, tr, ar, fa, ur, hi, bn, id, ms, vi, th, fil, zh-Hant, ko, ja, fr, de, it, pl, sw, ha, yo — complete translations, lazily loaded per locale; RTL for ar/fa/ur; locale formatting of amounts via `Intl` on **BigInt** integer parts (lakh grouping for hi/bn, Persian digits, etc.) with no float conversion.
- Country rules applied app-wide: signup, trading (both parties), ad creation, payment-method allow-lists, tier-0 rules, limit multipliers, launch flag; public `GET /v1/countries/:code` (allowed, disclosures, allowed methods) and `GET /v1/fiats` (market selector).

**Acceptance**
- ✅ Playwright renders every locale (home/login/signup) on desktop and Pixel 7: correct `lang`/`dir`, no untranslated keys, no horizontal overflow (55/55 passing). Unit tests check key completeness, placeholder parity and that ≥75% of strings differ from English in every locale.
- ✅ Ads in any fiat × method combination work: every enabled catalog method × each of its currencies (>100 combos) goes ad → order → paid → release; reversible rails land in hold.
- ✅ A blocked country (or one with `launchEnabled=false`) can't sign up, create ads or trade.

**Decisions**
- Translations were authored for this milestone and should be reviewed by native speakers before launch (especially sw/ha/yo/fil); CI enforces completeness.

## M10 — Payment auto-confirmation ✅ (mock + provider payload formats) · ⛔ live sandboxes pending keys

**Built**
- `packages/providers/src/verifiers/`: real adapters for **PIX** (PSP webhook `pix[]` + `/v2/pix` polling), **UPI** (Razorpay-style webhook), **SEPA Instant** and **Faster Payments** (open-banking transaction push + `/accounts/{id}/transactions` polling), **SPEI** (STP abono), **SBP** (bank incoming-payment webhook), **M-Pesa** (Daraja C2B confirmation) and **PromptPay** (bank payment-confirmation callback). Each verifies an HMAC signature over the raw body, maps the provider's payload to amount / reference / payer name without float math, and is selected only when its secret exists (`<RAIL>_WEBHOOK_SECRET`); otherwise the mock verifier is used.
- `POST /v1/webhooks/payments/:rail` → signature check → reference code extracted from the payment comment → order lookup (must be on that rail) → `handleIncomingPayment` (M8): auto-release only when amount, reference **and** payer name (vs KYC name) all match; mismatched name → third-party flag + automatic dispute + no release. Dedupe on (rail, provider ref). Worker `payment.verify` polls rails that support it after the buyer marks paid. Mock-only `POST /v1/dev/payments/simulate`.

**Acceptance**
- ✅ For each of the 8 rails: a payload in the provider's own format with a valid signature auto-releases; a bad signature is rejected; a mismatched payer name blocks the release (order goes to DISPUTED, buyer gets nothing). The mock polling path auto-releases on every rail. API e2e covers the SPEI webhook end to end.
- ⛔ **Live sandbox runs blocked:** need sandbox credentials per rail (PIX PSP + mTLS cert, Razorpay/Cashfree, an open-banking aggregator for SEPA Instant/FPS, STP, a Russian bank API for SBP, Safaricom Daraja, a Thai bank for PromptPay). Field names are marked `TODO(provider)` for verification against each sandbox.

## M11 — Cross-border corridors ✅

**Built** (`packages/core/src/corridors.ts`, `/v1/corridors`, web `/{locale}/corridor`)
- Quote: best SELL ad in fiat A (non-reversible rails only) and best BUY ad in fiat B that accepts the user's receiving method and fits the size; shows you pay / you receive / USDT routed, **effective rate vs market rate** (reference prices) and the spread.
- Create: corridor row + both orders in **one transaction** with a shared deadline. Leg 1 (user buys USDT with fiat A) is escrowed normally; leg 2 (user sells the USDT for fiat B) is created in `CREATED` with the ad capacity and limits reserved. `createOrder` was refactored into a composable `createOrderInTx`.
- Linked settlement inside each leg's ledger transaction: leg 1 release → leg 2 escrow funded from the USDT just received and moved to AWAITING_PAYMENT atomically; leg 1 cancel/timeout/split → leg 2 cancelled via `LINKED_LEG_FAILED` (ad capacity and limits restored, no ledger movement since it was never escrowed); leg 2 failure → its escrow refunds to the user. Corridor status: active → completed | rolled_back. Worker `corridors.sweep` as a safety net.

**Acceptance**
- ✅ EUR → BRL corridor completes (core + API e2e): exact balances, fees, effective/market rates.
- ✅ Leg 1 cancel and leg 1 timeout → both legs CANCELLED, ad remaining and limit usage restored, no escrow left, invariants OK. Leg 2 timeout after leg 1 → user's USDT refunded from escrow, nothing stranded.

**Decisions**
- Once leg 1 has settled, the fiat-A payment cannot be reversed; a leg-2 failure therefore returns the intermediate USDT to the user's balance (they can withdraw or retry). Everything before leg 1 settlement rolls back completely.
