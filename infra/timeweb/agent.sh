#!/usr/bin/env bash
# Pull-based deploy agent (installed by cloud-init, run every minute by a systemd timer).
# Downloads a new release from the private bucket when latest.txt changes, deploys it, and writes a
# status report that Caddy serves at https://<site>/_ops/<secret-token>/status.txt.
set -uo pipefail
B="s3://$(cat /opt/parley/BUCKET)"
ROOT=/opt/parley; WWW="$ROOT/www"; mkdir -p "$ROOT/releases" "$WWW"; chmod 755 "$ROOT" "$WWW"
exec 9>"$ROOT/agent.lock"; flock -n 9 || exit 0
s3() { s3cmd -c /root/.s3cfg --no-progress "$@"; }
s3err="$(mktemp)"
latest="$(s3 get --force "$B/latest.txt" - 2>"$s3err" | tr -d '[:space:]')"
current="$(cat "$ROOT/current" 2>/dev/null || true)"
if [ -n "$latest" ] && [ "$latest" != "$current" ]; then
  dir="$ROOT/releases/$latest"; log="$WWW/deploy-$latest.log"
  { rm -rf "$dir" && mkdir -p "$dir" \
    && s3 get --force "$B/releases/$latest.tar.gz" "$dir.tar.gz" \
    && tar -xzf "$dir.tar.gz" -C "$dir" && rm -f "$dir.tar.gz" \
    && bash "$dir/infra/timeweb/deploy.sh" && echo "$latest" > "$ROOT/current" && echo "DEPLOY OK $latest"; } > "$log" 2>&1 || echo "DEPLOY FAILED $latest" >> "$log"
  ls -1dt "$ROOT"/releases/*/ 2>/dev/null | tail -n +4 | xargs -r rm -rf   # keep the last 3 releases
fi
{
  date -u; echo "site: $(cat "$ROOT/SITE_HOST")  release: $(cat "$ROOT/current" 2>/dev/null)  latest-in-bucket: ${latest:-?}"
  [ -s "$s3err" ] && { echo "bucket error:"; head -5 "$s3err"; }
  echo; docker compose -p parley ps 2>&1; echo
  for s in api worker web migrate; do echo "== $s"; docker compose -p parley logs --tail 40 "$s" 2>&1 | cut -c1-400; done
  echo "== caddy"; journalctl -u caddy -n 20 --no-pager 2>&1 | cut -c1-300
  echo; free -m; df -h / | tail -1
} > "$WWW/status.tmp" 2>&1 && mv "$WWW/status.tmp" "$WWW/status.txt"
rm -f "$s3err"; exit 0
