from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class VenueSettings(BaseSettings):
    # Core Server
    ENV: str = "development"
    PORT: int = 8001
    HOST: str = "0.0.0.0"

    # Security (Local Auth Key for Kiosks/Displays)
    VENUE_AUTH_KEY: str = "venue_secret_key"  # Displays must provide this key to connect

    # Cloud Connection (Where to sync from)
    CLOUD_API_URL: str = "http://localhost:8000"
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

settings = VenueSettings()
