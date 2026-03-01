#!/usr/bin/env sh
set -e

skip_migrations="${SKIP_MIGRATIONS:-false}"

if [ "$skip_migrations" = "true" ]; then
  echo "[startup] Skipping database migrations (SKIP_MIGRATIONS=$skip_migrations)"
else
  echo "[startup] Running database migrations"
  python3 -m alembic upgrade head
fi

echo "[startup] Starting email worker"
python3 -m workers.email_worker

