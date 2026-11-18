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
grep -v '^SITE_HOST=' "$ENV" > "$ENV.tmp" && echo "SITE_HOST=$SITE_HOST" >> "$ENV.tmp" && mv "$ENV.tmp" "$ENV" && chmod 600 "$ENV"
export DOCKER_BUILDKIT=1
docker compose -p parley --env-file "$ENV" build
docker compose -p parley --env-file "$ENV" up -d --remove-orphans
docker image prune -f >/dev/null
echo "deployed $SITE_HOST"
