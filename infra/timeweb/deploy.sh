#!/usr/bin/env bash
# Runs on the server from an extracted release: /opt/parley/releases/<id>/infra/timeweb/deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
# Caddy (user "caddy") must read the status folder; keep the agent in step with the release.
chmod 755 /opt/parley /opt/parley/www 2>/dev/null || true
install -m 755 ./agent.sh /usr/local/bin/parley-agent
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
SITE_HOST="$(cat /opt/parley/SITE_HOST)"
# First superadmin: email from site.env, password generated here once. It is published for 2 hours
# under the secret ops path so it can be handed over, then the agent deletes it.
if ! grep -q '^ADMIN_INITIAL_PASSWORD=' "$ENV"; then
  pw="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
  echo "ADMIN_INITIAL_PASSWORD=$pw" >> "$ENV"
  printf 'admin email: %s\ninitial password: %s\n' "$(grep '^ADMIN_EMAIL=' ./site.env | cut -d= -f2)" "$pw" > /opt/parley/www/admin-initial.txt
  chmod 644 /opt/parley/www/admin-initial.txt
fi
grep -v -e '^SITE_HOST=' -e '^ADMIN_EMAIL=' "$ENV" > "$ENV.tmp" && { echo "SITE_HOST=$SITE_HOST"; grep '^ADMIN_EMAIL=' ./site.env; } >> "$ENV.tmp" && mv "$ENV.tmp" "$ENV" && chmod 600 "$ENV"
# Keep the host Caddy routes in step with the release (adds /admin); the ops token stays as provisioned.
OPS_TOKEN="$(grep -o '/_ops/[0-9a-f]*' /etc/caddy/Caddyfile | head -1 | cut -d/ -f3)"
if [ -n "$OPS_TOKEN" ]; then
  sed -e "s/{SITE}/$SITE_HOST/" -e "s/{OPS_TOKEN}/$OPS_TOKEN/" ./Caddyfile.tmpl > /etc/caddy/Caddyfile.new
  if ! cmp -s /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile; then mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile && systemctl reload caddy; else rm -f /etc/caddy/Caddyfile.new; fi
fi
export DOCKER_BUILDKIT=1
docker compose -p parley --env-file "$ENV" build
docker compose -p parley --env-file "$ENV" up -d --remove-orphans
docker image prune -f >/dev/null
docker builder prune -f --filter until=48h >/dev/null 2>&1 || true   # keep build cache from filling the disk
echo "deployed $SITE_HOST"
