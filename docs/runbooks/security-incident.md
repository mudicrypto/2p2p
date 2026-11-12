# Security incident

1. SEV1, involve Security + Compliance leads; start an evidence log (no evidence on personal devices).
2. Contain: pause withdrawals; revoke sessions (`update sessions set revoked_at = now()` for affected users — sessions are not part of the ledger) or freeze users via admin; rotate exposed credentials (provider keys in Secrets Manager → External Secrets refresh; KMS key rotation for app KEK re-wraps DEKs lazily); revoke merchant API keys; disable admin accounts.
3. Admin compromise: IP allowlist + hardware keys make this unlikely; review `audit_log` for the admin id (`admin.request` catch-all rows include every mutation), reverse unauthorized config changes (audited before/after).
4. Notify regulators/users per jurisdiction (GDPR 72 h etc.) — Compliance owns.
5. Postmortem + fix + regression test.
