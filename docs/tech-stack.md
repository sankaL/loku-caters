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
