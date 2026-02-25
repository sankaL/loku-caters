#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVENT_CONFIG_SOURCE="$ROOT_DIR/config/event-config.json"
EVENT_CONFIG_FRONTEND_COPY="$ROOT_DIR/frontend/src/config/event-config.json"
EVENT_CONFIG_BACKEND_COPY="$ROOT_DIR/backend/event-config.json"
EVENT_IMAGES_SOURCE="$ROOT_DIR/config/event-images.json"
EVENT_IMAGES_FRONTEND_COPY="$ROOT_DIR/frontend/src/config/event-images.json"
EVENT_IMAGES_BACKEND_COPY="$ROOT_DIR/backend/event-images.json"

check_copy() {
  local source="$1"
  local target="$2"
  local source_label="$3"
  local target_label="$4"
  local sync_commands="$5"

  if cmp -s "$source" "$target"; then
    return
  fi

  echo "Config sync check failed: $target_label does not match $source_label"
  echo "Run:"
  echo "$sync_commands"
  echo
  diff -u "$source" "$target" || true
  exit 1
}

check_group() {
  local source="$1"
  local front_copy="$2"
  local back_copy="$3"
  local source_label="$4"
  local front_label="$5"
  local back_label="$6"
  local sync_commands="$7"

  check_copy "$source" "$front_copy" "$source_label" "$front_label" "$sync_commands"
  check_copy "$source" "$back_copy" "$source_label" "$back_label" "$sync_commands"
}

EVENT_CONFIG_SYNC_COMMANDS=$'  cp config/event-config.json frontend/src/config/event-config.json\n  cp config/event-config.json backend/event-config.json'
EVENT_IMAGES_SYNC_COMMANDS=$'  cp config/event-images.json frontend/src/config/event-images.json\n  cp config/event-images.json backend/event-images.json'

check_group \
  "$EVENT_CONFIG_SOURCE" \
  "$EVENT_CONFIG_FRONTEND_COPY" \
  "$EVENT_CONFIG_BACKEND_COPY" \
  "config/event-config.json" \
  "frontend/src/config/event-config.json" \
  "backend/event-config.json" \
  "$EVENT_CONFIG_SYNC_COMMANDS"

check_group \
  "$EVENT_IMAGES_SOURCE" \
  "$EVENT_IMAGES_FRONTEND_COPY" \
  "$EVENT_IMAGES_BACKEND_COPY" \
  "config/event-images.json" \
  "frontend/src/config/event-images.json" \
  "backend/event-images.json" \
  "$EVENT_IMAGES_SYNC_COMMANDS"

echo "Config sync check passed."
