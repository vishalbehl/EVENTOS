# =============================================================
# Conference Platform — Workers Configuration
# workers/config.py
#
# Standalone settings module for the Celery worker process.
# Workers run in a separate container and DO NOT import from
# the backend app package. Settings are duplicated intentionally
# to keep the worker container dependency-light.
# =============================================================

from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

# .env lives one directory above workers/
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class WorkerSettings(BaseSettings):
    # ── Database (sync psycopg2 — workers use sync SQLAlchemy) ─
    DATABASE_URL_SYNC: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/eventos_db"

    # ── Redis / Celery ─────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # ── Cloud Storage (R2 / S3) ────────────────────────────────
    S3_ENDPOINT_URL: str = ""
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    S3_BUCKET_PRESENTATIONS: str = "presentations"
    S3_BUCKET_POSTERS: str = "posters"
    S3_BUCKET_THUMBNAILS: str = "thumbnails"
    S3_BUCKET_IMPORTS: str = "imports"
    S3_BUCKET_EXPORTS: str = "exports"
    S3_REGION: str = "auto"

    # ── Email (Resend) ─────────────────────────────────────────
    RESEND_API_KEY: str = ""
    EMAIL_FROM_ADDRESS: str = "noreply@conf-platform.com"
    EMAIL_FROM_NAME: str = "EventOS IT"

    # ── WhatsApp (Meta Cloud API) ──────────────────────────────
    WHATSAPP_API_URL: str = "https://graph.facebook.com/v18.0"
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_ACCESS_TOKEN: str = ""

    # ── File validation ───────────────────────────────────────────
    VALIDATION_ENGINE_VERSION: str = "1.0.0"

    # ── File processing ────────────────────────────────────────
    # Max video resolution to normalise to (width x height)
    VIDEO_MAX_WIDTH: int = 1920
    VIDEO_MAX_HEIGHT: int = 1080
    VIDEO_TARGET_BITRATE: str = "4M"
    VIDEO_TARGET_CODEC: str = "libx264"
    VIDEO_TARGET_AUDIO_CODEC: str = "aac"

    # Thumbnail image dimensions
    THUMBNAIL_WIDTH: int = 960
    THUMBNAIL_HEIGHT: int = 540
    THUMBNAIL_FORMAT: str = "WEBP"
    THUMBNAIL_QUALITY: int = 85

    # ── Upload portal base URL (for email links) ───────────────
    UPLOAD_PORTAL_BASE_URL: str = "https://upload.conf-platform.com"

    # ── WebSocket backend URL (cloud FastAPI) ──────────────────
    BACKEND_WS_URL: str = "http://localhost:8000"
    BACKEND_INTERNAL_API_KEY: str = ""   # shared secret for machine-to-machine calls

    # ── Venue sync ─────────────────────────────────────────────
    VENUE_SERVER_URLS: str = ""  # comma-separated: http://venue1:8100,http://venue2:8100
    VENUE_SYNC_TIMEOUT_SECONDS: int = 30
    VENUE_FILE_SYNC_CONCURRENCY: int = 4  # parallel downloads to venue

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def venue_server_list(self) -> List[str]:
        return [u.strip() for u in self.VENUE_SERVER_URLS.split(",") if u.strip()]

    @property
    def s3_public(self) -> bool:
        return bool(self.S3_ENDPOINT_URL)


settings = WorkerSettings()
