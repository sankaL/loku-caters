# ============================================================================
# Loku Caters -- Development Makefile
# ============================================================================

.PHONY: sync-config restart-backend sync-and-restart dev \
        dev-local dev-backend dev-frontend \
        db-up db-down db-migrate db-seed db-reset \
        stop logs-backend help

# ----------------------------------------------------------------------------
# Local dev database (Docker, port 5433 to avoid conflicts with system Postgres)
# ----------------------------------------------------------------------------
LOCAL_DB_PORT  = 5433
LOCAL_DB_NAME  = lokucaters_dev
LOCAL_DB_USER  = postgres
LOCAL_DB_PASS  = postgres
LOCAL_DB_URL   = postgresql://$(LOCAL_DB_USER):$(LOCAL_DB_PASS)@localhost:$(LOCAL_DB_PORT)/$(LOCAL_DB_NAME)

# A stable secret used only for local dev JWT signing (not a real Supabase secret)
LOCAL_JWT_SECRET = dev-secret-loku-caters-local-2026

# Pull real Resend credentials from the root .env so emails still go through
# Resend's actual service (read-only, nothing is written back)
RESEND_API_KEY  ?= $(shell grep -m1 '^RESEND_API_KEY=' .env 2>/dev/null | cut -d= -f2-)
FROM_EMAIL      ?= $(shell grep -m1 '^FROM_EMAIL=' .env 2>/dev/null | cut -d= -f2-)
REPLY_TO_EMAIL  ?= $(shell grep -m1 '^REPLY_TO_EMAIL=' .env 2>/dev/null | cut -d= -f2-)

# Environment block injected into every local-dev backend invocation.
# These vars override whatever is in backend/.env because OS env takes priority
# over pydantic-settings dotenv files.
BACKEND_DEV_ENV = \
    DATABASE_URL="$(LOCAL_DB_URL)" \
    DEV_MODE=true \
    SUPABASE_JWT_SECRET="$(LOCAL_JWT_SECRET)" \
    RESEND_API_KEY="$(RESEND_API_KEY)" \
    FROM_EMAIL="$(FROM_EMAIL)" \
    REPLY_TO_EMAIL="$(REPLY_TO_EMAIL)" \
    FRONTEND_URL="http://localhost:3000" \
    EMAIL_ENABLED=true

# ============================================================================
# Config sync (shared)
# ============================================================================

## Sync event-config.json from config/ to frontend and backend copies
sync-config:
	cp config/event-config.json frontend/src/config/event-config.json
	cp config/event-config.json backend/event-config.json
	@echo "Config synced to frontend/src/config/ and backend/"

# ============================================================================
# Production-style dev (uses backend/.env directly, your real Supabase DB)
# ============================================================================

## Restart the backend with production .env (kills port 8000, relaunches)
restart-backend:
	-lsof -ti :8000 | xargs kill -9 2>/dev/null
	sleep 1
	cd backend && python3 -m uvicorn main:app --reload --port 8000 &
	@echo "Backend restarting on http://localhost:8000"

## Sync config then restart backend (production .env)
sync-and-restart: sync-config restart-backend

## Start both services with production .env (background backend, foreground frontend)
dev:
	@echo "Starting backend on :8000 ..."
	cd backend && python3 -m uvicorn main:app --reload --port 8000 &
	@echo "Starting frontend on :3000 ..."
	cd frontend && npm run dev

# ============================================================================
# Local dev (local Postgres container, DEV_MODE=true, real Resend)
# ============================================================================

## Full local stack: local Postgres + backend (local DB) + frontend
##   Backend logs go to /tmp/loku-backend.log
##   Frontend runs in the foreground (Ctrl-C stops everything; run 'make stop' for cleanup)
dev-local: sync-config db-up db-migrate
	@echo ""
	@echo "  Starting backend (local DB, DEV_MODE=true)..."
	@echo "  Backend logs: /tmp/loku-backend.log"
	@echo "  Admin dev login: POST http://localhost:8000/api/admin/dev-login"
	@echo ""
	@(cd backend && $(BACKEND_DEV_ENV) python3 -m uvicorn main:app \
	    --reload --port 8000 > /tmp/loku-backend.log 2>&1 \
	    & echo $$! > /tmp/loku-backend.pid)
	@sleep 1
	@echo "  Starting frontend on http://localhost:3000 ..."
	cd frontend && npm run dev

## Start just the backend with local DB settings (foreground, with reload)
dev-backend: sync-config
	cd backend && $(BACKEND_DEV_ENV) python3 -m uvicorn main:app --reload --port 8000

## Start just the frontend
dev-frontend:
	cd frontend && npm run dev

# ============================================================================
# Database (local Docker Postgres)
# ============================================================================

## Start the local Postgres container (port 5433)
db-up:
	@echo "Starting local PostgreSQL on port $(LOCAL_DB_PORT)..."
	docker compose -f docker-compose.dev.yml up -d db
	@echo "Waiting for Postgres to be ready..."
	@until docker compose -f docker-compose.dev.yml exec -T db \
	    pg_isready -U $(LOCAL_DB_USER) -q 2>/dev/null; do \
	    printf '.'; sleep 1; \
	done
	@echo " ready."

## Stop the local Postgres container (data is preserved in the Docker volume)
db-down:
	docker compose -f docker-compose.dev.yml down

## Run Alembic migrations against the local DB
db-migrate: sync-config
	cd backend && $(BACKEND_DEV_ENV) python3 -m alembic upgrade head

## Seed the local DB with test orders (removes existing orders first)
db-seed:
	cd backend && $(BACKEND_DEV_ENV) python3 seed.py

## Drop all tables, re-run migrations, and seed fresh test data
db-reset: db-up
	@echo "Resetting schema..."
	@docker compose -f docker-compose.dev.yml exec -T db \
	    psql -U $(LOCAL_DB_USER) -d $(LOCAL_DB_NAME) \
	    -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null || true
	@$(MAKE) db-migrate
	@$(MAKE) db-seed
	@echo "Database reset and seeded."

# ============================================================================
# Process management
# ============================================================================

## Stop the background backend process started by dev-local
stop:
	@if [ -f /tmp/loku-backend.pid ]; then \
	    kill $$(cat /tmp/loku-backend.pid) 2>/dev/null && echo "Backend stopped." || true; \
	    rm -f /tmp/loku-backend.pid; \
	fi
	@-lsof -ti :8000 | xargs kill -9 2>/dev/null || true
	@echo "Done."

## Tail live backend logs (when started via dev-local)
logs-backend:
	tail -f /tmp/loku-backend.log

# ============================================================================
# Help
# ============================================================================

help:
	@echo ""
	@echo "Loku Caters -- Makefile targets"
	@echo ""
	@echo "  LOCAL DEV (recommended for testing):"
	@echo "    make dev-local       Start local Postgres + backend + frontend"
	@echo "    make dev-backend     Backend only (local DB, foreground)"
	@echo "    make dev-frontend    Frontend only"
	@echo "    make stop            Kill background backend process"
	@echo "    make logs-backend    Tail backend log"
	@echo ""
	@echo "  DATABASE:"
	@echo "    make db-up           Start local Postgres container (port 5433)"
	@echo "    make db-down         Stop local Postgres container"
	@echo "    make db-migrate      Run Alembic migrations on local DB"
	@echo "    make db-seed         Insert test orders (clears existing first)"
	@echo "    make db-reset        Drop schema + migrate + seed (full wipe)"
	@echo ""
	@echo "  CONFIG:"
	@echo "    make sync-config     Copy config/event-config.json to frontend and backend"
	@echo ""
	@echo "  PRODUCTION-STYLE DEV (uses backend/.env + your real Supabase DB):"
	@echo "    make dev             Background backend + foreground frontend"
	@echo "    make restart-backend Kill port 8000 and relaunch"
	@echo "    make sync-and-restart  sync-config + restart-backend"
	@echo ""
	@echo "  Admin dev login (local only, DEV_MODE=true required):"
	@echo "    curl -s -X POST http://localhost:8000/api/admin/dev-login | jq .access_token"
	@echo ""
