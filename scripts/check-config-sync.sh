#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT_DIR/config/event-config.json"
FRONTEND_COPY="$ROOT_DIR/frontend/src/config/event-config.json"
BACKEND_COPY="$ROOT_DIR/backend/event-config.json"

check_copy() {
  local target="$1"
  local label="$2"

  if cmp -s "$SOURCE" "$target"; then
    return
  fi

  echo "Config sync check failed: $label does not match config/event-config.json"
  echo "Run:"
  echo "  cp config/event-config.json frontend/src/config/event-config.json"
  echo "  cp config/event-config.json backend/event-config.json"
  echo
  diff -u "$SOURCE" "$target" || true
  exit 1
}

check_copy "$FRONTEND_COPY" "frontend/src/config/event-config.json"
check_copy "$BACKEND_COPY" "backend/event-config.json"

echo "Config sync check passed."
