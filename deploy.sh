#!/usr/bin/env bash
# Production deploy for fifi-alert-server.
#
#   1. git pull (fast-forward only; aborts on local changes or a diverged branch)
#   2. docker-compose up -d        -> Postgres + Redis data stack (docker-compose.prod.yml)
#   3. bun install --frozen-lockfile (idempotent, always)
#   4. prisma migrate deploy       -> only pending migrations, never resets
#   5. prisma generate             -> keeps src/generated/prisma in sync with the schema
#   6. pm2 startOrReload           -> the API itself runs on the host under pm2
#   7. health probe on 127.0.0.1:3113
#
# Run on the host from the repo directory:
#   ./deploy.sh              full deploy
#   ./deploy.sh --no-pull    redeploy the checked-out commit (e.g. after editing .env)
#
# Assumptions baked in from the production host (see nginx/README.md):
#   - legacy `docker-compose` 1.26 only (no `docker compose` plugin)
#   - bun in ~/.bun/bin, node/pm2 under nvm; neither is on PATH in non-interactive shells
#   - compose project name `fifi-alert`, ports 127.0.0.1:5433 (pg) / 127.0.0.1:6382 (redis)
#   - .env (gitignored) in this directory holds DATABASE_URL, REDIS_*, POSTGRES_PASSWORD, RP_* ...
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

PULL=1
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

COMPOSE_FILE="docker-compose.prod.yml"
COMPOSE_PROJECT="fifi-alert"
PM2_CONFIG="ecosystem.prod.config.cjs"
PM2_APP="fifi-alert-server"
API_PORT="${PORT:-3113}"
HEALTH_URL="http://127.0.0.1:${API_PORT}/api/openapi.json"

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------------ PATH
# bun and pm2 are not on PATH for cron / ssh -c; add them explicitly.
export PATH="$HOME/.bun/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh" >/dev/null
  nvm use 22 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi
for bin in git docker-compose bun pm2 curl; do
  command -v "$bin" >/dev/null 2>&1 || fail "'$bin' not found on PATH"
done

[ -f .env ] || fail ".env is missing in $(pwd); the app and compose both read it"

# ------------------------------------------------------------------ 1. git
if [ "$PULL" -eq 1 ]; then
  log "git pull"
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
  BEFORE="$(git rev-parse HEAD)"
  AFTER="$BEFORE"
  log "skipping git pull (--no-pull); deploying $(git rev-parse --short HEAD)"
fi

# --------------------------------------------------------- 2. data stack
log "docker-compose up -d ($COMPOSE_FILE, project $COMPOSE_PROJECT)"
docker-compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d --remove-orphans

# compose 1.26 has no `up --wait`; poll the healthchecks defined in the file.
wait_healthy() {
  local container="$1" tries=30
  while [ $tries -gt 0 ]; do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || echo missing)"
    case "$status" in
      healthy|running) echo "   $container: $status"; return 0 ;;
      missing) fail "container $container not found" ;;
    esac
    sleep 2; tries=$((tries - 1))
  done
  docker logs --tail 30 "$container" >&2 || true
  fail "$container did not become healthy in 60s"
}
wait_healthy fifi-alert-postgres
wait_healthy fifi-alert-redis

# ------------------------------------------------------- 3. dependencies
# Always run it. It is idempotent and takes seconds when nothing changed, and
# "did the lockfile change in THIS pull" is the wrong question: the host may
# have pulled earlier by hand (as happened on 2026-10-16, when a dependency
# added two commits before this script existed was never installed).
log "bun install --frozen-lockfile"
bun install --frozen-lockfile

# ------------------------------------------------- 4/5. database schema
log "prisma migrate deploy"
bunx prisma migrate deploy
log "prisma generate"
bunx prisma generate >/dev/null
echo "   generated client is in sync with prisma/schema.prisma"

# ------------------------------------------------------------- 6. pm2
log "pm2 startOrReload $PM2_CONFIG"
# Guard against the stray-duplicate failure mode seen on 2026-10-07: another
# pm2 app pointing at this repo's src/main.ts would fight for port 3113.
DUPES="$(pm2 jlist 2>/dev/null \
  | bun -e 'const apps = JSON.parse(await Bun.stdin.text()); const here = process.cwd(); for (const a of apps) { if (a.name !== process.argv[1] && a.pm2_env?.pm_cwd === here) console.log(a.name); }' "$PM2_APP" \
  || true)"
if [ -n "$DUPES" ]; then
  fail "other pm2 apps run from this directory and would collide on port $API_PORT: $DUPES  (pm2 delete <name>, then rerun)"
fi
pm2 startOrReload "$PM2_CONFIG" --update-env
pm2 save >/dev/null

# ------------------------------------------------------------ 7. health
log "waiting for the API on $HEALTH_URL"
tries=30
until curl -fsS -o /dev/null "$HEALTH_URL"; do
  tries=$((tries - 1))
  if [ $tries -le 0 ]; then
    pm2 logs "$PM2_APP" --lines 40 --nostream >&2 || true
    fail "API did not answer on port $API_PORT within 60s"
  fi
  sleep 2
done
echo "   API is up"

# Surface the two boot lines ops most often need to see.
pm2 logs "$PM2_APP" --lines 200 --nostream 2>/dev/null \
  | grep -E 'Passkeys (enabled|disabled)|Social providers enabled' | tail -2 | sed 's/^/   /' || true

log "deployed $(git rev-parse --short HEAD) at $(date -Is)"
pm2 list | grep -E "^\s*│\s*[0-9]+\s*│\s*$PM2_APP" || pm2 describe "$PM2_APP" | head -5 || true
