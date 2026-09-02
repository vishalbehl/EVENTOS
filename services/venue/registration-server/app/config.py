import os
from typing import Optional
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class VenueSettings(BaseSettings):
    # Core Server
    ENV: str = "development"
    DEPLOYMENT_PROFILE: str = "local"  # local | staging | production
    PORT: int = 8002
    HOST: str = "0.0.0.0"
    CORS_ORIGINS: str = (
        "http://127.0.0.1:3000,http://localhost:3000,"
        "http://127.0.0.1:3001,http://localhost:3001,"
        "http://127.0.0.1:3003,http://localhost:3003,"
        "http://127.0.0.1:3005,http://localhost:3005,"
        "http://127.0.0.1:3006,http://localhost:3006,"
        "http://127.0.0.1:3007,http://localhost:3007"
    )

    # Security (Local Auth Key for Kiosks/Displays)
    VENUE_AUTH_KEY: str = "dev_venue_auth_key_1234567890123456"
    VENUE_AUTH_SECRET: str = "dev_venue_auth_secret_longer_than_32_characters_123456"
    VENUE_ACCESS_TOKEN_MINUTES: int = 480
    VENUE_BOOTSTRAP_ADMIN_USERNAME: str = "admin"
    VENUE_BOOTSTRAP_ADMIN_EMAIL: str = "admin@eventos.com"
    VENUE_BOOTSTRAP_ADMIN_PASSWORD: str = "admin123"
    VENUE_BOOTSTRAP_ADMIN_NAME: str = "Venue Administrator"

    # Cloud & Venue Connection
    REGISTRATION_FETCH_SOURCE_TYPE: str = "cloud"
    CLOUD_API_URL: str = "http://127.0.0.1:8000"
    CLOUD_DEVICE_KEY: str = ""  # One-time registered cloud device credential
    CLOUD_API_KEY: str = ""

    # Local Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:venue_password@localhost:5433/venue_db"

    @property
    def DATABASE_URL_SYNC(self) -> str:
        return self.DATABASE_URL.replace("postgresql+asyncpg", "postgresql+psycopg2")

    # Local Redis (WebSockets & Queues)
    REDIS_URL: str = ""

    # Local MinIO Storage (Files)
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_SECURE: bool = False
    LOCAL_BUCKET_NAME: str = "venue-presentations"

    model_config = SettingsConfigDict(env_file=os.getenv("ENV_FILE", ".env"), env_file_encoding="utf-8", extra="ignore")

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
            if len(self.VENUE_AUTH_KEY) < 24:
                errors.append("VENUE_AUTH_KEY must be rotated")
            if len(self.VENUE_AUTH_SECRET) < 32:
                errors.append("VENUE_AUTH_SECRET must be a rotated secret of at least 32 characters")
            if not self.CLOUD_DEVICE_KEY:
                errors.append("CLOUD_DEVICE_KEY must be provisioned")
            if self.CLOUD_API_URL.startswith("http://127.0.0.1") or self.CLOUD_API_URL.startswith("http://localhost"):
                errors.append("CLOUD_API_URL must not point to localhost in production")
            if "*" in {origin.strip() for origin in self.CORS_ORIGINS.split(",")}:
                errors.append("CORS_ORIGINS must not contain a wildcard")
            if errors:
                raise ValueError("Unsafe production registration-server configuration: " + "; ".join(errors))
        return self

settings = VenueSettings()

def reload_settings() -> VenueSettings:
    global settings
    settings = VenueSettings()
    return settings
