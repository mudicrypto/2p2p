# parley on one Timeweb Cloud server (test mode)

A single Ubuntu server runs Postgres, Redis, the API, the worker and the website with Docker Compose.
Caddy on the host terminates HTTPS (Let's Encrypt) on one origin, so cookies and the live-update socket
work. **Test mode only**: `PROVIDER_MODE=mock`, so no real custody, KYC or payment provider is connected
and no real money can move. Test funds come from Wallet → "Get test funds".

## How deploys work (no SSH into the server needed)

1. `cloud-init.sh.tmpl` (filled in at provisioning time) bootstraps the server: swap, Docker, Caddy, git,
   a **read-only GitHub deploy key** for this repository, and `agent.sh` as a systemd timer (every minute).
2. The agent fetches the deploy branch. When it moves, it exports that commit to
   `/opt/parley/releases/<sha>`, runs `infra/timeweb/deploy.sh` (build images, migrate + seed,
   `docker compose up -d`) and keeps the last 3 releases. Pushing to the branch is the deploy.
3. It writes a status report (deploy log, containers, recent logs, memory, disk) that Caddy serves at
   `https://<site>/_ops/<ops-token>/status.txt`. The token is random and kept out of the repository.

The deploy key's public half is added in GitHub → repository Settings → Deploy keys, **read-only**.

Secrets (database password, data-encryption key, webhook secret) are generated on the server on first
deploy, in `/opt/parley/.env` (mode 600), and never leave it.

## Address

Until a domain is connected the site is `https://<ip-with-dashes>.sslip.io`. To use a domain, point its
A record at the server IP, write the domain to `/opt/parley/SITE_HOST`, update `/etc/caddy/Caddyfile`
and restart Caddy, then deploy a new release (the web build embeds the address).
