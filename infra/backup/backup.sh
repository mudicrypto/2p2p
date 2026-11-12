#!/usr/bin/env bash
# Logical backup of the primary (complements continuous WAL archiving / PITR configured on the managed DB).
# Usage: DATABASE_URL=... BACKUP_BUCKET=s3://... ./backup.sh
set -euo pipefail
# Client tools must match the server major version: a newer pg_dump emits settings an older server rejects on restore.
server_major=$(psql "$DATABASE_URL" -tAc "show server_version_num" | cut -c1-2)
client_major=$(pg_dump --version | grep -oE '[0-9]+' | head -1)
[ "$server_major" = "$client_major" ] || { echo "pg_dump $client_major does not match server $server_major (set PATH to the matching client, e.g. /usr/lib/postgresql/$server_major/bin)" >&2; exit 2; }
ts=$(date -u +%Y%m%dT%H%M%SZ)
out="${BACKUP_DIR:-/tmp}/p2p-${ts}.dump"
pg_dump --format=custom --no-owner --no-privileges --serializable-deferrable --file "$out" "$DATABASE_URL"
sha256sum "$out" > "$out.sha256"
if [ -n "${BACKUP_BUCKET:-}" ]; then
  # Server-side encryption with the backup KMS key; bucket has object lock (compliance mode) + cross-region replication.
  aws s3 cp "$out" "$BACKUP_BUCKET/" --sse aws:kms --sse-kms-key-id "${BACKUP_KMS_KEY_ID:?}"
  aws s3 cp "$out.sha256" "$BACKUP_BUCKET/" --sse aws:kms --sse-kms-key-id "$BACKUP_KMS_KEY_ID"
fi
echo "$out"
