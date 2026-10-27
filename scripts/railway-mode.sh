#!/usr/bin/env bash
# Switch Railway production between the two versions of the site.
#
#   full    main branch: frontend + FastAPI backend + admin portal
#   lite    frontend-only branch: static frontend, Resend emails, backend stopped
#   status  show what each service is running
#
# Deploys the latest commit of the branch on origin, so it works from any
# checkout. Requires the Railway CLI, logged in with access to loku-caters-v2.
#
# Usage: scripts/railway-mode.sh full|lite|status [-y]

set -euo pipefail

PROJECT_ID="${RAILWAY_PROJECT_ID:-3c78fd3c-22a0-4aa0-ae7b-48403400c658}"
ENVIRONMENT_ID="${RAILWAY_ENVIRONMENT_ID:-55a75bac-6b05-4b50-a853-d49e4d9e34c6}"
FRONTEND_ID="40c95119-8e52-40b5-b124-f64e1ebc3448"
BACKEND_ID="d9c8e4f0-d550-4254-aaac-ac1b52de8197"
FULL_BRANCH="main"
LITE_BRANCH="frontend-only"
DEPLOY_TIMEOUT_SECONDS=1200

MODE="${1:-}"
ASSUME_YES="${2:-}"

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

gql() {
  railway api "$1"
}

json_field() {
  python3 -c "import json,sys; data=json.load(sys.stdin); print(eval(sys.argv[1], {'d': data}))" "$1"
}

remote_sha() {
  git fetch --quiet origin "$1"
  git rev-parse "origin/$1"
}

update_frontend() {
  local config_file="$1" sleep="$2"
  gql "mutation{ serviceInstanceUpdate(serviceId:\"$FRONTEND_ID\", environmentId:\"$ENVIRONMENT_ID\", input:{ railwayConfigFile:\"$config_file\", sleepApplication:$sleep }) }" >/dev/null
}

deploy() {
  local service_id="$1" sha="$2"
  gql "mutation{ serviceInstanceDeployV2(serviceId:\"$service_id\", environmentId:\"$ENVIRONMENT_ID\", commitSha:\"$sha\") }" \
    | json_field "d['data']['serviceInstanceDeployV2']"
}

deployment_status() {
  gql "query{ deployment(id:\"$1\"){ status } }" | json_field "d['data']['deployment']['status']"
}

wait_for() {
  local label="$1" deployment_id="$2" waited=0 status
  while :; do
    status="$(deployment_status "$deployment_id")"
    case "$status" in
      SUCCESS) echo "  $label: SUCCESS"; return 0 ;;
      FAILED|CRASHED|REMOVED)
        echo "  $label: $status (railway logs --service $label --build $deployment_id)"
        return 1 ;;
    esac
    if [ "$waited" -ge "$DEPLOY_TIMEOUT_SECONDS" ]; then
      echo "  $label: still $status after ${DEPLOY_TIMEOUT_SECONDS}s, check the Railway dashboard"
      return 1
    fi
    sleep 15
    waited=$((waited + 15))
  done
}

confirm() {
  [ "$ASSUME_YES" = "-y" ] && return 0
  read -r -p "$1 [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || { echo "Cancelled."; exit 1; }
}

show_status() {
  local service_id
  for service_id in "$FRONTEND_ID" "$BACKEND_ID"; do
    gql "query{ serviceInstance(serviceId:\"$service_id\", environmentId:\"$ENVIRONMENT_ID\"){ serviceName sleepApplication latestDeployment{ status meta } } }" \
      | python3 -c "
import json, sys
instance = json.load(sys.stdin)['data']['serviceInstance']
deployment = instance.get('latestDeployment') or {}
meta = deployment.get('meta') or {}
commit = (meta.get('commitHash') or '')[:7] or '-'
print(f\"  {instance['serviceName']:<22} {deployment.get('status', 'NONE'):<10} commit {commit}  sleep={instance['sleepApplication']}\")
"
  done
  echo "  (backend REMOVED/FAILED with no commit means it is stopped, which is expected in lite mode)"
}

case "$MODE" in
  full)
    sha="$(remote_sha "$FULL_BRANCH")"
    echo "Full mode: deploy $FULL_BRANCH ${sha:0:7} to backend and frontend, frontend sleep off."
    confirm "Continue?"
    backend_deployment="$(deploy "$BACKEND_ID" "$sha")"
    update_frontend "" false
    frontend_deployment="$(deploy "$FRONTEND_ID" "$sha")"
    echo "Waiting for deploys..."
    wait_for loku-caters-backend "$backend_deployment"
    wait_for loku-caters-frontend "$frontend_deployment"
    echo "Done. Admin: https://www.lokucaters.com/admin"
    ;;
  lite)
    sha="$(remote_sha "$LITE_BRANCH")"
    echo "Lite mode: deploy $LITE_BRANCH ${sha:0:7} to frontend (sleep on), then stop the backend."
    confirm "Continue?"
    update_frontend "/frontend/railway.json" true
    frontend_deployment="$(deploy "$FRONTEND_ID" "$sha")"
    echo "Waiting for frontend deploy..."
    wait_for loku-caters-frontend "$frontend_deployment"
    railway down --project "$PROJECT_ID" --environment "$ENVIRONMENT_ID" --service loku-caters-backend --yes
    echo "Done. Backend stopped; its settings and variables are kept for the next full deploy."
    ;;
  status)
    show_status
    ;;
  *)
    usage
    ;;
esac
