# Security findings and fixes (M15)

## Automated scans (2026-11-06)
| Tool | Scope | Result |
|---|---|---|
| `pnpm audit --prod` | all workspaces | 16 (5 high, 11 moderate) → **0** after upgrades |
| Semgrep 1.184 (`p/typescript`, `p/nodejs`, `p/secrets`, `p/jwt`, `.semgrep.yml`) | 268 tracked files, 114 rules | 2 → **0** |
| detect-secrets (all tracked files) + git-history regex for cloud/API key formats | repo + history | 0 real secrets; 37 reviewed false positives (dev DB URLs, test passwords, env-var names, testnet addresses) recorded in `.secrets.baseline` / `.gitleaks.toml` |
| CI | every push | `pnpm audit --audit-level high`, Semgrep `--error`, gitleaks |

## Findings
| ID | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| F-1 | Critical | Mock custody/KYC adapters (well-known dev webhook secret, simulation hooks) could serve production when keys were missing → forged deposit webhooks credit funds | Production refuses to start with mock providers (`assertNoMocksInProduction`) unless `ALLOW_MOCK_PROVIDERS=1`; mock webhook verification disabled in production without an explicit secret | `security.test.ts` |
| F-2 | High | Telegram dev bot token accepted whenever `NODE_ENV≠production` (e.g. staging) → forged Mini App logins; initData valid 24 h | Dev token only in mock mode; missing token → Telegram login disabled; initData max age 1 h | `security.test.ts`, `auth.test.ts` |
| F-3 | High | drizzle-orm < 0.45.2 SQL injection via identifiers (GHSA-gpj5-g38j-94v9) | 0.45.4 | full suite |
| F-4 | High | zod < 4.6.6 memory exhaustion (GHSA-mrhx-c7xc-m3w5); multer < 2.5.0 DoS; postcss (via Next) | zod 4.6 migration (OpenAPI via native `z.toJSONSchema`), pnpm overrides for multer/postcss/glob/minimatch, Sentry 10 (OpenTelemetry fixes) | full suite + E2E |
| F-5 | Medium | TOTP codes replayable within the 30–60 s window (release, withdrawal, login) | Codes burned per (user, code, step ±1) | `security.test.ts` |
| F-6 | Medium | No throttle on wrong 2FA codes for release/withdraw (session holder could brute force) | Lockout after 5 failures / 15 min + audit `user.2fa_lockout` | `security.test.ts` |
| F-7 | Medium | AES-GCM decipher without pinned `authTagLength` (Semgrep `gcm-no-tag-length`) → truncated tags | `authTagLength: 16` + explicit tag length check | `auth.test.ts` tamper test |
| F-8 | Medium | CSP allowed `'unsafe-inline'` scripts in web/tg/admin | Per-request nonce + `'strict-dynamic'`, `object-src 'none'`, `base-uri 'none'` | Playwright (56 tests run under the CSP) |
| F-9 | Medium (availability/integrity) | Stale rate refresh wrote through a second pool connection inside the order transaction → pool deadlock under load, possible self-block on floating ads (found by load test) | Never write from inside a caller's transaction; compute in memory, persist after | load test |
| F-10 | Low | Orphaned idempotency reservations after a crash blocked retries forever | Reclaim after 120 s | load test |
| F-11 | Low | Cluster primary crash-looped workers on startup errors (CPU burn) | Exponential backoff, give up after repeated fast failures | manual |
| F-12 | Info | Signup reveals whether an email is registered | Accepted (rate limited, IP-velocity flagged); revisit with email-first verification flow | — |
| F-13 | Info | `style-src 'unsafe-inline'` kept (Tailwind/Next inline styles) | Accepted: styles cannot execute script under the nonce policy | — |

Earlier milestones also fixed: real deadlock in limit-usage lock ordering (M2 fuzz), shared-zod-instance validation errors returning 500 (M7).

**Status: 0 open high/critical findings.**
