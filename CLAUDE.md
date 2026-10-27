# Loku Caters — Claude Code Rules

## Project overview

Customer-facing pre-order site for Loku Caters (authentic Sri Lankan Lamprais).
This `frontend-only` branch has no backend, database or admin portal; `main`
keeps the full FastAPI + Supabase version.
- **App**: Next.js 15 + React 19 + Tailwind CSS v4 — `frontend/`
- **Data**: static JSON in `config/` (event, menu, reviews)
- **Email**: Resend REST API from Next.js route handlers in `frontend/src/app/api/`
- **Deployment**: Railway. `make deploy-lite` runs this branch on `loku-caters-frontend` and stops the backend; `make deploy-full` switches back to `main`. Nothing deploys on push.

## Config sync — always do this after editing config/*.json

```
make sync-config
```

Never hardcode prices, currency, locations, or time slots in components or routes.
See `docs/running-an-event.md` for opening and closing pre-orders.

## Critical rules

- **Pricing is server-side authoritative.** `frontend/src/app/api/orders/checkout/route.ts` re-prices the cart with `priceEventCart()` from config. Never trust client totals.
- **Never use em dashes (`—`) or en dashes (`–`)** anywhere — copy, comments, config, or code.
- **Currency** comes from `CURRENCY` in `@/config/event`. Never hardcode `"CAD"` or any currency string.
- **The notification email is the only record of a submission.** If Resend fails, return an error to the customer; never swallow it.
- **Keep it cheap.** No new services, databases or always-on workers. Pages should stay statically prerendered.
- **Never commit `.env` or `.env.local`.**

## Key files

| File | Purpose |
|---|---|
| `config/event-config.json` | Active event, items, locations, combo deals, menu, flyer |
| `config/reviews.json` | Reviews shown on the site |
| `frontend/src/config/event.ts` | Types and `getActiveEventConfig()` |
| `frontend/src/lib/pricing.ts` | Cart and combo deal pricing (port of the old Python service) |
| `frontend/src/lib/server/email.ts` | Resend notification email template |
| `frontend/src/lib/server/http.ts` | Rate limiting and request validation helpers |
| `frontend/railway.json` | Railway build and deploy settings |

## Design system

- Forest green `#12270F`, sage `#729152`, cream `#F7F5F0`, text `#1C1C1A`
- Headings: Playfair Display (`var(--font-serif)`), body: Inter (`var(--font-sans)`)
- Cards: `rounded-3xl`, `border: 1px solid var(--color-border)`, white or cream bg
- Use `var(--color-*)` CSS custom properties in JSX, not raw hex

## Running locally

```bash
make dev    # Next.js dev server, real Resend when .env has credentials
make test   # pricing unit tests
```
