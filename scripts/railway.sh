#!/usr/bin/env sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

if [ -f "$repo_root/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$repo_root/.env"
  set +a
fi

exec npx -y @railway/cli "$@"
