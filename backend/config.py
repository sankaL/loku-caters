from __future__ import annotations

import re
from urllib.parse import unquote, urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str
    resend_api_key: str
    # Optional for modern Supabase projects using asymmetric JWTs (RS256/ES256).
    # Still used for legacy HS256 verification and local dev token minting.
    supabase_jwt_secret: str = ""
    # Canonical Supabase project URL. When omitted, the project ref is derived
    # from the documented Supabase database URL formats for compatibility.
    supabase_url: str = ""
    # Optional comma-separated allowlist. Leave empty only when Supabase sign-up
    # is disabled and every authenticated account is an administrator.
    admin_emails: str = ""
    allow_all_authenticated_admins: bool = False
    from_email: str = "orders@lokucaters.com"
    reply_to_email: str | None = None
    email_enabled: bool = True
    email_request_timeout_seconds: int = 15
    frontend_url: str = "http://localhost:3000"
    dev_mode: bool = False
    rate_limit_enabled: bool = True
    rate_limit_trusted_proxy_hops: int = 1
    max_request_body_bytes: int = 2 * 1024 * 1024

    def get_supabase_issuer(self) -> str:
        if self.supabase_url:
            parsed = urlparse(self.supabase_url)
            hostname = (parsed.hostname or "").lower()
            if (
                parsed.scheme != "https"
                or not re.fullmatch(r"[a-z0-9-]+\.supabase\.co", hostname)
                or parsed.username
                or parsed.password
                or parsed.port not in {None, 443}
                or parsed.path not in {"", "/"}
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError(
                    "SUPABASE_URL must be a canonical Supabase HTTPS project URL"
                )
            return f"https://{hostname}/auth/v1"

        parsed = urlparse(self.database_url)
        username = unquote(parsed.username or "")
        hostname = (parsed.hostname or "").lower()
        project_ref = ""
        if username.startswith("postgres."):
            project_ref = username.split(".", 1)[1]
        elif hostname.startswith("db.") and hostname.endswith(".supabase.co"):
            project_ref = hostname[len("db.") : -len(".supabase.co")]

        if not project_ref or not re.fullmatch(r"[a-z0-9-]+", project_ref):
            raise ValueError(
                "SUPABASE_URL is required when the project ref cannot be derived from DATABASE_URL"
            )
        return f"https://{project_ref}.supabase.co/auth/v1"

    def get_admin_email_allowlist(self) -> set[str]:
        return {
            email.strip().lower()
            for email in self.admin_emails.split(",")
            if email.strip()
        }


settings = Settings()
