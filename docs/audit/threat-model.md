# Threat model (STRIDE)

**Assets**: customer crypto (custody + ledger), escrow integrity, fiat-payment truth, KYC PII, admin powers, session/2FA secrets, provider credentials.
**Adversaries**: external attackers, fraudulent traders (scammers, chargeback/third-party payers, money mules, multi-accounters), compromised user devices, malicious/compromised admin, compromised provider webhook path, insider with DB read access.

| # | Threat | Boundary | Mitigations | Residual |
|---|---|---|---|---|
| S1 | Account takeover (credential stuffing) | Internet→API | argon2id, failed-login IP velocity lockout, per-IP/user rate limits, TOTP/passkeys, device tracking + security alerts | Phishing of TOTP (passkeys recommended) |
| S2 | Session theft / CSRF | Browser | httpOnly SameSite=strict cookies, double-submit CSRF, strict nonce CSP, no inline scripts | XSS in third-party deps |
| S3 | 2FA replay / brute force on release & withdraw | API | single-use TOTP per step, lockout after 5 failures/15 min, biometric re-prompt on mobile | — |
| S4 | Forged provider webhooks (fake deposits, fake payments) | Providers→API | HMAC/provider signature over raw body, event dedupe, **production refuses mock providers** | Provider key compromise |
| S5 | Forged Telegram identity | TG→API | initData HMAC with bot token, 1 h freshness, dev token only in mock mode | — |
| T1 | Ledger tampering / double spend | API→DB | double-entry, FOR UPDATE ordering, deferred balance trigger, append-only triggers, idempotent txs, invariant job + auto-pause | DB superuser compromise |
| T2 | Race: release vs cancel vs timeout | API | optimistic `WHERE status = :expected` + row locks; race & 10k fuzz tests | — |
| T3 | Order/limit manipulation via concurrency | API | limits consumed inside order tx (atomic upsert), ad remaining checked under lock | — |
| R1 | Admin abuse / deniability | Admin | WebAuthn per session, IP allowlist, least-privilege RBAC, every action audited (domain + catch-all), two-admin withdrawals | Collusion of two finance admins |
| I1 | PII / payment-details leakage | DB, logs | envelope encryption (AES-256-GCM, KMS-wrapped DEKs, pinned tag length), PII masking by role, log redaction, Sentry scrubbing | KMS key compromise |
| I2 | IDOR on orders/chat/attachments | API | participant checks on every read, attachment keys namespaced by order, private storage | — |
| D1 | API/WS flood | Internet | Redis rate limits, body limits, cache for book, horizontal scaling | Volumetric DDoS (edge provider) |
| E1 | Merchant API key abuse | API | HMAC with timestamp ±30 s, single-use signatures, scopes (fail closed), revocation, keys created with 2FA | Key exfiltration from merchant host |
| F1 | Third-party / stolen-account fiat payments | Fraud | payer-name match vs KYC name, reference codes, auto-dispute, no auto-release on mismatch | Name collisions |
| F2 | Chargebacks on reversible rails | Fraud | tier 2+ opt-in sellers only, buyer hold period, no reversible rails in corridors | — |
| F3 | Off-platform scams | Chat | filter (phones, handles, links, "pay outside" multi-language), hidden + flagged | Obfuscated phrasing |
| F4 | Multi-accounting / collusion / velocity | Fraud | device fingerprint graph, shared-device counterparties → manual path, signup/order velocity flags, new-account cooldowns | Fingerprint spoofing |
| F5 | Sanctioned users / funds | Compliance | person screening at signup and every tier change, address screening on deposits/withdrawals/allowlist, freezes | List latency |
| F6 | AI triage manipulation (prompt injection in chat/evidence) | Disputes | triage is advisory only, inputs marked untrusted, human arbiter decides | — |
