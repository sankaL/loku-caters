from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str
    resend_api_key: str
    resend_webhook_secret: str = ""
    # Optional for modern Supabase projects using asymmetric JWTs (RS256/ES256).
    # Still used for legacy HS256 verification and local dev token minting.
    supabase_jwt_secret: str = ""
    from_email: str = "orders@lokucaters.com"
    reply_to_email: str | None = None
    email_enabled: bool = True
    email_queue_enabled: bool = True
    email_send_rate_per_second: int = 1
    email_max_attempts: int = 8
    email_lock_seconds: int = 300
    email_poll_interval_ms: int = 250
    frontend_url: str = "http://localhost:3000"
    dev_mode: bool = False


settings = Settings()
