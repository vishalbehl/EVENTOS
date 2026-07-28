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

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # ── Application ───────────────────────────────────────
    app_name: str = "conf-platform-backend"
    api_v1_prefix: str = "/api/v1"
    API_BASE_URL: str = "http://127.0.0.1:8000"
    environment: str = "development"        # development | staging | production
    debug: bool = False
    PUBLIC_DEMO_SIGNUP_ENABLED: bool = False
    PUBLIC_DEMO_PLAN_NAME: str = "Free Trial"
    PUBLIC_DEMO_RETENTION_DAYS: int = 14

    # ── Database ──────────────────────────────────────────
    # Sync URL used by Alembic migrations & legacy sync code
    DATABASE_URL_SYNC: str

    # Async URL for FastAPI / SQLAlchemy async engine.
    # Defaults to the sync URL with the driver swapped to asyncpg.
    DATABASE_URL_ASYNC: str = ""
    REQUIRE_RLS_SAFE_RUNTIME_ROLE: bool = False

    # ── JWT ───────────────────────────────────────────────
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    PROPOSAL_SHARE_SECRET: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480          # 8 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    COMMAND_CENTER_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    COMMAND_CENTER_COOKIE_NAME: str = "cc_refresh"
    COMMAND_CENTER_COOKIE_SECURE: bool = False
    COMMAND_CENTER_COOKIE_SAMESITE: str = "lax"
    COMMAND_CENTER_LOGIN_ACCOUNT_LIMIT: int = 5
    COMMAND_CENTER_LOGIN_IP_LIMIT: int = 20
    COMMAND_CENTER_LOGIN_WINDOW_SECONDS: int = 900
    COMMAND_CENTER_ACCOUNT_LOCK_SECONDS: int = 900
    COMMAND_CENTER_IP_LOCK_SECONDS: int = 1800
    TRUSTED_PROXY_CIDRS: List[str] = []
    ENFORCE_PRIVILEGED_MFA: bool = False
    MFA_STEP_UP_MAX_AGE_SECONDS: int = 600
    WS_AUTH_TIMEOUT_SECONDS: int = 10
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3003",
        "http://127.0.0.1:3003",
    ]

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
    S3_BUCKET_EXPORTS: str = "exports"
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
    SPEAKER_PORTAL_BASE_URL: str = "http://localhost:3001"
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

    # ── Gemini AI ─────────────────────────────────────────
    GEMINI_API_KEY: str = ""

    # ── Payment Gateway Encryption ────────────────────────
    # AES-256 (Fernet) master key used to encrypt payment gateway
    # secrets stored in events.registration_settings JSONB.
    # Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    PAYMENT_SECRET_KEY: str = ""

    # ── TOTP Encryption ──────────────────────────────────
    # Fernet key used to encrypt TOTP secrets.
    FERNET_KEY: str = ""

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

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("TRUSTED_PROXY_CIDRS", mode="before")
    @classmethod
    def parse_trusted_proxy_cidrs(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if not self.is_production:
            return self

        errors: list[str] = []
        if self.JWT_SECRET_KEY == "change-me-in-production" or len(self.JWT_SECRET_KEY) < 32:
            errors.append("JWT_SECRET_KEY must be a rotated secret of at least 32 characters")
        if not self.PROPOSAL_SHARE_SECRET or len(self.PROPOSAL_SHARE_SECRET) < 32:
            errors.append("PROPOSAL_SHARE_SECRET must be an independent secret of at least 32 characters")
        if self.CLOUD_API_KEY == "dev_internal_secret_do_not_use_in_prod" or len(self.CLOUD_API_KEY) < 32:
            errors.append("CLOUD_API_KEY must be a rotated secret of at least 32 characters")
        if not self.FERNET_KEY:
            errors.append("FERNET_KEY is required")
        if not self.PORTAL_JWT_SECRET or len(self.PORTAL_JWT_SECRET) < 32:
            errors.append("PORTAL_JWT_SECRET must be at least 32 characters")
        if not self.ENFORCE_PRIVILEGED_MFA:
            errors.append("ENFORCE_PRIVILEGED_MFA must be enabled")
        if not self.REQUIRE_RLS_SAFE_RUNTIME_ROLE:
            errors.append("REQUIRE_RLS_SAFE_RUNTIME_ROLE must be enabled")
        if self.ACCESS_TOKEN_EXPIRE_MINUTES > 60:
            errors.append("ACCESS_TOKEN_EXPIRE_MINUTES must not exceed 60 in production")
        if self.COMMAND_CENTER_ACCESS_TOKEN_EXPIRE_MINUTES > 15:
            errors.append("COMMAND_CENTER_ACCESS_TOKEN_EXPIRE_MINUTES must not exceed 15 in production")
        if not self.COMMAND_CENTER_COOKIE_SECURE:
            errors.append("COMMAND_CENTER_COOKIE_SECURE must be enabled in production")
        if any("localhost" in origin or "127.0.0.1" in origin or "0.0.0.0" in origin for origin in self.CORS_ORIGINS):
            errors.append("CORS_ORIGINS must contain only production origins")
        if "*" in self.CORS_ORIGINS or any(not origin.startswith("https://") for origin in self.CORS_ORIGINS):
            errors.append("CORS_ORIGINS must be explicit HTTPS origins")
        if not self.API_BASE_URL.startswith("https://"):
            errors.append("API_BASE_URL must use HTTPS")
        if self.STORAGE_MODE != "s3":
            errors.append("STORAGE_MODE must be s3")
        if not self.REDIS_URL.startswith("rediss://"):
            errors.append("REDIS_URL must use TLS")
        if not self.CELERY_BROKER_URL.startswith("rediss://"):
            errors.append("CELERY_BROKER_URL must use TLS")
        if not self.CELERY_RESULT_BACKEND.startswith("rediss://"):
            errors.append("CELERY_RESULT_BACKEND must use TLS")
        if self.S3_ENDPOINT_URL == "" and (self.S3_ACCESS_KEY_ID or self.S3_SECRET_ACCESS_KEY):
            errors.append("AWS S3 must use the ECS task role instead of static access keys")
        if errors:
            raise ValueError("Unsafe production configuration: " + "; ".join(errors))
        return self

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
