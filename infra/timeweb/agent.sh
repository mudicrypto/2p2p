#!/usr/bin/env bash
# Pull-based deploy agent (installed by cloud-init, run every minute by a systemd timer).
# Fetches the deploy branch from GitHub with a read-only deploy key. When the branch moves, it exports
# that commit to /opt/parley/releases/<sha>, runs infra/timeweb/deploy.sh, and writes a status report
# that Caddy serves at https://<site>/_ops/<secret-token>/status.txt.
set -uo pipefail
ROOT=/opt/parley; WWW="$ROOT/www"; REPO="$ROOT/repo"; BRANCH="$(cat "$ROOT/BRANCH")"
mkdir -p "$ROOT/releases" "$WWW"; chmod 755 "$ROOT" "$WWW"
exec 9>"$ROOT/agent.lock"; flock -n 9 || exit 0
find "$WWW" -name admin-initial.txt -mmin +120 -delete 2>/dev/null   # hand-over window: 2 hours
export GIT_SSH_COMMAND="ssh -i /root/.ssh/parley_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
giterr="$(mktemp)"
if [ ! -d "$REPO/.git" ]; then
  git clone --quiet --no-checkout --filter=blob:none --branch "$BRANCH" "$(cat "$ROOT/REPO_URL")" "$REPO" 2>"$giterr" || rm -rf "$REPO"
else
  git -C "$REPO" fetch --quiet origin "$BRANCH" 2>"$giterr"
fi
latest="$(git -C "$REPO" rev-parse --short=12 "origin/$BRANCH" 2>/dev/null || true)"
current="$(cat "$ROOT/current" 2>/dev/null || true)"
if [ -n "$latest" ] && [ "$latest" != "$current" ]; then
  dir="$ROOT/releases/$latest"; log="$WWW/deploy-$latest.log"
  { rm -rf "$dir" && mkdir -p "$dir" \
    && git -C "$REPO" archive "origin/$BRANCH" | tar -x -C "$dir" \
    && bash "$dir/infra/timeweb/deploy.sh" && echo "$latest" > "$ROOT/current" && echo "DEPLOY OK $latest"; } > "$log" 2>&1 || echo "DEPLOY FAILED $latest" >> "$log"
  ls -1dt "$ROOT"/releases/*/ 2>/dev/null | tail -n +4 | xargs -r rm -rf   # keep the last 3 releases
elif [ -f "$ROOT/PENDING_HOST" ] && [ -n "$current" ] && [ -f "$ROOT/releases/$current/infra/timeweb/deploy.sh" ]; then
  # A new main domain is waiting for its DNS: re-run the deploy once it points here.
  want="$(cat "$ROOT/PENDING_HOST")"; me="$(getent ahostsv4 "$(cat "$ROOT/ORIG_HOST" 2>/dev/null)" | awk '{print $1}' | head -1)"
  if [ -n "$me" ] && getent ahostsv4 "$want" | awk '{print $1}' | grep -qx "$me"; then
    bash "$ROOT/releases/$current/infra/timeweb/deploy.sh" >> "$WWW/deploy-$current.log" 2>&1 && echo "DOMAIN SWITCH OK $want" >> "$WWW/deploy-$current.log"
  fi
fi
{
  date -u; echo "site: $(cat "$ROOT/SITE_HOST")  branch: $BRANCH  deployed: ${current:-none}  latest: ${latest:-?}"
  [ -s "$giterr" ] && { echo "git error:"; head -5 "$giterr"; }
  [ -n "$latest" ] && [ -f "$WWW/deploy-$latest.log" ] && { echo "== deploy log (tail)"; tail -n 30 "$WWW/deploy-$latest.log" | cut -c1-300; }
  echo; docker compose -p parley ps 2>&1; echo
  for s in api worker web migrate; do echo "== $s"; docker compose -p parley logs --tail 30 "$s" 2>&1 | cut -c1-400; done
  echo "== caddy"; journalctl -u caddy -n 15 --no-pager 2>&1 | cut -c1-300
  echo "== bootstrap (tail)"; tail -n 15 /var/log/parley-bootstrap.log 2>&1 | cut -c1-300
  echo; free -m; df -h / | tail -1
} > "$WWW/status.tmp" 2>&1 && mv "$WWW/status.tmp" "$WWW/status.txt"
rm -f "$giterr"; exit 0
