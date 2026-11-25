import json
import warnings
from typing import Optional, Annotated, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict, NoDecode


def _normalize_str_list(value):
    """
    Coerce a raw env value (or already-decoded list/tuple) into a clean list of strings.
    """
    if value is None:
        return []
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        if stripped.startswith("["):
            try:
                decoded = json.loads(stripped)
                if isinstance(decoded, list):
                    return [str(item).strip() for item in decoded if str(item).strip()]
            except (ValueError, json.JSONDecodeError):
                pass
        return [item.strip() for item in stripped.split(",") if item.strip()]
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value)]


class Settings(BaseSettings):
    PROJECT_NAME: str = "Auto Apply AI"
    API_V1_STR: str = "/api/v1"

    # Frontend / integration
    FRONTEND_BASE_URL: str = "http://localhost:3000"
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10

    # CORS & hosts
    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    ALLOWED_HOSTS: Annotated[list[str], NoDecode] = ["*"]

    # Database Configurations
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "auto_apply_db"
    POSTGRES_PORT: str = "5432"

    # Redis Configurations
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379

    # LLM Configurations
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-1.5-flash"

    # Search Connectors (LinkedIn, Indeed, Google, Greenhouse)
    TRACKED_COMPANIES_GREENHOUSE: Annotated[list[str], NoDecode] = [
        "vercel", "openai", "cloudflare", "anthropic", "stripe", "figma",
        "databricks", "linear", "scaleai", "gitlab", "canonical", "airtable"
    ]
    SERPAPI_API_KEY: Optional[str] = None
    GOOGLE_SEARCH_API_KEY: Optional[str] = None
    GOOGLE_SEARCH_CX: Optional[str] = None

    SEARCH_INTERVAL_HOURS: int = 6
    MATCHING_THRESHOLD: float = 0.55
    DAILY_APPLY_MAX: int = 15

    # Playwright & Apply Runner Configurations
    PLAYWRIGHT_HEADLESS: bool = True
    PLAYWRIGHT_TIMEOUT: int = 30000
    EMAIL_APPLY_MIN_DELAY_SECONDS: int = 30
    EMAIL_APPLY_MAX_DELAY_SECONDS: int = 60
    PLAYWRIGHT_APPLY_MIN_DELAY_SECONDS: int = 3
    PLAYWRIGHT_APPLY_MAX_DELAY_SECONDS: int = 8

    # Email & Gmail OAuth Configurations
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/gmail/callback"
    EMAIL_SMTP_SERVER: str = "smtp.gmail.com"
    EMAIL_SMTP_PORT: int = 587

    # Security Setup
    SECRET_KEY: str = "supersecretdevelopmentkeychangeinprod"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator("CORS_ORIGINS", "ALLOWED_HOSTS", "TRACKED_COMPANIES_GREENHOUSE", mode="before")
    @classmethod
    def _coerce_list_fields(cls, v: Union[str, list, tuple, None]):
        return _normalize_str_list(v)

    @field_validator("SECRET_KEY", mode="after")
    @classmethod
    def _validate_secret_key(cls, v: str) -> str:
        if v in (
            "supersecretdevelopmentkeychangeinprod",
            "replace_this_with_a_properly_generated_secure_secret_key_in_production",
        ):
            warnings.warn(
                "SECRET_KEY is still set to a known insecure development default. "
                "Generate a strong random key and set it in your .env before deploying.",
                stacklevel=2,
            )
        if len(v) < 32:
            warnings.warn(
                f"SECRET_KEY is only {len(v)} characters long. Use at least 32 characters in production.",
                stacklevel=2,
            )
        return v

    @field_validator("MAX_UPLOAD_SIZE_MB")
    @classmethod
    def _validate_upload_size(cls, v: int) -> int:
        return max(1, min(v, 100))


settings = Settings()
