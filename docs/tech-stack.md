# Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (TypeScript, App Router) |
| UI Library | React 19 |
| Styling | Tailwind CSS v4 + CSS custom properties |
| Fonts | Playfair Display (headings), Inter (body) via Google Fonts |
| Data | Static JSON in `config/` (no database) |
| Email | Resend REST API from Next.js route handlers |
| Deployment | Railway, one service (Docker, `output: standalone`, app sleeping on) |

The FastAPI backend, Supabase database and admin portal live on `main`. This
`frontend-only` branch drops them to cut hosting cost.

## Supabase keep-alive

The Supabase project is on the Free plan, which pauses after 7 days of low
activity. To keep the old order data available, the Railway service
`supabase-keepalive` runs every 6 hours (`23 */6 * * *`, UTC). It uses the
stock `postgres:17-alpine` image, reads `DATABASE_URL` by reference from
`loku-caters-backend`, and runs one read-only transaction that counts
`events` and `orders`. Nothing is written. Check recent runs with
`railway cron list --service supabase-keepalive`. If the backend service is
ever deleted, move `DATABASE_URL` onto the keep-alive service first.
