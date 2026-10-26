#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

check_copy() {
  local name="$1"
  local source="$ROOT_DIR/config/$name"
  local target="$ROOT_DIR/frontend/src/config/$name"

  if cmp -s "$source" "$target"; then
    return
  fi

  echo "Config sync check failed: frontend/src/config/$name does not match config/$name"
  echo "Run:"
  echo "  cp config/$name frontend/src/config/$name"
  echo
  diff -u "$source" "$target" || true
  exit 1
}

check_copy event-config.json
check_copy reviews.json

echo "Config sync check passed."
