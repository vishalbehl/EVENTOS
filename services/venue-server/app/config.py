from typing import Optional
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class VenueSettings(BaseSettings):
    # Core Server
    ENV: str = "development"
    DEPLOYMENT_PROFILE: str = "local"  # local | staging | production
    PORT: int = 8001
    HOST: str = "0.0.0.0"

    # Security (Local Auth Key for Kiosks/Displays)
    VENUE_AUTH_KEY: str = "venue_secret_key"  # Displays must provide this key to connect
    VENUE_AUTH_SECRET: str = "eventos-venue-local-default-auth-secret-2026"
    VENUE_ACCESS_TOKEN_MINUTES: int = 480
    VENUE_BOOTSTRAP_ADMIN_USERNAME: str = "admin"
    VENUE_BOOTSTRAP_ADMIN_EMAIL: str = "admin@eventos.com"
    VENUE_BOOTSTRAP_ADMIN_PASSWORD: str = "admin123"
    VENUE_BOOTSTRAP_ADMIN_NAME: str = "Venue Administrator"

    # Cloud Connection (Where to sync from)
    REGISTRATION_FETCH_SOURCE_TYPE: str = "cloud"
    CLOUD_API_URL: str = "http://127.0.0.1:8002"
    CLOUD_API_KEY: str = "dev_internal_secret_do_not_use_in_prod"  # Legacy cloud-to-venue authentication
    CLOUD_DEVICE_KEY: str = ""  # One-time registered cloud device credential

    # Local Database (PostgreSQL - Must match cloud schema structure)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:venue_password@localhost:5433/venue_db"
    
    @property
    def DATABASE_URL_SYNC(self) -> str:
        return self.DATABASE_URL.replace("postgresql+asyncpg", "postgresql+psycopg2")


    # Local Redis (WebSockets & Queues)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Local MinIO Storage (Files)
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_SECURE: bool = False
    LOCAL_BUCKET_NAME: str = "venue-presentations"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @model_validator(mode="after")
    def validate_profile(self) -> "VenueSettings":
        profile = (self.DEPLOYMENT_PROFILE or self.ENV or "local").strip().lower()
        if profile in {"dev", "development"}:
            profile = "local"
        if profile in {"prod", "production"}:
            profile = "production"
        if profile not in {"local", "staging", "production"}:
            raise ValueError("DEPLOYMENT_PROFILE must be one of: local, staging, production")
        self.DEPLOYMENT_PROFILE = profile
        if profile == "production":
            errors: list[str] = []
            if self.VENUE_AUTH_KEY == "venue_secret_key" or len(self.VENUE_AUTH_KEY) < 24:
                errors.append("VENUE_AUTH_KEY must be rotated")
            if self.VENUE_AUTH_SECRET == "eventos-venue-local-default-auth-secret-2026" or len(self.VENUE_AUTH_SECRET) < 32:
                errors.append("VENUE_AUTH_SECRET must be a rotated secret of at least 32 characters")
            if self.CLOUD_API_KEY == "dev_internal_secret_do_not_use_in_prod":
                errors.append("CLOUD_API_KEY must not use the development default")
            if self.CLOUD_API_URL.startswith("http://127.0.0.1") or self.CLOUD_API_URL.startswith("http://localhost"):
                errors.append("CLOUD_API_URL must not point to localhost in production")
            if errors:
                raise ValueError("Unsafe production venue-server configuration: " + "; ".join(errors))
        return self

settings = VenueSettings()
