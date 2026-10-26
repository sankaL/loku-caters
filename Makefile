# ============================================================================
# Loku Caters -- Development Makefile (frontend-only)
# ============================================================================

.PHONY: sync-config check-config dev build test help

LOCAL_FRONTEND_PORT = 3000

# Pull Resend credentials from the root .env so local submissions go through
# Resend's actual service (read-only, nothing is written back)
RESEND_API_KEY      ?= $(shell grep -m1 '^RESEND_API_KEY=' .env 2>/dev/null | cut -d= -f2-)
FROM_EMAIL          ?= $(shell grep -m1 '^FROM_EMAIL=' .env 2>/dev/null | cut -d= -f2-)
NOTIFICATION_EMAILS ?= $(shell grep -m1 '^NOTIFICATION_EMAILS=' .env 2>/dev/null | cut -d= -f2-)
REPLY_TO_EMAIL      ?= $(shell grep -m1 '^REPLY_TO_EMAIL=' .env 2>/dev/null | cut -d= -f2-)

FRONTEND_DEV_ENV = \
    NEXT_PUBLIC_SITE_URL="http://localhost:$(LOCAL_FRONTEND_PORT)" \
    RESEND_API_KEY="$(RESEND_API_KEY)" \
    FROM_EMAIL="$(FROM_EMAIL)" \
    NOTIFICATION_EMAILS="$(NOTIFICATION_EMAILS)" \
    REPLY_TO_EMAIL="$(REPLY_TO_EMAIL)"

## Copy config/*.json into the frontend
sync-config:
	cp config/event-config.json frontend/src/config/event-config.json
	cp config/reviews.json frontend/src/config/reviews.json
	@echo "Config synced to frontend/src/config/"

## Fail if the frontend config copies are out of date
check-config:
	./scripts/check-config-sync.sh

## Run the Next.js dev server (real Resend when .env has credentials)
dev: sync-config
	cd frontend && $(FRONTEND_DEV_ENV) npm run dev -- --port $(LOCAL_FRONTEND_PORT)

## Production build
build: sync-config
	cd frontend && npm run build

## Run frontend unit tests
test:
	cd frontend && npm test

## Show available targets
help:
	@grep -B1 -E '^[a-z-]+:' Makefile | grep -E '^## ' | sed 's/## /  /'
