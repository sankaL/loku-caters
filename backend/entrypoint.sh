#!/usr/bin/env sh
set -eu

skip_migrations="${SKIP_MIGRATIONS:-false}"
case "$skip_migrations" in
  1|true|TRUE|yes|YES)
    echo "[startup] Skipping database migrations (SKIP_MIGRATIONS=$skip_migrations)"
    ;;
  *)
    echo "[startup] Running database migrations"
    python -m alembic upgrade head
    ;;
esac

echo "[startup] Starting API server"
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
