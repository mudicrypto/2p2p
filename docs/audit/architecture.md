# Architecture

## Components
| Component | Tech | Responsibility |
|---|---|---|
| `apps/api` | NestJS (REST `/v1` + Socket.IO) | Thin HTTP/WS layer: auth guards, idempotency, rate limits, validation (zod), error mapping, OpenAPI |
| `apps/worker` | BullMQ | Timers (order expiry, sweepers), invariant check, rates, withdrawals, disputes SLA, reputation, payment polling, housekeeping |
| `apps/web` | Next.js 15 | User app (26 locales, RTL), strict nonce CSP |
| `apps/tg` | Next.js | Telegram Mini App re-exporting web screens; initData auth |
| `apps/admin` | Next.js | Admin/arbiter panel on a separate origin; IP allowlist; hardware-key login |
| `apps/mobile` | Expo / React Native | iOS + Android: biometric unlock, push, deep links |
| `packages/core` | TypeScript | **All domain logic**: ledger, orders/escrow, ads, limits, KYC, wallet, disputes, insurance, fraud, corridors, merchants, admin |
| `packages/db` | Drizzle + PostgreSQL 16 | Schema, migrations, append-only triggers, balance constraint trigger |
| `packages/providers` | Adapters | Custody, KYC, chain risk, payment verifiers, notifiers, rates, storage, AV, AI triage — mock + real |
| `packages/shared` | TypeScript | Money utils (bigint), order state machine, schemas, error codes |
| `packages/merchant-sdk` | TypeScript | HMAC client + auto-pricing bot |

## Trust boundaries
1. **Internet → API** (users, merchants, providers' webhooks). Users: session cookie (httpOnly, SameSite=strict) + double-submit CSRF, or bearer token (mobile). Merchants: HMAC-signed requests. Webhooks: provider signature over the raw body + event-id dedupe.
2. **Admin network → admin API** — IP allowlist, password, WebAuthn hardware key per session, RBAC, catch-all audit.
3. **API/worker → Postgres** — the only place money state lives; DB triggers enforce append-only ledger/audit and per-tx balance.
4. **API/worker → providers** — custody holds keys (no self-managed private keys); payment verifiers are read-only signals.
5. **Browser/Telegram/mobile → third-party content** — chat attachments are sniffed, scanned and served `nosniff`, private.

## Key flows
- **Order**: create (ad lock → limits → ad capacity → order → escrow lock ledger tx → AWAITING_PAYMENT) → mark paid / verifier confirm → release (2FA) or auto-release on full verifier match → COMPLETED (escrow → buyer, fee → fee + insurance). Cancel/timeout → refund. PAID → dispute after appeal wait → arbiter release/refund/split.
- **Deposit**: custody webhook → source risk screen → credit after N confirmations; high risk held for compliance.
- **Withdrawal**: 2FA + allowlist (24h) + security cooldown + risk screen + tier limit → `withdraw_pending` → (2 admins if large) → custody → settle or reverse.
- **Corridor**: two linked orders; leg 2 escrowed inside leg 1's release transaction.

## Deployment
Stateless API pods per region, single-writer Postgres primary + regional read replicas, Redis per region (cache, rate limits, BullMQ, Socket.IO adapter), Prometheus/Grafana/Sentry. See `docs/architecture/scaling.md` and `infra/`.
