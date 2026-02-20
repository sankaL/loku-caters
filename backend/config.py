from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    resend_api_key: str
    from_email: str = "orders@lokucaters.com"
    reply_to_email: str | None = None
    email_enabled: bool = True
    frontend_url: str = "http://localhost:3000"


settings = Settings()
