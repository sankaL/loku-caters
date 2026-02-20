# Loku Caters — AGents Rules

## Project overview

Single-page pre-order app for Loku Caters (authentic Sri Lankan Lamprais).
- **Frontend**: Next.js 15 + React 19 + Tailwind CSS v4 — `frontend/`
- **Backend**: FastAPI + SQLAlchemy + pg8000 — `backend/`
- **Database**: Supabase (PostgreSQL)
- **Email**: Resend
- **Deployment**: Railway (two separate services)

## Config sync — always do this after editing event-config.json

```
cp config/event-config.json frontend/src/config/event-config.json
cp config/event-config.json backend/event-config.json
```

Never hardcode prices, currency, locations, or time slots in components or routes.

## Critical rules

- **Pricing is server-side only.** `backend/routers/orders.py` computes the total from config. Never trust the client.
- **DB driver is pg8000.** Do not introduce psycopg2 — it needs native compilation.
- **Never use em dashes (`—`) or en dashes (`–`)** anywhere — copy, comments, config, or code.
- **Currency** comes from `event_config.get_currency()` on the backend and `CURRENCY` from `@/config/event` on the frontend. Never hardcode `"CAD"` or any currency string.
- **Email failures must not fail the order.** Always wrap `send_confirmation()` in try/except.
- **Never commit `.env` or `.env.local`.**

## Key files

| File | Purpose |
|---|---|
| `config/event-config.json` | Source of truth for all business config |
| `frontend/src/config/event.ts` | Re-exports config values for components |
| `backend/event_config.py` | Loads config JSON for backend routes |
| `backend/routers/orders.py` | Only order endpoint — computes price, saves, sends email |
| `backend/services/email.py` | Resend HTML email template |
| `backend/database.py` | SQLAlchemy engine with pg8000 URL transform |

## Design system

- Forest green `#12270F`, sage `#729152`, cream `#F7F5F0`, text `#1C1C1A`
- Headings: Playfair Display (`var(--font-serif)`), body: Inter (`var(--font-sans)`)
- Cards: `rounded-3xl`, `border: 1px solid var(--color-border)`, white or cream bg
- Use `var(--color-*)` CSS custom properties in JSX, not raw hex

## Running locally

```bash
# Backend
cd backend && python3 -m uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm run dev
```