#!/usr/bin/env bash
# Runs on the server from an extracted release: /opt/parley/releases/<id>/infra/timeweb/deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
# Caddy (user "caddy") must read the status folder; keep the agent in step with the release.
chmod 755 /opt/parley /opt/parley/www 2>/dev/null || true
install -m 755 ./agent.sh /usr/local/bin/parley-agent
# Health monitor: every minute, self-healing restarts + alerts (see monitor.sh).
command -v jq >/dev/null || apt-get install -y -q jq >/dev/null 2>&1 || true
install -m 755 ./monitor.sh /usr/local/bin/parley-monitor
cat > /etc/systemd/system/parley-monitor.service <<'UNIT'
[Unit]
Description=parley health monitor
After=docker.service
[Service]
Type=oneshot
ExecStart=/usr/local/bin/parley-monitor
TimeoutStartSec=300
UNIT
cat > /etc/systemd/system/parley-monitor.timer <<'UNIT'
[Unit]
Description=Run the parley health monitor every minute
[Timer]
OnBootSec=120
OnUnitActiveSec=60
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload && systemctl enable --now parley-monitor.timer >/dev/null 2>&1 || true
ENV=/opt/parley/.env
# Secrets are generated once on the server and never leave it.
if [ ! -f "$ENV" ]; then
  umask 077
  {
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
    echo "DATA_ENCRYPTION_KEY=$(openssl rand -base64 32)"
    echo "MOCK_WEBHOOK_SECRET=$(openssl rand -hex 32)"
    echo "TELEGRAM_BOT_TOKEN=disabled-$(openssl rand -hex 16)"
    echo "METRICS_TOKEN=$(openssl rand -hex 24)"
  } > "$ENV"
fi
# Main domain: site.env (SITE_HOST=...) wins over the address the server was created with; the original address
# stays as LEGACY_HOST and keeps serving the API, admin and ops pages so older app builds and passkeys keep working.
ORIG_HOST="$(cat /opt/parley/ORIG_HOST 2>/dev/null || cat /opt/parley/SITE_HOST)"; echo "$ORIG_HOST" > /opt/parley/ORIG_HOST
WANT="$(grep '^SITE_HOST=' ./site.env | cut -d= -f2 | tr -d ' ')"
# Only move to a new domain once it really points at this server: switching earlier would break HTTPS for everyone.
# Until then the agent re-checks every minute (PENDING_HOST) and re-runs this script when the DNS is live.
# Local resolver first; it can keep an old "no such name" answer for a long time, so also ask public DNS (Cloudflare, Google).
ips() {
  { getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}'
    for u in "https://cloudflare-dns.com/dns-query?name=$1&type=A" "https://dns.google/resolve?name=$1&type=A"; do
      curl -s -m 8 -H 'accept: application/dns-json' "$u" 2>/dev/null | grep -o '"data":"[0-9.]*"' | cut -d'"' -f4
    done; } | grep -E '^[0-9.]+$' | sort -u
}
if [ -n "$WANT" ] && [ "$WANT" != "$(cat /opt/parley/SITE_HOST)" ]; then
  MYIP="$(ips "$ORIG_HOST" | head -1)"
  if [ -n "$MYIP" ] && ips "$WANT" | grep -qx "$MYIP"; then echo "$WANT" > /opt/parley/SITE_HOST; rm -f /opt/parley/PENDING_HOST; echo "switching main domain to $WANT"
  else echo "$WANT" > /opt/parley/PENDING_HOST; echo "waiting for DNS: $WANT does not point to $MYIP yet; keeping $(cat /opt/parley/SITE_HOST)"; fi
elif [ -n "$WANT" ]; then rm -f /opt/parley/PENDING_HOST; fi
SITE_HOST="$(cat /opt/parley/SITE_HOST)"
REDIRECT_HOSTS="$(grep '^REDIRECT_HOSTS=' ./site.env | cut -d= -f2- | tr -d '"')"
[ -f /opt/parley/PENDING_HOST ] && REDIRECT_HOSTS=""   # forward the extra names only once the main domain is live
LEGACY_HOST=""; [ "$ORIG_HOST" != "$SITE_HOST" ] && LEGACY_HOST="$ORIG_HOST"
ORIGINS="https://$SITE_HOST${LEGACY_HOST:+,https://$LEGACY_HOST}"; RPIDS="$SITE_HOST${LEGACY_HOST:+,$LEGACY_HOST}"
# First superadmin: email from site.env, password generated here once. It is published for 2 hours
# under the secret ops path so it can be handed over, then the agent deletes it.
if ! grep -q '^ADMIN_INITIAL_PASSWORD=' "$ENV"; then
  pw="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
  echo "ADMIN_INITIAL_PASSWORD=$pw" >> "$ENV"
  printf 'admin email: %s\ninitial password: %s\n' "$(grep '^ADMIN_EMAIL=' ./site.env | cut -d= -f2)" "$pw" > /opt/parley/www/admin-initial.txt
  chmod 644 /opt/parley/www/admin-initial.txt
fi
grep -v -e '^SITE_HOST=' -e '^ADMIN_EMAIL=' -e '^ADMIN_KEY_RESET=' -e '^WEB_ORIGINS=' -e '^WEBAUTHN_RP_IDS=' "$ENV" > "$ENV.tmp" && { echo "SITE_HOST=$SITE_HOST"; echo "WEB_ORIGINS=$ORIGINS"; echo "WEBAUTHN_RP_IDS=$RPIDS"; grep -e '^ADMIN_EMAIL=' -e '^ADMIN_KEY_RESET=' ./site.env; } >> "$ENV.tmp" && mv "$ENV.tmp" "$ENV" && chmod 600 "$ENV"
# Keep the host Caddy routes in step with the release (adds /admin); the ops token stays as provisioned.
OPS_TOKEN="$(grep -o '/_ops/[0-9a-f]*' /etc/caddy/Caddyfile | head -1 | cut -d/ -f3)"
if [ -n "$OPS_TOKEN" ]; then
  {
    sed -e "s/{SITE}/$SITE_HOST/" -e "s/{OPS_TOKEN}/$OPS_TOKEN/" ./Caddyfile.tmpl
    # Old address: API, admin and ops keep working; web pages move to the main domain.
    [ -n "$LEGACY_HOST" ] && sed -e "s/{LEGACY}/$LEGACY_HOST/" -e "s/{SITE}/$SITE_HOST/" -e "s/{OPS_TOKEN}/$OPS_TOKEN/" ./Caddyfile.legacy.tmpl
    # Extra names (www, other domains) forward to the main domain.
    [ -n "$REDIRECT_HOSTS" ] && printf '\n%s {\n\tredir https://%s{uri} permanent\n}\n' "$(echo $REDIRECT_HOSTS | sed 's/ /, /g')" "$SITE_HOST"
  } > /etc/caddy/Caddyfile.new
  caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile >/dev/null 2>&1 || { echo "caddy config invalid, keeping the old one"; rm -f /etc/caddy/Caddyfile.new; }
  [ -f /etc/caddy/Caddyfile.new ] && if ! cmp -s /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile; then mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile && systemctl reload caddy; else rm -f /etc/caddy/Caddyfile.new; fi
fi
export DOCKER_BUILDKIT=1
docker compose -p parley --env-file "$ENV" build
docker compose -p parley --env-file "$ENV" up -d --remove-orphans
docker image prune -f >/dev/null
# Telegram alerts: once a real bot token is in .env, point the bot's webhook at this site (secret derived from the token).
TG="$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV" | cut -d= -f2-)"
case "$TG" in disabled-*|"") ;; *)
  SECRET="$(printf '%s' parley-webhook | openssl dgst -sha256 -hmac "$TG" -r | cut -c1-48)"
  curl -fsS -m 20 "https://api.telegram.org/bot$TG/setWebhook" -d "url=https://$SITE_HOST/v1/telegram/webhook" -d "secret_token=$SECRET" -d 'allowed_updates=["message"]' >/dev/null || echo "telegram webhook setup failed"
esac
docker builder prune -f --filter until=48h >/dev/null 2>&1 || true   # keep build cache from filling the disk
echo "deployed $SITE_HOST"
