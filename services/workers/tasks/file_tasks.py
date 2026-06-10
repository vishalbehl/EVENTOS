# =============================================================
# Conference Platform — File Validation Tasks
# workers/tasks/file_tasks.py
#
# Celery tasks triggered when a speaker uploads a presentation.
#
# Flow:
#   1. validate_presentation_file  ← called immediately on upload
#      - Downloads file from R2
#      - Runs PPTX / PDF / video validation
#      - Writes FileValidation record to DB
#      - Updates PresentationFile.upload_status
#
#   2. generate_file_thumbnail  ← called after validation passes
#      - Generates WEBP thumbnail
#      - Uploads to thumbnails bucket
#      - Updates PresentationFile.thumbnail_url
#
#   3. convert_presentation_to_pdf  ← optional, for preview
#      - Converts PPTX → PDF via LibreOffice
#      - Uploads PDF to thumbnails bucket (as pdf/ prefix)
#      - Updates PresentationFile.pdf_preview_url
# =============================================================

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from celery import shared_task
from celery.utils.log import get_task_logger
from sqlalchemy.orm import Session

from workers.celery_app import app
from workers.db import get_db_session
from workers.lib.r2_client import r2
from workers.lib.pptx_validator import validate_pptx
from workers.lib.malware_scanner import scan_office_file
from workers.lib.thumbnail_generator import (
    generate_pptx_thumbnail,
    generate_pdf_thumbnail,
    generate_video_thumbnail,
)
from workers.lib.libreoffice_converter import convert_to_pdf
from workers.config import settings

logger = get_task_logger(__name__)

# Import models using the backend package (shared between processes)
# Workers are expected to have the backend on PYTHONPATH.
try:
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.presentations.models.file_validation import FileValidation
except ImportError as e:
    logger.critical(f"Cannot import backend models: {e}")
    raise


# ── Task 1: Validate ──────────────────────────────────────────

@app.task(
    bind=True,
    name="workers.tasks.file_tasks.validate_presentation_file",
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
def validate_presentation_file(self, file_id: str) -> dict:
    """
    Download and validate a presentation file.

    Args:
        file_id: UUID string of the PresentationFile record.

    Returns:
        dict with keys: is_valid, errors, warnings, slide_count.
    """
    file_uuid = uuid.UUID(file_id)
    logger.info(f"[validate] Starting validation for file {file_id}")

    with get_db_session() as db:
        pf: PresentationFile | None = db.get(PresentationFile, file_uuid)
        if pf is None:
            logger.error(f"[validate] PresentationFile {file_id} not found.")
            return {"error": "File record not found."}

        # Mark as processing
        pf.upload_status = "validating"
        db.commit()

        # Download from R2
        try:
            data = r2.download_bytes(settings.S3_BUCKET_PRESENTATIONS, pf.storage_path)
        except Exception as exc:
            _mark_failed(db, pf, str(exc))
            raise self.retry(exc=exc)

        # Dispatch to correct validator
        fmt = (pf.file_format or "").lower()
        errors: list[str] = []
        warnings: list[str] = []
        slide_count: int = 0
        validation_fields: dict = {}

        if fmt in ("pptx", "ppt"):
            malware_scan = scan_office_file(data)
            result = validate_pptx(data)
            errors = [*malware_scan.threats, *result.errors]
            warnings = result.warnings
            slide_count = result.slide_count
            extra_meta = {
                "has_embedded_video": result.has_embedded_video,
                "has_embedded_audio": result.has_embedded_audio,
                "aspect_ratio": result.aspect_ratio,
                "missing_fonts": result.missing_fonts,
            }
            has_missing_fonts = bool(result.missing_fonts)
            validation_fields = {
                "has_missing_fonts": has_missing_fonts,
                "missing_fonts_list": result.missing_fonts or None,
                "has_unsupported_video": False,
                "has_corrupted_slides": not result.is_valid,
                "has_large_images": False,
                "has_animations": result.has_animations,
                "has_transitions": result.has_transitions,
                "notes_present": result.notes_present,
                "notes_slide_count": result.notes_slide_count,
                "has_ole_objects": result.has_ole_objects,
                "has_broken_ole": result.has_broken_ole,
                "audio_objects_detected": result.audio_objects_detected,
                "audio_format_valid": result.audio_format_valid,
                "internet_dependent_content": result.internet_dependent_content,
                "external_url_count": result.external_url_count,
                "has_broken_internal_media": result.has_broken_internal_media,
                "has_custom_addins": result.has_custom_addins,
                "has_macros": result.has_macros or malware_scan.has_macros,
                "pdf_fallback_forced": has_missing_fonts,
                "linked_assets_detected": result.linked_assets_detected,
                "linked_assets_resolved": result.linked_assets_resolved,
                "image_links_detected": result.image_links_detected,
                "absolute_path_links_detected": result.absolute_path_links_detected,
            }
        elif fmt == "pdf":
            # Basic PDF check — just try opening with PyMuPDF if available
            errors, warnings, extra_meta = _validate_pdf(data)
        elif fmt in ("mp4", "mov"):
            errors, warnings, extra_meta = _validate_video(data)
        else:
            warnings.append(f"Unsupported format '{fmt}' — skipping deep validation.")
            extra_meta = {}

        is_valid = len(errors) == 0
        new_status = "pending_approval" if is_valid else "validation_failed"

        # Persist FileValidation record
        fv = FileValidation(
            file_id=pf.id,
            validation_engine_version=settings.VALIDATION_ENGINE_VERSION,
            slide_count=slide_count if slide_count else None,
            overall_result="pass" if is_valid and not warnings else "warning" if is_valid else "fail",
            error_details={"errors": errors, "warnings": warnings, "extra_metadata": extra_meta},
            validated_at=datetime.now(timezone.utc),
            **validation_fields,
        )
        db.add(fv)
        pf.upload_status = new_status
        db.commit()

        logger.info(
            f"[validate] file={file_id} status={new_status} "
            f"errors={len(errors)} warnings={len(warnings)}"
        )

        # Chain: if valid, generate thumbnail
        if is_valid:
            generate_file_thumbnail.delay(file_id)

        return {
            "file_id": file_id,
            "is_valid": is_valid,
            "errors": errors,
            "warnings": warnings,
            "slide_count": slide_count,
        }


# ── Task 2: Thumbnail ─────────────────────────────────────────

@app.task(
    bind=True,
    name="workers.tasks.file_tasks.generate_file_thumbnail",
    max_retries=2,
    default_retry_delay=30,
)
def generate_file_thumbnail(self, file_id: str) -> dict:
    """Generate and upload a WEBP thumbnail for a presentation file."""
    file_uuid = uuid.UUID(file_id)
    logger.info(f"[thumbnail] Generating thumbnail for file {file_id}")

    with get_db_session() as db:
        pf: PresentationFile | None = db.get(PresentationFile, file_uuid)
        if pf is None:
            return {"error": "File record not found."}

        try:
            data = r2.download_bytes(settings.S3_BUCKET_PRESENTATIONS, pf.storage_path)
        except Exception as exc:
            raise self.retry(exc=exc)

        fmt = (pf.file_format or "").lower()
        thumb_bytes: bytes | None = None

        if fmt in ("pptx", "ppt"):
            thumb_bytes = generate_pptx_thumbnail(data)
        elif fmt == "key":
            # Convert Keynote to PDF first, then generate thumbnail from PDF
            pdf_data = convert_to_pdf(data, source_ext="key")
            if pdf_data:
                thumb_bytes = generate_pdf_thumbnail(pdf_data)
        elif fmt == "pdf":
            thumb_bytes = generate_pdf_thumbnail(data)
        elif fmt in ("mp4", "mov"):
            thumb_bytes = generate_video_thumbnail(data)

        if thumb_bytes is None:
            logger.warning(f"[thumbnail] No thumbnail generated for {file_id}")
            return {"file_id": file_id, "thumbnail_generated": False}

        # Upload to thumbnails bucket
        thumb_key = f"thumbnails/{pf.id}.webp"
        r2.upload_bytes(
            bucket=settings.S3_BUCKET_THUMBNAILS,
            key=thumb_key,
            data=thumb_bytes,
            content_type="image/webp",
        )

        # Store public URL or key reference
        pf.thumbnail_url = thumb_key
        db.commit()

        logger.info(f"[thumbnail] Thumbnail uploaded: {thumb_key}")
        return {"file_id": file_id, "thumbnail_key": thumb_key, "thumbnail_generated": True}


# ── Task 3: PDF Preview ───────────────────────────────────────

@app.task(
    bind=True,
    name="workers.tasks.file_tasks.convert_presentation_to_pdf",
    max_retries=2,
    default_retry_delay=60,
)
def convert_presentation_to_pdf(self, file_id: str) -> dict:
    """Convert a PPTX/PPT to PDF for browser preview in Command Center."""
    file_uuid = uuid.UUID(file_id)
    logger.info(f"[pdf-convert] Starting PDF conversion for file {file_id}")

    with get_db_session() as db:
        pf: PresentationFile | None = db.get(PresentationFile, file_uuid)
        if pf is None:
            return {"error": "File record not found."}

        fmt = (pf.file_format or "").lower()
        if fmt not in ("pptx", "ppt", "key"):
            return {"file_id": file_id, "skipped": True, "reason": f"Format '{fmt}' not convertible."}

        try:
            data = r2.download_bytes(settings.S3_BUCKET_PRESENTATIONS, pf.storage_path)
        except Exception as exc:
            raise self.retry(exc=exc)

        pdf_data = convert_to_pdf(data, source_ext=fmt)
        if pdf_data is None:
            logger.warning(f"[pdf-convert] Conversion returned None for {file_id}.")
            return {"file_id": file_id, "converted": False}

        pdf_key = f"pdf_previews/{pf.id}.pdf"
        r2.upload_bytes(
            bucket=settings.S3_BUCKET_THUMBNAILS,
            key=pdf_key,
            data=pdf_data,
            content_type="application/pdf",
        )

        # Store on file record (field added in future migration)
        if hasattr(pf, "pdf_preview_url"):
            pf.pdf_preview_url = pdf_key
            db.commit()

        logger.info(f"[pdf-convert] PDF uploaded: {pdf_key}")
        return {"file_id": file_id, "converted": True, "pdf_key": pdf_key}


# ── Private helpers ───────────────────────────────────────────

def _validate_pdf(data: bytes) -> tuple[list, list, dict]:
    errors: list[str] = []
    warnings: list[str] = []
    meta: dict = {}
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=data, filetype="pdf")
        meta["page_count"] = len(doc)
        if len(doc) == 0:
            errors.append("PDF has no pages.")
        doc.close()
    except ImportError:
        warnings.append("PyMuPDF not available — PDF page count not verified.")
    except Exception as exc:
        errors.append(f"PDF appears corrupt: {exc}")
    return errors, warnings, meta


def _validate_video(data: bytes) -> tuple[list, list, dict]:
    from workers.lib.ffmpeg_wrapper import get_video_metadata
    errors: list[str] = []
    warnings: list[str] = []
    meta: dict = {}
    m = get_video_metadata(data)
    if m is None:
        warnings.append("Could not extract video metadata (FFmpeg unavailable).")
        return errors, warnings, meta
    meta = {
        "duration_seconds": m.duration_seconds,
        "width": m.width,
        "height": m.height,
        "video_codec": m.video_codec,
        "audio_codec": m.audio_codec,
        "bit_rate_kbps": m.bit_rate_kbps,
    }
    if m.duration_seconds > 60 * 90:
        warnings.append("Video is longer than 90 minutes — please confirm this is correct.")
    if m.video_codec not in ("h264", "hevc", "vp9", "av1"):
        warnings.append(
            f"Codec '{m.video_codec}' may not be supported on all venue PCs. "
            "H.264 (MP4) is recommended."
        )
    return errors, warnings, meta


def _mark_failed(db: Session, pf: PresentationFile, reason: str) -> None:
    pf.upload_status = "validation_failed"
    fv = FileValidation(
        file_id=pf.id,
        validation_engine_version=settings.VALIDATION_ENGINE_VERSION,
        overall_result="fail",
        error_details={"errors": [f"Download failed: {reason}"], "warnings": []},
        validated_at=datetime.now(timezone.utc),
    )
    db.add(fv)
    db.commit()


@app.task(
    bind=True,
    name="workers.tasks.file_tasks.scan_file_for_viruses",
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
def scan_file_for_viruses(self, asset_id: str) -> dict:
    """
    Downloads the file from storage and simulates a ClamAV scan.
    Flags standard eicar threat files.
    """
    asset_uuid = uuid.UUID(asset_id)
    logger.info(f"[virus-scan] Starting scan for asset {asset_id}")

    from app.modules.files.models.file import Asset, VirusScan
    from workers.db import get_db_session
    from workers.lib.r2_client import r2

    with get_db_session() as db:
        asset: Asset | None = db.get(Asset, asset_uuid)
        if asset is None:
            logger.error(f"[virus-scan] Asset {asset_id} not found.")
            return {"error": "Asset not found."}

        # Create VirusScan record as pending
        scan = VirusScan(
            id=uuid.uuid4(),
            asset_id=asset_uuid,
            status="pending",
            scanned_at=datetime.now(timezone.utc),
        )
        db.add(scan)
        db.commit()

        try:
            # Download file bytes
            data = r2.download_bytes(settings.S3_BUCKET_ASSETS, asset.file_path)
        except Exception as exc:
            scan.status = "error"
            scan.scan_result = f"Download failed: {exc}"
            db.commit()
            raise self.retry(exc=exc)

        # Look for standard eicar signature
        eicar_signature = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
        if eicar_signature in data or b"eicar" in asset.name.lower().encode() or b"virus" in asset.name.lower().encode():
            scan.status = "infected"
            scan.scan_result = "Threat detected: EICAR Standard Antivirus Test Signature"
            logger.warning(f"[virus-scan] Asset {asset_id} is INFECTED!")
        else:
            scan.status = "clean"
            scan.scan_result = "Scan complete. No threats detected."
            logger.info(f"[virus-scan] Asset {asset_id} is clean.")

        scan.scanned_at = datetime.now(timezone.utc)
        db.commit()

        return {
            "asset_id": asset_id,
            "status": scan.status,
            "result": scan.scan_result,
        }

