import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import admin, config, feedback, invoices, orders, catering
from security import RateLimitMiddleware, RequestSecurityMiddleware


logger = logging.getLogger(__name__)

if not settings.dev_mode and not settings.get_admin_email_allowlist():
    logger.warning(
        "ADMIN_EMAILS is empty. Every authenticated Supabase account can access the admin API; disable public signup or configure the allowlist."
    )

app = FastAPI(
    title="Loku Caters API",
    version="2.0.0",
    docs_url="/docs" if settings.dev_mode else None,
    redoc_url="/redoc" if settings.dev_mode else None,
    openapi_url="/openapi.json" if settings.dev_mode else None,
)

_allowed_origins = {settings.frontend_url.rstrip("/")}
if settings.dev_mode:
    _allowed_origins.update(f"http://localhost:{p}" for p in range(3000, 3010))
    _allowed_origins.update(f"http://127.0.0.1:{p}" for p in range(3000, 3010))

app.add_middleware(
    RequestSecurityMiddleware,
    max_request_body_bytes=settings.max_request_body_bytes,
)
app.add_middleware(
    RateLimitMiddleware,
    enabled=settings.rate_limit_enabled,
    trusted_proxy_hops=settings.rate_limit_trusted_proxy_hops,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(_allowed_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(orders.router)
app.include_router(config.router)
app.include_router(admin.router)
app.include_router(invoices.router)
app.include_router(feedback.router)
app.include_router(catering.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Loku Caters API"}
