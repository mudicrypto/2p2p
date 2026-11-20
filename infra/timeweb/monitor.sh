#!/usr/bin/env bash
# parley health monitor (installed by deploy.sh, run every minute by parley-monitor.timer).
# Checks the public site, API, admin, worker, disk and memory. After 2 failed checks in a row it restarts the
# failing container, and it sends an alert when something goes down and when it recovers:
#   - Telegram: set ALERT_TELEGRAM_CHAT_ID in /opt/parley/.env (with a real TELEGRAM_BOT_TOKEN)
#   - any webhook (Slack/Discord/ntfy/...): set ALERT_WEBHOOK_URL in /opt/parley/.env
# Status page: https://<site>/_ops/<ops-token>/health.txt
set -uo pipefail
ROOT=/opt/parley; ENV=$ROOT/.env; STATE=$ROOT/monitor; WWW=$ROOT/www
mkdir -p "$STATE"; umask 022
SITE="$(cat $ROOT/SITE_HOST 2>/dev/null || echo localhost)"
val() { grep "^$1=" "$ENV" 2>/dev/null | head -1 | cut -d= -f2-; }
TG="$(val TELEGRAM_BOT_TOKEN)"; CHAT="$(val ALERT_TELEGRAM_CHAT_ID)"; HOOK="$(val ALERT_WEBHOOK_URL)"

alert() {
  local msg="parley ($SITE): $1"
  echo "$(date -u +%FT%TZ) ALERT $1" >> "$STATE/incidents.log"
  if [ -n "$CHAT" ] && [ -n "$TG" ] && [[ "$TG" != disabled-* ]]; then
    curl -fsS -m 10 "https://api.telegram.org/bot$TG/sendMessage" --data-urlencode "chat_id=$CHAT" --data-urlencode "text=$msg" >/dev/null || true
  fi
  if [ -n "$HOOK" ]; then
    curl -fsS -m 10 -H 'content-type: application/json' -d "$(printf '{"text":%s,"content":%s}' "$(jq -Rn --arg m "$msg" '$m')" "$(jq -Rn --arg m "$msg" '$m')")" "$HOOK" >/dev/null || true
  fi
}

# name|url|container to restart
CHECKS=(
  "api|http://127.0.0.1:4000/healthz|api"
  "web|http://127.0.0.1:3000/en|web"
  "admin|http://127.0.0.1:3001/admin/login|admin"
  "public site|https://$SITE/healthz|"
)
report=()
for c in "${CHECKS[@]}"; do
  IFS='|' read -r name url svc <<<"$c"
  key="$STATE/fail-${name// /_}"
  code="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$url" || echo 000)"
  if [[ "$code" =~ ^(200|301|302|307|308)$ ]]; then
    if [ -f "$key" ]; then alert "$name is back up"; rm -f "$key"; fi
    report+=("OK    $name ($code)")
  else
    n=$(( $(cat "$key" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$key"
    report+=("FAIL  $name ($code), $n check(s) in a row")
    if [ "$n" -eq 2 ]; then
      alert "$name is DOWN (HTTP $code)${svc:+, restarting $svc}"
      [ -n "$svc" ] && docker compose -p parley restart "$svc" >/dev/null 2>&1 || true
    elif [ "$n" -eq 10 ]; then
      alert "$name still DOWN after 10 minutes: needs a person"
    fi
  fi
done

# The worker has no HTTP port: check the container is running.
if [ "$(docker inspect -f '{{.State.Running}}' parley-worker-1 2>/dev/null)" = "true" ]; then report+=("OK    worker")
else report+=("FAIL  worker"); [ -f "$STATE/fail-worker" ] || alert "worker is not running, starting it"; touch "$STATE/fail-worker"; docker compose -p parley up -d worker >/dev/null 2>&1 || true; fi
[ "$(docker inspect -f '{{.State.Running}}' parley-worker-1 2>/dev/null)" = "true" ] && [ -f "$STATE/fail-worker" ] && { rm -f "$STATE/fail-worker"; alert "worker is running again"; }

# Disk and memory: warn once per day when low.
disk=$(df --output=pcent / | tail -1 | tr -dc 0-9)
mem=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
report+=("INFO  disk ${disk}% used, ${mem} MB memory free")
today=$(date -u +%F)
if [ "$disk" -ge 85 ] && [ "$(cat $STATE/disk-warned 2>/dev/null)" != "$today" ]; then
  docker image prune -f >/dev/null 2>&1; docker builder prune -f --filter until=24h >/dev/null 2>&1
  alert "disk ${disk}% full (old build files cleaned; add disk space if it stays high)"; echo "$today" > "$STATE/disk-warned"
fi
if [ "$mem" -lt 250 ] && [ "$(cat $STATE/mem-warned 2>/dev/null)" != "$today" ]; then alert "low memory: ${mem} MB free"; echo "$today" > "$STATE/mem-warned"; fi

{ echo "parley health  $(date -u +%FT%TZ)  site: $SITE"; printf '%s\n' "${report[@]}"; echo; echo "== recent incidents"; tail -n 20 "$STATE/incidents.log" 2>/dev/null || echo "none"; } > "$WWW/health.txt.tmp" && mv "$WWW/health.txt.tmp" "$WWW/health.txt"
chmod 644 "$WWW/health.txt"
