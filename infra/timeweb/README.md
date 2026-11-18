# parley on one Timeweb Cloud server (test mode)

A single Ubuntu server runs Postgres, Redis, the API, the worker and the website with Docker Compose.
Caddy on the host terminates HTTPS (Let's Encrypt) on one origin, so cookies and the live-update socket
work. **Test mode only**: `PROVIDER_MODE=mock`, so no real custody, KYC or payment provider is connected
and no real money can move. Test funds come from Wallet → "Get test funds".

## How deploys work (no SSH needed)

1. `cloud-init.sh.tmpl` (filled in by `provision.py`) bootstraps the server: swap, Docker, Caddy,
   `s3cmd`, and `agent.sh` as a systemd timer that runs every minute.
2. A release is `git archive` of the repo, uploaded to the private bucket as
   `releases/<id>.tar.gz`, and `latest.txt` is set to `<id>`.
3. The agent sees the new id, downloads and extracts it, runs `infra/timeweb/deploy.sh`
   (build images, migrate + seed, `docker compose up -d`), and keeps the last 3 releases.
4. It writes a status report (container state, recent logs, memory, disk) that Caddy serves at
   `https://<site>/_ops/<ops-token>/status.txt`. The token is random and kept out of the repository.

Secrets (database password, data-encryption key, webhook secret) are generated on the server on first
deploy, in `/opt/parley/.env` (mode 600), and never leave it.

## Address

Until a domain is connected the site is `https://<ip-with-dashes>.sslip.io`. To use a domain, point its
A record at the server IP, write the domain to `/opt/parley/SITE_HOST`, update `/etc/caddy/Caddyfile`
and restart Caddy, then deploy a new release (the web build embeds the address).
