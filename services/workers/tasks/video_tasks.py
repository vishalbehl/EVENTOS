# =============================================================
# Conference Platform — Video Processing Tasks
# workers/tasks/video_tasks.py
#
# Celery tasks for video files:
#   1. normalise_video_file — transcode to H.264/AAC MP4
#   2. extract_video_metadata — store duration, codec, resolution
# =============================================================

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from celery.utils.log import get_task_logger

from workers.celery_app import app
from workers.config import settings
from workers.db import get_db_session
from workers.lib.r2_client import r2
from workers.lib.ffmpeg_wrapper import normalise_video, get_video_metadata
from workers.tasks.file_tasks import generate_file_thumbnail

logger = get_task_logger(__name__)

try:
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.presentations.models.file_validation import FileValidation
except ImportError as e:
    logger.critical(f"Cannot import backend models: {e}")
    raise


@app.task(
    bind=True,
    name="workers.tasks.video_tasks.normalise_video_file",
    max_retries=2,
    default_retry_delay=120,
    soft_time_limit=900,   # 15 min soft kill
    time_limit=960,        # 16 min hard kill
)
def normalise_video_file(self, file_id: str) -> dict:
    """
    Re-encode a video file to H.264/AAC MP4 at max 1080p.

    This replaces the original uploaded file in R2 with the
    normalised version to ensure venue playback compatibility.

    Args:
        file_id: UUID string of the PresentationFile record.
    """
    file_uuid = uuid.UUID(file_id)
    logger.info(f"[video-norm] Starting normalisation for file {file_id}")

    with get_db_session() as db:
        pf: PresentationFile | None = db.get(PresentationFile, file_uuid)
        if pf is None:
            return {"error": "File record not found."}

        fmt = (pf.file_format or "").lower()
        if fmt not in ("mp4", "mov", "avi", "mkv"):
            logger.info(f"[video-norm] Format '{fmt}' not a video — skipping.")
            return {"file_id": file_id, "skipped": True}

        # Download original
        try:
            original_data = r2.download_bytes(
                settings.S3_BUCKET_PRESENTATIONS, pf.storage_path
            )
        except Exception as exc:
            raise self.retry(exc=exc)

        # Extract metadata before encoding
        meta = get_video_metadata(original_data)
        if meta:
            _store_video_metadata(db, pf, meta)
            db.commit()

        # Normalise
        normalised = normalise_video(original_data)
        if normalised is None:
            logger.warning(f"[video-norm] FFmpeg unavailable or failed for {file_id}.")
            return {"file_id": file_id, "normalised": False}

        # Replace in R2 (same key — atomically overwrite)
        r2.upload_bytes(
            bucket=settings.S3_BUCKET_PRESENTATIONS,
            key=pf.storage_path,
            data=normalised,
            content_type="video/mp4",
            metadata={"normalised": "true", "file_id": file_id},
        )

        # Update file record size (format stays mp4)
        pf.file_size_bytes = len(normalised)
        pf.file_format = "mp4"
        db.commit()

        logger.info(
            f"[video-norm] Done: {len(original_data):,} → {len(normalised):,} bytes"
        )

        # Chain thumbnail generation
        generate_file_thumbnail.delay(file_id)

        return {
            "file_id": file_id,
            "normalised": True,
            "original_bytes": len(original_data),
            "normalised_bytes": len(normalised),
        }


@app.task(
    name="workers.tasks.video_tasks.extract_video_metadata",
)
def extract_video_metadata(file_id: str) -> dict:
    """
    Extract and persist video metadata for display in Command Center.
    Non-destructive — does not modify the stored file.
    """
    file_uuid = uuid.UUID(file_id)

    with get_db_session() as db:
        pf: PresentationFile | None = db.get(PresentationFile, file_uuid)
        if pf is None:
            return {"error": "File not found."}

        try:
            data = r2.download_bytes(settings.S3_BUCKET_PRESENTATIONS, pf.storage_path)
        except Exception as exc:
            logger.error(f"[video-meta] Download failed: {exc}")
            return {"error": str(exc)}

        meta = get_video_metadata(data)
        if meta is None:
            return {"file_id": file_id, "metadata_extracted": False}

        _store_video_metadata(db, pf, meta)
        db.commit()

        return {
            "file_id": file_id,
            "duration_seconds": meta.duration_seconds,
            "width": meta.width,
            "height": meta.height,
            "video_codec": meta.video_codec,
            "bit_rate_kbps": meta.bit_rate_kbps,
        }


# ── Helper ────────────────────────────────────────────────────

def _store_video_metadata(db, pf: PresentationFile, meta) -> None:
    """Write video metadata into the FileValidation extra_metadata JSON."""
    existing_fv = (
        db.query(FileValidation)
        .filter(FileValidation.file_id == pf.id)
        .order_by(FileValidation.validated_at.desc())
        .first()
    )
    video_info = {
        "duration_seconds": meta.duration_seconds,
        "width": meta.width,
        "height": meta.height,
        "video_codec": meta.video_codec,
        "audio_codec": meta.audio_codec,
        "bit_rate_kbps": meta.bit_rate_kbps,
        "frame_rate": meta.frame_rate,
    }
    if existing_fv:
        current = dict(existing_fv.extra_metadata or {})
        current.update(video_info)
        existing_fv.extra_metadata = current
    else:
        fv = FileValidation(
            file_id=pf.id,
            engine_version=settings.VALIDATION_ENGINE_VERSION,
            is_valid=True,
            errors=[],
            warnings=[],
            validated_at=datetime.now(timezone.utc),
            extra_metadata=video_info,
        )
        db.add(fv)
