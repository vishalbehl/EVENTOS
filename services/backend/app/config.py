# =============================================================
# Conference Platform — Application Settings
# backend/app/config.py
#
# All configuration is read from environment variables / .env.
# Never hardcode secrets. Add new settings here and expose them
# via the `settings` singleton imported by the rest of the app.
# =============================================================

from pathlib import Path
import re
from typing import Any, List

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # ── Application ───────────────────────────────────────
    app_name: str = "conf-platform-backend"
    api_v1_prefix: str = "/api/v1"
    API_BASE_URL: str = "http://127.0.0.1:8000"
    DEPLOYMENT_PROFILE: str = "local"       # local | staging | production
    environment: str = "development"        # development | staging | production
    # Runtime API identities must not create default accounts, run DDL or
    # reconcile global catalogues implicitly. Legacy local bootstrap is opt-in.
    ENABLE_DEVELOPMENT_BOOTSTRAP: bool = False
    debug: bool = False
    PUBLIC_DEMO_SIGNUP_ENABLED: bool = False
    PUBLIC_DEMO_PLAN_NAME: str = "Free Trial"
    PUBLIC_DEMO_RETENTION_DAYS: int = 14
    # This is deliberately opt-in and intended only for isolated tests.  Local
    # development must exercise the same entitlement denials as production.
    ALLOW_TEST_CAPABILITY_BYPASS: bool = False

    # ── Database ──────────────────────────────────────────
    # Sync URL used by Alembic migrations & legacy sync code
    DATABASE_URL_SYNC: str

    # Async URL for FastAPI / SQLAlchemy async engine.
    # Defaults to the sync URL with the driver swapped to asyncpg.
    DATABASE_URL_ASYNC: str = ""
    REQUIRE_RLS_SAFE_RUNTIME_ROLE: bool = False
    TENANT_FILTER_DIAGNOSTICS: bool = False
    DB_SLOW_QUERY_MS: int = 250
    CACHE_DEFAULT_TTL_SECONDS: int = 30
    CACHE_MAX_VALUE_BYTES: int = 512 * 1024
    CACHE_PUBLIC_FORM_TTL_SECONDS: int = 30
    CACHE_PUBLISHED_WEBSITE_TTL_SECONDS: int = 60
    CACHE_PRICING_TTL_SECONDS: int = 30
    CACHE_ROLES_TTL_SECONDS: int = 30
    CACHE_CAPABILITIES_TTL_SECONDS: int = 60
    CACHE_SEARCH_SUGGESTIONS_TTL_SECONDS: int = 300
    CACHE_DASHBOARD_TTL_SECONDS: int = 15
    IDEMPOTENCY_DEFAULT_TTL_SECONDS: int = 86400
    IDEMPOTENCY_REGISTRATION_TTL_SECONDS: int = 7 * 86400
    IDEMPOTENCY_FINANCIAL_TTL_SECONDS: int = 30 * 86400
    IDEMPOTENCY_WEBHOOK_TTL_SECONDS: int = 30 * 86400
    IDEMPOTENCY_MAX_RESPONSE_BYTES: int = 256 * 1024
    ANTIVIRUS_REQUIRED: bool = False
    ANTIVIRUS_COMMAND: str = ""
    ANTIVIRUS_TIMEOUT_SECONDS: int = 120
    REQUEST_SLOW_MS: int = 800
    REQUEST_DB_SLOW_MS: int = 400
    REQUEST_DB_QUERY_WARN_COUNT: int = 40
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT_SECONDS: int = 30

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

    # ── Cloud Storage (MinIO in development; R2/S3 in hosted environments) ─
    # Persistent uploads use the S3-compatible object-storage contract.
    # STORAGE_LOCAL_PATH is retained only as a migration source and legacy
    # test escape hatch; application writes use STORAGE_MODE=s3.
    STORAGE_MODE: str = "s3"
    STORAGE_LOCAL_PATH: str = "data/storage"
    S3_ENDPOINT_URL: str = "http://127.0.0.1:9000"       # Private/internal endpoint
    S3_PUBLIC_ENDPOINT_URL: str = "http://127.0.0.1:9000"  # Browser/device endpoint
    S3_ACCESS_KEY_ID: str = "minioadmin"
    S3_SECRET_ACCESS_KEY: str = "minioadmin"
    S3_BUCKET_PRESENTATIONS: str = "presentations"
    S3_BUCKET_POSTERS: str = "posters"
    S3_BUCKET_THUMBNAILS: str = "thumbnails"
    S3_BUCKET_IMPORTS: str = "imports"
    S3_BUCKET_ASSETS: str = "assets"
    S3_BUCKET_EXPORTS: str = "exports"
    S3_BUCKET_REGISTRATION_UPLOADS: str = "registration-uploads"

    @field_validator("S3_BUCKET_REGISTRATION_UPLOADS")
    @classmethod
    def validate_registration_upload_bucket(cls, value: str) -> str:
        # Deliberately use the portable, non-dotted subset of S3 bucket names.
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", value):
            raise ValueError("Registration upload bucket must be a 3-63 character lowercase S3 name")
        return value
    S3_REGION: str = "us-east-1"
    S3_FORCE_PATH_STYLE: bool = True
    S3_PRESIGNED_EXPIRY_SECONDS: int = 3600        # 1 hour
    # Bounded S3-compatible client behavior. These apply equally to MinIO,
    # AWS S3, and Cloudflare R2 and prevent a worker from hanging indefinitely.
    STORAGE_CONNECT_TIMEOUT_SECONDS: int = 5
    STORAGE_READ_TIMEOUT_SECONDS: int = 60
    STORAGE_MAX_RETRIES: int = 2
    STORAGE_MAX_CONNECTIONS: int = 32

    # ── Email (Resend) ────────────────────────────────────
    RESEND_API_KEY: str = ""
    EMAIL_FROM_ADDRESS: str = "noreply@conf-platform.com"
    EMAIL_FROM_NAME: str = "EventOS IT"

    # ── Email (SMTP) ──────────────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    # ── Invoice PDF identity and certificate signing ─────
    # The PKCS#12 certificate is mounted as a secret file. Never store its
    # bytes or password in the database or repository.
    INVOICE_ISSUER_NAME: str = "EventOS IT Solutions"
    INVOICE_ISSUER_ADDRESS: str = "Delhi, India"
    INVOICE_ISSUER_GSTIN: str = ""
    INVOICE_ISSUER_PAN: str = ""
    INVOICE_ISSUER_SAC: str = "998314"
    INVOICE_ISSUER_WEBSITE: str = "www.eventos.com"
    INVOICE_ISSUER_EMAIL: str = "billing@eventos.com"
    INVOICE_ISSUER_PHONE: str = "+91 11 4703 8800"
    INVOICE_SIGNING_PKCS12_PATH: str = ""
    INVOICE_SIGNING_PKCS12_PASSWORD: str = ""
    INVOICE_SIGNER_NAME: str = "EventOS IT Solutions"
    INVOICE_SIGNING_REASON: str = "Authorised EventOS tax invoice"
    INVOICE_SIGNING_LOCATION: str = "Delhi, India"
    INVOICE_SIGNING_TSA_URL: str = ""
    INVOICE_PDF_REQUIRE_CRYPTOGRAPHIC_SIGNATURE: bool = False

    # ── WhatsApp (Meta Cloud API) ─────────────────────────
    WHATSAPP_API_URL: str = "https://graph.facebook.com/v18.0"
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_ACCESS_TOKEN: str = ""

    # ── Redis / Celery ────────────────────────────────────
    REDIS_URL: str = "redis://127.0.0.1:6379/0"
    REDIS_CACHE_URL: str = ""
    REDIS_LOCK_URL: str = ""
    REDIS_OPERATION_TIMEOUT_SECONDS: float = 3.0
    REDIS_LOCK_TTL_SECONDS: int = 30
    CELERY_BROKER_URL: str = "redis://127.0.0.1:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://127.0.0.1:6379/1"

    @property
    def redis_cache_url(self) -> str:
        return self.REDIS_CACHE_URL or self.REDIS_URL

    @property
    def redis_lock_url(self) -> str:
        return self.REDIS_LOCK_URL or self.redis_cache_url

    # ── QR Codes ──────────────────────────────────────────
    QR_CODE_BASE_URL: str = "https://conf-platform.com"  # base for speaker QR links
    SPEAKER_PORTAL_BASE_URL: str = "http://localhost:3001"
    QR_CODE_BOX_SIZE: int = 10
    QR_CODE_BORDER: int = 4

    # ── File Validation ───────────────────────────────────
    VALIDATION_ENGINE_VERSION: str = "1.0.0"
    MAX_FILE_SIZE_MB: int = 500                     # global hard limit
    # Multipart compatibility uploads stay bounded in API memory. Larger
    # files use the durable direct-to-object-storage upload session.
    INLINE_UPLOAD_MAX_MB: int = 10
    ALLOWED_MIME_TYPES: List[str] = [
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # pptx
        "application/vnd.ms-powerpoint",            # ppt
        "application/pdf",
        "video/mp4",
        "application/vnd.apple.keynote",            # key
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # xlsx
        "application/vnd.ms-excel",                 # xls
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
    def normalize_environment_profile(self) -> "Settings":
        profile = (self.DEPLOYMENT_PROFILE or self.environment or "local").strip().lower()
        if profile in {"dev", "development"}:
            profile = "local"
        if profile in {"prod", "production"}:
            profile = "production"
        if profile not in {"local", "staging", "production"}:
            raise ValueError("DEPLOYMENT_PROFILE must be one of: local, staging, production")
        self.DEPLOYMENT_PROFILE = profile
        if self.environment in {"dev", "local"}:
            self.environment = "development"
        if profile == "production":
            self.environment = "production"
        elif profile == "staging" and self.environment == "development":
            self.environment = "staging"
        return self

    @model_validator(mode="after")
    def validate_operational_limits(self) -> "Settings":
        positive = {
            "DB_POOL_SIZE": self.DB_POOL_SIZE,
            "DB_POOL_TIMEOUT_SECONDS": self.DB_POOL_TIMEOUT_SECONDS,
            "REDIS_OPERATION_TIMEOUT_SECONDS": self.REDIS_OPERATION_TIMEOUT_SECONDS,
            "REDIS_LOCK_TTL_SECONDS": self.REDIS_LOCK_TTL_SECONDS,
            "REQUEST_SLOW_MS": self.REQUEST_SLOW_MS,
            "REQUEST_DB_SLOW_MS": self.REQUEST_DB_SLOW_MS,
            "DB_SLOW_QUERY_MS": self.DB_SLOW_QUERY_MS,
            "IDEMPOTENCY_DEFAULT_TTL_SECONDS": self.IDEMPOTENCY_DEFAULT_TTL_SECONDS,
            "IDEMPOTENCY_REGISTRATION_TTL_SECONDS": self.IDEMPOTENCY_REGISTRATION_TTL_SECONDS,
            "IDEMPOTENCY_FINANCIAL_TTL_SECONDS": self.IDEMPOTENCY_FINANCIAL_TTL_SECONDS,
            "IDEMPOTENCY_WEBHOOK_TTL_SECONDS": self.IDEMPOTENCY_WEBHOOK_TTL_SECONDS,
            "IDEMPOTENCY_MAX_RESPONSE_BYTES": self.IDEMPOTENCY_MAX_RESPONSE_BYTES,
            "ANTIVIRUS_TIMEOUT_SECONDS": self.ANTIVIRUS_TIMEOUT_SECONDS,
            "STORAGE_CONNECT_TIMEOUT_SECONDS": self.STORAGE_CONNECT_TIMEOUT_SECONDS,
            "STORAGE_READ_TIMEOUT_SECONDS": self.STORAGE_READ_TIMEOUT_SECONDS,
        }
        invalid = [name for name, value in positive.items() if value <= 0]
        if self.DB_MAX_OVERFLOW < 0 or self.CACHE_MAX_VALUE_BYTES < 1024:
            invalid.append("DB_MAX_OVERFLOW/CACHE_MAX_VALUE_BYTES")
        if self.STORAGE_MAX_RETRIES < 0 or self.STORAGE_MAX_CONNECTIONS < 1:
            invalid.append("STORAGE_MAX_RETRIES/STORAGE_MAX_CONNECTIONS")
        if invalid:
            raise ValueError("Operational limits must be positive: " + ", ".join(invalid))
        return self

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if not self.is_production:
            return self

        errors: list[str] = []
        if self.ENABLE_DEVELOPMENT_BOOTSTRAP:
            errors.append("ENABLE_DEVELOPMENT_BOOTSTRAP is forbidden in production")
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
        if not self.INVOICE_PDF_REQUIRE_CRYPTOGRAPHIC_SIGNATURE:
            errors.append("INVOICE_PDF_REQUIRE_CRYPTOGRAPHIC_SIGNATURE must be enabled")
        if not self.INVOICE_SIGNING_PKCS12_PATH:
            errors.append("INVOICE_SIGNING_PKCS12_PATH must reference a mounted secret")
        if not self.INVOICE_SIGNING_PKCS12_PASSWORD:
            errors.append("INVOICE_SIGNING_PKCS12_PASSWORD must be configured")
        for name, value in (
            ("INVOICE_ISSUER_GSTIN", self.INVOICE_ISSUER_GSTIN),
            ("INVOICE_ISSUER_PAN", self.INVOICE_ISSUER_PAN),
            ("INVOICE_ISSUER_ADDRESS", self.INVOICE_ISSUER_ADDRESS),
            ("INVOICE_ISSUER_EMAIL", self.INVOICE_ISSUER_EMAIL),
        ):
            if not value:
                errors.append(f"{name} must be configured")
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
        if self.S3_ENDPOINT_URL.startswith(("http://127.0.0.1", "http://localhost", "http://minio")):
            errors.append("S3_ENDPOINT_URL must point to hosted object storage in production")
        if self.S3_PUBLIC_ENDPOINT_URL.startswith(("http://127.0.0.1", "http://localhost", "http://minio")):
            errors.append("S3_PUBLIC_ENDPOINT_URL must not point to local MinIO in production")
        if self.S3_ACCESS_KEY_ID == "minioadmin" or self.S3_SECRET_ACCESS_KEY == "minioadmin":
            errors.append("S3 credentials must not use the development MinIO defaults in production")
        if self.S3_ENDPOINT_URL and not (self.S3_ACCESS_KEY_ID and self.S3_SECRET_ACCESS_KEY):
            errors.append("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required for an explicit production endpoint")
        if not self.REDIS_URL.startswith("rediss://"):
            errors.append("REDIS_URL must use TLS")
        for name, value in (("REDIS_CACHE_URL", self.REDIS_CACHE_URL), ("REDIS_LOCK_URL", self.REDIS_LOCK_URL)):
            if not value:
                errors.append(f"{name} must be explicitly configured")
            elif not value.startswith("rediss://"):
                errors.append(f"{name} must use TLS")
        if not self.CELERY_BROKER_URL.startswith("rediss://"):
            errors.append("CELERY_BROKER_URL must use TLS")
        if not self.CELERY_RESULT_BACKEND.startswith("rediss://"):
            errors.append("CELERY_RESULT_BACKEND must use TLS")
        role_urls = {
            "cache": self.REDIS_CACHE_URL,
            "coordination": self.REDIS_LOCK_URL,
            "broker": self.CELERY_BROKER_URL,
            "results": self.CELERY_RESULT_BACKEND,
        }
        for left, right in (("cache", "broker"), ("cache", "results"), ("coordination", "broker"), ("coordination", "results")):
            if role_urls[left] and role_urls[left] == role_urls[right]:
                errors.append(f"Redis {left} and {right} roles must use different URLs")
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
        return self.environment == "production" or self.DEPLOYMENT_PROFILE == "production"


settings = Settings()
