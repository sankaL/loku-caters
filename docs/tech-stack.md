# Tech Stack

## Frontend
| Layer | Choice |
|---|---|
| Framework | Next.js 15 (TypeScript, App Router) |
| UI Library | React 19 |
| Styling | Tailwind CSS v4 + CSS custom properties |
| Fonts | Playfair Display (headings), Inter (body) via Google Fonts |
| Deployment | Railway (Docker, `output: standalone`) |

## Backend
| Layer | Choice |
|---|---|
| Framework | FastAPI (Python 3.12) |
| Validation | Pydantic v2 (`pydantic[email]`, `pydantic-settings`) |
| ORM | SQLAlchemy 2.0 |
| DB Driver | pg8000 (pure-Python, no native deps) |
| Deployment | Railway (Docker, Uvicorn) |

## Infrastructure
| Layer | Choice |
|---|---|
| Database | Supabase (PostgreSQL) |
| Email | Resend (Python SDK) |
| Hosting | Railway (separate services for frontend + backend) |
| Version Control | GitHub |

## Config
All business data (items, prices, currency, locations, time slots, event date) lives in a single source-of-truth file:
`config/event-config.json` — copied to `frontend/src/config/` and `backend/` at sync time.
