#!/usr/bin/env bash
# Restore a backup into a scratch database and prove it is usable and consistent:
#  - checksum matches, restore succeeds, append-only/balance triggers present
#  - row counts and per-asset ledger sums equal the source (when SOURCE_URL is given)
#  - ledger invariants hold on the restored copy
# Usage: DUMP=/path/p2p-*.dump RESTORE_ADMIN_URL=postgres://.../postgres [SOURCE_URL=...] ./restore-test.sh
set -euo pipefail
: "${DUMP:?}" "${RESTORE_ADMIN_URL:?}"
sha256sum -c "$DUMP.sha256"
db="p2p_restore_$(date +%s)"
psql "$RESTORE_ADMIN_URL" -qc "create database $db"
target="${RESTORE_ADMIN_URL%/*}/$db"
trap 'psql "$RESTORE_ADMIN_URL" -qc "drop database if exists $db" >/dev/null' EXIT
pg_restore --no-owner --no-privileges --exit-on-error --dbname "$target" "$DUMP"
q() { psql "$1" -tAc "$2"; }
for t in ledger_entries_append_only audit_log_append_only ledger_entries_balanced; do
  [ "$(q "$target" "select count(*) from pg_trigger where tgname='$t'")" = 1 ] || { echo "missing trigger $t"; exit 1; }
done
CHECK="select (select count(*) from users)||','||(select count(*) from orders)||','||(select count(*) from ledger_entries)||','||(select count(*) from audit_log)||','||coalesce((select string_agg(asset||'='||s, ';' order by asset) from (select asset, sum(amount) s from ledger_entries group by asset) x),'')"
restored=$(q "$target" "$CHECK")
echo "restored: $restored"
if [ -n "${SOURCE_URL:-}" ]; then
  source=$(q "$SOURCE_URL" "$CHECK"); echo "source:   $source"
  [ "$source" = "$restored" ] || { echo "MISMATCH between source and restore"; exit 1; }
fi
DATABASE_URL="$target" node "$(dirname "$0")/verify-restore.mjs"
echo "RESTORE TEST PASSED ($db)"
