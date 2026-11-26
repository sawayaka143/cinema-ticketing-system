from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings from environment variables (or backend/.env locally)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = ""
    supabase_url: str = ""
    # Dev-only, for python -m app.seed_users (test logins). Never set in production.
    supabase_service_role_key: str = ""
    seed_user_password: str = ""
    # Server-side key for uploading movie posters to Supabase Storage (the service_role key of
    # the same project). Without it the admin panel takes poster links only.
    supabase_storage_key: str = ""
    poster_bucket: str = "posters"
    app_env: str = "development"
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
