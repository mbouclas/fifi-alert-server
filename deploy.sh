#!/usr/bin/env bash
# Production deploy for fifi-alert-server. Docker only: the API, Postgres and
# Redis all run as containers from docker-compose.prod.yml.
#
#   1. git pull --ff-only   (aborts on local changes or a diverged branch)
#   2. docker-compose up -d --build
#        - rebuilds the API image from the pulled commit
#        - (re)creates only the containers whose image or config changed
#        - the API container applies pending Prisma migrations on start
#   3. waits for the API healthcheck, then prints the boot lines ops look for
#
# Run on the host from the repo directory, or stream it:
#   ./deploy.sh                 full deploy
#   ./deploy.sh --no-pull       rebuild/redeploy the checked-out commit (e.g. after editing .env)
#   ssh host 'cd ~/sites/fifi-alert/fifi-alert-server && bash -s' < deploy.sh
#
# Host facts this relies on: legacy `docker-compose` 1.26 (no `docker compose`
# plugin), compose project `fifi-alert`, nginx proxying app.fifi-alert.com to
# 127.0.0.1:3113, and a gitignored .env in this directory (POSTGRES_PASSWORD,
# REDIS_PASSWORD, JWT_*, RP_*, ... see .env.example).
set -euo pipefail

# When run as a file, work from the repo directory it lives in. When streamed
# over stdin BASH_SOURCE is unset and the caller's cwd must be the repo.
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  cd "$(dirname "${BASH_SOURCE[0]}")"
fi
[ -f docker-compose.prod.yml ] || { echo "ERROR: run from the fifi-alert-server repo directory" >&2; exit 1; }

PULL=1
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    -h|--help) sed -n '2,20p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

COMPOSE_FILE="docker-compose.prod.yml"
COMPOSE_PROJECT="fifi-alert"
API_CONTAINER="fifi-alert-api"
API_PORT="3113"
HEALTH_URL="http://127.0.0.1:${API_PORT}/api/openapi.json"

compose() { docker-compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"; }
log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

for bin in git docker docker-compose curl; do
  command -v "$bin" >/dev/null 2>&1 || fail "'$bin' not found on PATH"
done
[ -f .env ] || fail ".env is missing in $(pwd); compose reads POSTGRES_PASSWORD / REDIS_PASSWORD and the API reads everything else from it"
grep -qE '^POSTGRES_PASSWORD=.+' .env || fail "POSTGRES_PASSWORD is not set in .env"
grep -qE '^REDIS_PASSWORD=.+' .env   || fail "REDIS_PASSWORD is not set in .env"

# ------------------------------------------------------------------ 1. git
if [ "$PULL" -eq 1 ]; then
  log "git pull"
  # src/generated/prisma is committed but was also rewritten in place by the
  # old pm2-era deploys (`prisma generate` on the host). Treat it as a build
  # artifact: reset it before judging the tree dirty. Inside the image it is
  # regenerated anyway.
  git checkout -q -- src/generated/prisma 2>/dev/null || true
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    git status --short --untracked-files=no
    fail "working tree has local changes; commit, stash or revert them first"
  fi
  BEFORE="$(git rev-parse HEAD)"
  git pull --ff-only
  AFTER="$(git rev-parse HEAD)"
  if [ "$BEFORE" = "$AFTER" ]; then
    echo "already at $(git rev-parse --short HEAD); nothing new"
  else
    echo "updated $(git rev-parse --short "$BEFORE") -> $(git rev-parse --short "$AFTER")"
    git --no-pager log --oneline "$BEFORE..$AFTER" | sed 's/^/   /'
  fi
else
  log "skipping git pull (--no-pull); deploying $(git rev-parse --short HEAD)"
fi

# ------------------------------------------- 1b. one-time pm2 retirement
# Until 2026-10-17 the API ran on the host under pm2 and owned port 3113. If
# that process still exists the container cannot bind the port. Remove it once.
if command -v pm2 >/dev/null 2>&1 || [ -x "$HOME/.nvm/versions/node/v22.22.1/bin/pm2" ]; then
  export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH"
  if pm2 describe fifi-alert-server >/dev/null 2>&1; then
    log "retiring the pm2-managed API (one-time): pm2 delete fifi-alert-server"
    pm2 delete fifi-alert-server
    pm2 save >/dev/null 2>&1 || true
  fi
fi
if ss -ltn 2>/dev/null | grep -q ":${API_PORT} " && ! docker ps --format '{{.Names}}' | grep -qx "$API_CONTAINER"; then
  ss -ltnp 2>/dev/null | grep ":${API_PORT} " >&2 || true
  fail "something other than the $API_CONTAINER container is listening on port $API_PORT"
fi

# ------------------------------------------------------------ 2. compose
log "docker-compose up -d --build ($COMPOSE_FILE, project $COMPOSE_PROJECT)"
# No --remove-orphans: fifi-alert-web belongs to a different compose project
# but shares the naming prefix; keep this command scoped to this file only.
compose up -d --build

# ------------------------------------------------------------- 3. health
# compose 1.26 has no `up --wait`; poll the healthchecks defined in the file.
wait_healthy() {
  local container="$1" tries="$2" status
  while [ "$tries" -gt 0 ]; do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || echo missing)"
    case "$status" in
      healthy|running) echo "   $container: $status"; return 0 ;;
      missing) fail "container $container not found" ;;
      exited|dead)
        docker logs --tail 40 "$container" >&2 || true
        fail "$container exited (see log above)" ;;
    esac
    sleep 3; tries=$((tries - 1))
  done
  docker logs --tail 40 "$container" >&2 || true
  fail "$container did not become healthy in time"
}
log "waiting for containers"
wait_healthy fifi-alert-postgres 20
wait_healthy fifi-alert-redis 20
wait_healthy "$API_CONTAINER" 60      # start_period 60s + migrations

curl -fsS -o /dev/null "$HEALTH_URL" || fail "API healthcheck passed but $HEALTH_URL does not answer from the host"
echo "   API answers on $HEALTH_URL"

# Surface the boot lines ops most often need to see.
docker logs --tail 300 "$API_CONTAINER" 2>&1 \
  | grep -E 'Passkeys (enabled|disabled)|Social providers enabled|migration(s)? (applied|found)|No pending migrations' \
  | tail -4 | cut -c1-200 | sed 's/^/   /' || true

# Drop dangling images left behind by the rebuild.
docker image prune -f >/dev/null 2>&1 || true

log "deployed $(git rev-parse --short HEAD) at $(date -Is)"
compose ps
