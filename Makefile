.PHONY: sync-config restart-backend dev

## Sync event-config.json from config/ to frontend and backend copies
sync-config:
	cp config/event-config.json frontend/src/config/event-config.json
	cp config/event-config.json backend/event-config.json
	@echo "Config synced to frontend/src/config/ and backend/"

## Restart the backend (kills port 8000 and relaunches uvicorn)
restart-backend:
	-lsof -ti :8000 | xargs kill -9 2>/dev/null
	sleep 1
	cd backend && python3 -m uvicorn main:app --reload --port 8000 &
	@echo "Backend restarting on http://localhost:8000"

## Sync config + restart backend in one step
sync-and-restart: sync-config restart-backend

## Start both services for local dev (run in separate terminals if you want logs)
dev:
	@echo "Starting backend on :8000 ..."
	cd backend && python3 -m uvicorn main:app --reload --port 8000 &
	@echo "Starting frontend on :3000 ..."
	cd frontend && npm run dev
