# ============================================================================
# Loku Caters -- Development Makefile
# ============================================================================

.PHONY: sync-config restart-backend sync-and-restart dev \
        dev-local dev-backend dev-frontend \
        docker-ready db-up db-down db-migrate db-seed db-seed-if-empty db-reset test-backend quality-backend audit-backend \
        stop stop-backend-port stop-frontend-port logs-backend help

# ----------------------------------------------------------------------------
# Local dev database (Docker, port 5433 to avoid conflicts with system Postgres)
# ----------------------------------------------------------------------------
LOCAL_DB_PORT  = 5433
LOCAL_DB_NAME  = lokucaters_dev
LOCAL_DB_USER  = postgres
LOCAL_DB_PASS  = postgres
LOCAL_DB_URL   = postgresql://$(LOCAL_DB_USER):$(LOCAL_DB_PASS)@localhost:$(LOCAL_DB_PORT)/$(LOCAL_DB_NAME)
LOCAL_BACKEND_PORT = 8001
LOCAL_FRONTEND_PORT = 3000

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
    RESEND_API_KEY="$(RESEND_API_KEY)" \
    FROM_EMAIL="$(FROM_EMAIL)" \
    REPLY_TO_EMAIL="$(REPLY_TO_EMAIL)" \
    FRONTEND_URL="http://localhost:$(LOCAL_FRONTEND_PORT)" \
    EMAIL_ENABLED=true

FRONTEND_DEV_ENV = \
    NEXT_PUBLIC_API_URL="http://127.0.0.1:$(LOCAL_BACKEND_PORT)" \
    NEXT_PUBLIC_SITE_URL="http://localhost:$(LOCAL_FRONTEND_PORT)" \
    NEXT_PUBLIC_DEV_MODE=true

# ============================================================================
# Config sync (shared)
# ============================================================================

## Sync event-config.json from config/ to frontend and backend copies
sync-config:
	cp config/event-config.json frontend/src/config/event-config.json
	cp config/event-config.json backend/event-config.json
	cp config/event-images.json frontend/src/config/event-images.json
	cp config/event-images.json backend/event-images.json
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

## Start both services with local DB (local Postgres + backend + frontend)
dev: sync-config db-up db-migrate db-seed-if-empty
	@echo ""
	@$(MAKE) stop-backend-port
	@echo "  Starting backend (local DB, DEV_MODE=true)..."
	@echo "  Backend logs: /tmp/loku-backend.log"
	@echo "  Admin auth: disabled for local development"
	@echo ""
	@(cd backend; $(BACKEND_DEV_ENV) python3 -m uvicorn main:app \
	    --reload --host 127.0.0.1 --port $(LOCAL_BACKEND_PORT) > /tmp/loku-backend.log 2>&1 \
	    & echo $$! > /tmp/loku-backend.pid)
	@attempts=0; until curl -fsS http://127.0.0.1:$(LOCAL_BACKEND_PORT)/api/health >/dev/null 2>&1; do \
		attempts=$$((attempts + 1)); \
		if [ $$attempts -ge 20 ]; then echo "Backend failed to start. See /tmp/loku-backend.log"; exit 1; fi; \
		sleep 1; \
	done
	@$(MAKE) stop-frontend-port
	@echo "  Backend ready on http://127.0.0.1:$(LOCAL_BACKEND_PORT)"
	@echo "  Starting frontend on http://localhost:$(LOCAL_FRONTEND_PORT) ..."
	cd frontend && $(FRONTEND_DEV_ENV) npm run dev -- --port $(LOCAL_FRONTEND_PORT)

# ============================================================================
# Local dev (local Postgres container, DEV_MODE=true, real Resend)
# ============================================================================

## Full local stack: local Postgres + backend (local DB) + frontend
##   Backend logs go to /tmp/loku-backend.log
##   Frontend runs in the foreground (Ctrl-C stops everything; run 'make stop' for cleanup)
dev-local: sync-config db-up db-migrate db-seed
	@echo ""
	@$(MAKE) stop-backend-port
	@echo "  Starting backend (local DB, DEV_MODE=true)..."
	@echo "  Backend logs: /tmp/loku-backend.log"
	@echo "  Admin auth: disabled for local development"
	@echo ""
	@(cd backend; $(BACKEND_DEV_ENV) python3 -m uvicorn main:app \
	    --reload --host 127.0.0.1 --port $(LOCAL_BACKEND_PORT) > /tmp/loku-backend.log 2>&1 \
	    & echo $$! > /tmp/loku-backend.pid)
	@attempts=0; until curl -fsS http://127.0.0.1:$(LOCAL_BACKEND_PORT)/api/health >/dev/null 2>&1; do \
		attempts=$$((attempts + 1)); \
		if [ $$attempts -ge 20 ]; then echo "Backend failed to start. See /tmp/loku-backend.log"; exit 1; fi; \
		sleep 1; \
	done
	@$(MAKE) stop-frontend-port
	@echo "  Backend ready on http://127.0.0.1:$(LOCAL_BACKEND_PORT)"
	@echo "  Starting frontend on http://localhost:$(LOCAL_FRONTEND_PORT) ..."
	cd frontend && $(FRONTEND_DEV_ENV) npm run dev -- --port $(LOCAL_FRONTEND_PORT)

## Start just the backend with local DB settings (foreground, with reload)
dev-backend: sync-config stop-backend-port
	@cd backend && $(BACKEND_DEV_ENV) python3 -m uvicorn main:app --reload --host 127.0.0.1 --port $(LOCAL_BACKEND_PORT)

## Start just the frontend
dev-frontend: stop-frontend-port
	cd frontend && $(FRONTEND_DEV_ENV) npm run dev -- --port $(LOCAL_FRONTEND_PORT)

# ============================================================================
# Database (local Docker Postgres)
# ============================================================================

## Start the local Postgres container (port 5433)
docker-ready:
	@if ! docker info >/dev/null 2>&1; then \
		if [ "$$(uname -s)" = "Darwin" ]; then \
			echo "Docker is not running. Starting Docker Desktop..."; \
			open -a Docker; \
			attempts=0; \
			until docker info >/dev/null 2>&1; do \
				attempts=$$((attempts + 1)); \
				if [ $$attempts -ge 60 ]; then \
					echo "Docker Desktop did not become ready within 60 seconds."; \
					exit 1; \
				fi; \
				printf '.'; sleep 1; \
			done; \
			echo " ready."; \
		else \
			echo "Docker is required. Start the Docker daemon and run make dev again."; \
			exit 1; \
		fi; \
	fi

db-up: docker-ready
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
	@cd backend && $(BACKEND_DEV_ENV) python3 -m alembic upgrade head

## Seed the local DB with comprehensive test data (removes existing orders first)
db-seed:
	@cd backend && $(BACKEND_DEV_ENV) python3 seed_comprehensive.py

## Seed the local DB with comprehensive test data only if it is empty
db-seed-if-empty:
	@cd backend && $(BACKEND_DEV_ENV) python3 seed_comprehensive.py --only-if-empty

## Drop all tables, re-run migrations, and seed fresh test data
db-reset: db-up
	@echo "Resetting schema..."
	@docker compose -f docker-compose.dev.yml exec -T db \
	    psql -U $(LOCAL_DB_USER) -d $(LOCAL_DB_NAME) \
	    -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null || true
	@$(MAKE) db-migrate
	@$(MAKE) db-seed
	@echo "Database reset and seeded."

## Run backend tests against the migrated local database
test-backend: sync-config db-up db-migrate
	@cd backend && $(BACKEND_DEV_ENV) python3 -m pytest -q

## Run backend lint, bytecode compilation, and unit tests
quality-backend:
	@cd backend && python3 -m ruff check .
	@cd backend && python3 -m ruff format --check .
	@cd backend && python3 -m compileall -q .
	@cd backend && python3 -m pytest -q

## Scan production backend code and Python dependencies for security issues
audit-backend:
	@cd backend && python3 -m bandit -q -r . \
		-x ./tests,./alembic,./seed.py,./seed_dev.py,./seed_comprehensive.py,./backfill_customers.py
	@cd backend && python3 -m pip_audit -r requirements.txt

# ============================================================================
# Process management
# ============================================================================

## Stop the background backend process started by dev-local
stop:
	@$(MAKE) stop-backend-port
	@$(MAKE) stop-frontend-port
	@echo "Done."

stop-backend-port:
	@if [ -f /tmp/loku-backend.pid ]; then \
	    kill $$(cat /tmp/loku-backend.pid) 2>/dev/null && echo "Backend stopped." || true; \
	    rm -f /tmp/loku-backend.pid; \
	fi
	@-lsof -tiTCP:$(LOCAL_BACKEND_PORT) -sTCP:LISTEN | xargs kill -9 2>/dev/null || true

stop-frontend-port:
	@-lsof -tiTCP:$(LOCAL_FRONTEND_PORT) -sTCP:LISTEN | xargs kill 2>/dev/null || true

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
	@echo "    make dev             Start seeded local Postgres + backend + frontend"
	@echo "    make dev-local       Reset seed data, then start the same local stack"
	@echo "    make dev-backend     Backend only (local DB, foreground)"
	@echo "    make dev-frontend    Frontend only"
	@echo "    make stop            Stop frontend and backend processes"
	@echo "    make logs-backend    Tail backend log"
	@echo ""
	@echo "  DATABASE:"
	@echo "    make db-up           Start local Postgres container (port 5433)"
	@echo "    make db-down         Stop local Postgres container"
	@echo "    make db-migrate      Run Alembic migrations on local DB"
	@echo "    make db-seed         Insert comprehensive test data (clears existing first)"
	@echo "    make db-reset        Drop schema + migrate + seed (full wipe)"
	@echo "    make test-backend    Run backend tests against the local database"
	@echo "    make quality-backend Run backend lint, compile, and unit-test checks"
	@echo "    make audit-backend   Run backend code and dependency security scans"
	@echo ""
	@echo "  CONFIG:"
	@echo "    make sync-config     Copy config/event-config.json to frontend and backend"
	@echo ""
	@echo "  PRODUCTION-STYLE DEV (uses backend/.env + your real Supabase DB):"
	@echo "    make restart-backend Kill port 8000 and relaunch"
	@echo "    make sync-and-restart  sync-config + restart-backend"
	@echo ""
	@echo "  Admin authentication is disabled only when DEV_MODE=true."
	@echo ""
