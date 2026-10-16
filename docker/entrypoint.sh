#!/usr/bin/env bash
# Container entrypoint: apply pending migrations, then exec the API.
#
# docker-compose 1.26 (the version on the production host) ignores
# `depends_on: condition: service_healthy` in v3 files, so Postgres may still
# be starting when this runs. `prisma migrate deploy` fails fast on a refused
# connection; retry it for up to ~2 minutes before giving up.
set -euo pipefail

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  tries=40
  until bunx prisma migrate deploy; do
    tries=$((tries - 1))
    if [ "$tries" -le 0 ]; then
      echo "entrypoint: prisma migrate deploy kept failing; giving up" >&2
      exit 1
    fi
    echo "entrypoint: database not ready, retrying in 3s ($tries left)" >&2
    sleep 3
  done
fi

exec "$@"
