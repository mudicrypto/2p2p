# Database: failover, replica lag, restore

- **Primary failure**: RDS Multi-AZ fails over automatically (~1–2 min). API pods reconnect; in-flight transactions roll back atomically (clients retry with the same Idempotency-Key). Verify invariants after.
- **Replica lag > 30 s**: reads that matter for money already use the primary; set `DATABASE_REPLICA_URL` empty (config map) to route book/profile reads to the primary if lag persists.
- **Point-in-time restore** (data corruption / bad migration): pause withdrawals → RDS PITR to a new instance at T-1 min before the incident → run `infra/backup/restore-test.sh` checks against it → switch `DATABASE_URL` → reconcile events after T from custody/provider logs (webhooks are idempotent and can be replayed) → invariants → unpause.
- **Logical backups**: daily `p2p-backup` CronJob (S3, KMS, object lock 90 days); weekly `p2p-restore-test` restores into a scratch DB and verifies triggers, row counts, per-asset ledger sums and invariants. A failed restore test pages on-call.
