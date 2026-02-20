#!/usr/bin/env sh
set -eu

echo "[startup] Running database migrations"
alembic upgrade head

echo "[startup] Starting API server"
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
