# =============================================================
# Conference Platform — Application Settings
# backend/app/config.py
#
# All configuration is read from environment variables / .env.
# Never hardcode secrets. Add new settings here and expose them
# via the `settings` singleton imported by the rest of the app.
# =============================================================

from pathlib import Path
from typing import Any, List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # ── Application ───────────────────────────────────────
    app_name: str = "conf-platform-backend"
    api_v1_prefix: str = "/api/v1"
    API_BASE_URL: str = "http://127.0.0.1:8000"
    environment: str = "development"        # development | staging | production
    debug: bool = False

    # ── Database ──────────────────────────────────────────
    # Sync URL used by Alembic migrations & legacy sync code
    DATABASE_URL_SYNC: str

    # Async URL for FastAPI / SQLAlchemy async engine.
    # Defaults to the sync URL with the driver swapped to asyncpg.
    DATABASE_URL_ASYNC: str = ""

    # ── JWT ───────────────────────────────────────────────
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480          # 8 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── Pagination ────────────────────────────────────────
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # ── Cloud Storage (Cloudflare R2 / AWS S3-compatible) ─
    STORAGE_MODE: str = "local"                      # "local" or "s3"
    STORAGE_LOCAL_PATH: str = "data/storage"
    S3_ENDPOINT_URL: str = ""                       # R2 endpoint
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    S3_BUCKET_PRESENTATIONS: str = "presentations"
    S3_BUCKET_POSTERS: str = "posters"
    S3_BUCKET_THUMBNAILS: str = "thumbnails"
    S3_BUCKET_IMPORTS: str = "imports"
    S3_BUCKET_ASSETS: str = "assets"
    S3_REGION: str = "auto"
    S3_PRESIGNED_EXPIRY_SECONDS: int = 3600        # 1 hour

    # ── Email (Resend) ────────────────────────────────────
    RESEND_API_KEY: str = ""
    EMAIL_FROM_ADDRESS: str = "noreply@conf-platform.com"
    EMAIL_FROM_NAME: str = "EventOS IT"

    # ── Email (SMTP) ──────────────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    # ── WhatsApp (Meta Cloud API) ─────────────────────────
    WHATSAPP_API_URL: str = "https://graph.facebook.com/v18.0"
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_ACCESS_TOKEN: str = ""

    # ── Redis / Celery ────────────────────────────────────
    REDIS_URL: str = "redis://127.0.0.1:6379/0"
    CELERY_BROKER_URL: str = "redis://127.0.0.1:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://127.0.0.1:6379/1"

    # ── QR Codes ──────────────────────────────────────────
    QR_CODE_BASE_URL: str = "https://conf-platform.com"  # base for speaker QR links
    QR_CODE_BOX_SIZE: int = 10
    QR_CODE_BORDER: int = 4

    # ── File Validation ───────────────────────────────────
    VALIDATION_ENGINE_VERSION: str = "1.0.0"
    MAX_FILE_SIZE_MB: int = 500                     # global hard limit
    ALLOWED_MIME_TYPES: List[str] = [
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # pptx
        "application/vnd.ms-powerpoint",            # ppt
        "application/pdf",
        "video/mp4",
        "application/vnd.apple.keynote",            # key
    ]

    # ── Upload tokens ─────────────────────────────────────
    UPLOAD_TOKEN_EXPIRE_DAYS: int = 30
    CLOUD_API_KEY: str = "dev_internal_secret_do_not_use_in_prod"

    # ── Payment Gateway Encryption ────────────────────────
    # AES-256 (Fernet) master key used to encrypt payment gateway
    # secrets stored in events.registration_settings JSONB.
    # Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    PAYMENT_SECRET_KEY: str = ""

    # ── Portal JWT (attendee self-service) ────────────────
    # Signs portal session JWTs — completely separate from JWT_SECRET_KEY.
    # Generate with:
    #   python -c "import secrets; print(secrets.token_hex(32))"
    PORTAL_JWT_SECRET: str = ""

    # ── WebSocket ─────────────────────────────────────────
    WS_HEARTBEAT_INTERVAL: int = 25                 # seconds

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",                             # ignore unknown env vars
    )

    # ── Derived properties ────────────────────────────────

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug(cls, value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on", "dev", "development"}:
                return True
            if normalized in {"0", "false", "no", "off", "prod", "production", "release"}:
                return False
        return value

    @property
    def database_url(self) -> str:
        """Backward-compatible accessor — returns the sync URL."""
        return self.DATABASE_URL_SYNC

    @property
    def async_database_url(self) -> str:
        """
        Returns the async-compatible URL (asyncpg driver).
        Falls back to deriving it from DATABASE_URL_SYNC automatically.
        """
        if self.DATABASE_URL_ASYNC:
            return self.DATABASE_URL_ASYNC
        # Auto-convert:  postgresql+psycopg2:// → postgresql+asyncpg://
        return self.DATABASE_URL_SYNC.replace(
            "postgresql+psycopg2://", "postgresql+asyncpg://"
        ).replace(
            "postgresql://", "postgresql+asyncpg://"
        )

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


settings = Settings()
