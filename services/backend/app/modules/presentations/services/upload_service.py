# =============================================================
# Conference Platform — Upload Service
# backend/app/services/upload_service.py
#
# All file storage operations via boto3 (S3-compatible: R2 / MinIO).
#
# Responsibilities:
#   - Generate pre-signed upload URLs for direct browser → R2 uploads
#   - Generate pre-signed download URLs for secure file access
#   - Move / copy objects within buckets
#   - Delete objects
#   - Build canonical storage paths for each file type
# =============================================================

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import os
import time
from pathlib import Path
from urllib.parse import urlencode, quote
from loguru import logger

from app.config import settings
from app.database import tenant_org_id
from app.core.storage_security import create_local_storage_capability

# Local storage root from settings
LOCAL_STORAGE_ROOT = Path(settings.STORAGE_LOCAL_PATH)


def _require_tenant_org_id() -> uuid.UUID:
    organization_id = tenant_org_id.get()
    if not isinstance(organization_id, uuid.UUID):
        raise RuntimeError("Verified tenant context is required for storage operations.")
    return organization_id


def _assert_tenant_storage_path(
    storage_path: str,
    *,
    verified_organization_id: uuid.UUID | None = None,
    allow_platform: bool = False,
) -> uuid.UUID | None:
    normalized = storage_path.replace("\\", "/").lstrip("/")
    if allow_platform and normalized.startswith("platform/"):
        return None
    organization_id = verified_organization_id or _require_tenant_org_id()
    if not normalized.startswith(f"{organization_id}/"):
        raise RuntimeError("Storage object key is outside the verified tenant namespace.")
    return organization_id


# ── S3 client factory (boto3 is thread-safe at the client level) ──
def _get_s3_client():
    """
    Returns a boto3 S3 client configured for Cloudflare R2.
    R2 requires the endpoint URL and region='auto'.
    """
    kwargs = {
        "region_name": settings.S3_REGION,
        "config": Config(signature_version="s3v4"),
    }
    if settings.S3_ENDPOINT_URL:
        kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
    if settings.S3_ACCESS_KEY_ID and settings.S3_SECRET_ACCESS_KEY:
        kwargs["aws_access_key_id"] = settings.S3_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = settings.S3_SECRET_ACCESS_KEY
    return boto3.client("s3", **kwargs)


# ── Storage path builders ─────────────────────────────────────

def _safe_path_part(value: object, fallback: str) -> str:
    """
    Convert names into stable, storage-safe path segments.

    Human-readable folders are useful for local monitoring, but object keys
    still need to avoid slashes, traversal, and platform-specific characters.
    """
    text = str(value or "").strip()
    if not text:
        text = fallback
    # Convert YYYY/MM/DD date format into YYYYMMDD before converting slashes
    text = re.sub(r"(\d{4})/(\d{2})/(\d{2})", r"\1\2\3", text)
    text = re.sub(r"[\\/]+", "-", text)
    text = re.sub(r"[^A-Za-z0-9._ -]+", "", text)
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-+", "-", text)  # collapse multiple dashes
    text = text.strip(" .-_")
    return text[:120] or fallback


def _format_session_date(value: date | datetime | str | None) -> str:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if value:
        return _safe_path_part(value, "undated")
    return "undated"


def build_presentation_path(
    event_id: uuid.UUID,
    speaker_id: uuid.UUID,
    original_filename: str,
    *,
    event_name: str | None = None,
    hall_name: str | None = None,
    session_date: date | datetime | str | None = None,
    session_name: str | None = None,
    speaker_name: str | None = None,
    version: Optional[int] = None,
) -> tuple[str, str]:
    """
    Build a canonical storage path for a speaker's presentation file.
    
    If version is provided (e.g. 1), the filename becomes {name}_v01.{ext}.
    If version is None, it uses a randomly generated UUID.
    """
    name_parts = original_filename.rsplit(".", 1)
    base_name = _safe_path_part(name_parts[0], "presentation")
    ext = name_parts[-1].lower() if len(name_parts) > 1 else "bin"
    
    if version and version > 0:
        stored_filename = f"{base_name}_v{version:02d}.{ext}"
    else:
        # Default filename format should be a collision-resistant UUID
        stored_filename = f"{uuid.uuid4()}.{ext}"
        
    org_id = _require_tenant_org_id()
    prefix = f"{org_id}/"

    if any([event_name, hall_name, session_date, session_name, speaker_name]):
        storage_path = prefix + "/".join(
            [
                "presentations",
                _safe_path_part(event_name, str(event_id)),
                _safe_path_part(hall_name, "unassigned-hall"),
                _format_session_date(session_date),
                _safe_path_part(session_name, "unnamed-session"),
                _safe_path_part(speaker_name, str(speaker_id)),
                stored_filename,
            ]
        )
    else:
        storage_path = f"{prefix}presentations/{event_id}/{speaker_id}/{stored_filename}"
    return storage_path, stored_filename


def build_poster_path(
    event_id: uuid.UUID,
    speaker_id: uuid.UUID,
    original_filename: str,
    *,
    event_name: str | None = None,
    hall_name: str | None = None,
    session_name: str | None = None,
    speaker_name: str | None = None,
    version: Optional[int] = None,
) -> tuple[str, str]:
    """
    Build a canonical storage path for an ePoster.
    If version is provided, filename becomes {name}_v01.{ext}.
    """
    name_parts = original_filename.rsplit(".", 1)
    base_name = _safe_path_part(name_parts[0], "poster")
    ext = name_parts[-1].lower() if len(name_parts) > 1 else "pdf"

    if version and version > 0:
        stored_filename = f"{base_name}_v{version:02d}.{ext}"
    else:
        stored_filename = f"{base_name}.{ext}"

    org_id = _require_tenant_org_id()
    prefix = f"{org_id}/"

    if any([event_name, hall_name, session_name, speaker_name]):
        storage_path = prefix + "/".join(
            [
                "posters",
                _safe_path_part(event_name, str(event_id)),
                _safe_path_part(hall_name, "unassigned-hall"),
                _safe_path_part(session_name, "unnamed-session"),
                _safe_path_part(speaker_name, str(speaker_id)),
                stored_filename,
            ]
        )
    else:
        storage_path = f"{prefix}posters/{event_id}/{speaker_id}/{stored_filename}"

    return storage_path, stored_filename


def build_import_path(event_id: uuid.UUID, original_filename: str) -> tuple[str, str]:
    """Storage path for Excel schedule import files."""
    org_id = _require_tenant_org_id()
    prefix = f"{org_id}/"
    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else "xlsx"
    stored_filename = f"{uuid.uuid4()}.{ext}"
    storage_path = f"{prefix}imports/{event_id}/{stored_filename}"
    return storage_path, stored_filename


def build_thumbnail_path(file_id: uuid.UUID) -> str:
    """Storage path for first-slide thumbnail images."""
    org_id = _require_tenant_org_id()
    prefix = f"{org_id}/"
    return f"{prefix}thumbnails/{file_id}.webp"


# ── Pre-signed URL generation ─────────────────────────────────

def create_presigned_upload(
    *,
    bucket: str,
    storage_path: str,
    content_type: str,
    max_size_bytes: int,
    expiry_seconds: int = settings.S3_PRESIGNED_EXPIRY_SECONDS,
) -> dict:
    """
    Generate a pre-signed POST URL for direct browser-to-storage upload.

    The browser POSTs the file directly to R2 — the API server never
    handles the file bytes, keeping memory usage low.

    Returns:
        {
            "url": str,                 # POST target URL
            "fields": dict,             # Form fields to include with POST
            "storage_path": str,        # Path to record in DB
            "expires_in": int,          # Seconds until URL expires
        }
    """
    organization_id = _assert_tenant_storage_path(storage_path)
    if settings.STORAGE_MODE == "local":
        expires_at = int(time.time()) + expiry_seconds
        signature = create_local_storage_capability(
            method="PUT",
            bucket=bucket,
            key=storage_path,
            organization_id=organization_id,
            expires_at=expires_at,
        )
        query = urlencode({
            "bucket": bucket,
            "key": storage_path,
            "organization_id": str(organization_id),
            "expires_at": expires_at,
            "signature": signature,
        })
        return {
            "url": f"{settings.API_BASE_URL}{settings.api_v1_prefix}/storage/local-upload?{query}",
            "fields": {},
            "storage_path": storage_path,
            "expires_in": expiry_seconds,
        }

    s3 = _get_s3_client()
    try:
        # Generate a PUT URL instead of a POST form
        url = s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": bucket,
                "Key": storage_path,
                "ContentType": content_type,
            },
            ExpiresIn=expiry_seconds,
        )
        logger.debug(f"Generated presigned PUT URL for {bucket}/{storage_path}")
        return {
            "url": url,
            "fields": {},
            "storage_path": storage_path,
            "expires_in": expiry_seconds,
        }
    except ClientError as exc:
        logger.error(f"Failed to generate presigned POST: {exc}")
        raise RuntimeError("Could not generate upload URL. Try again later.") from exc


def create_presigned_download(
    *,
    bucket: str,
    storage_path: str,
    filename: Optional[str] = None,
    expiry_seconds: int = settings.S3_PRESIGNED_EXPIRY_SECONDS,
    inline: bool = False,
) -> str:
    """
    Generate a pre-signed GET URL for secure file download.

    Sets Content-Disposition to force a specific download filename
    when `filename` is provided.

    Returns the pre-signed URL string.
    """
    organization_id = _assert_tenant_storage_path(storage_path)
    if settings.STORAGE_MODE == "local":
        expires_at = int(time.time()) + expiry_seconds
        signature = create_local_storage_capability(
            method="GET",
            bucket=bucket,
            key=storage_path,
            organization_id=organization_id,
            expires_at=expires_at,
        )
        url = (
            f"{settings.API_BASE_URL}{settings.api_v1_prefix}/storage/"
            f"{quote(bucket, safe='')}/{quote(storage_path, safe='/')}"
        )
        params = [
            ("organization_id", str(organization_id)),
            ("expires_at", str(expires_at)),
            ("signature", signature),
        ]
        if filename:
            params.append(("filename", filename))
        if inline:
            params.append(("disposition", "inline"))
        else:
            params.append(("disposition", "attachment"))
        return url + "?" + urlencode(params)

    s3 = _get_s3_client()
    params: dict = {"Bucket": bucket, "Key": storage_path}
    if filename:
        disposition_type = "inline" if inline else "attachment"
        params["ResponseContentDisposition"] = f'{disposition_type}; filename="{filename}"'
    elif inline:
        params["ResponseContentDisposition"] = "inline"

    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=expiry_seconds,
        )
        logger.debug(f"Generated presigned GET for {bucket}/{storage_path}")
        return url
    except ClientError as exc:
        logger.error(f"Failed to generate presigned GET: {exc}")
        raise RuntimeError("Could not generate download URL.") from exc


def get_object_metadata(*, bucket: str, storage_path: str) -> dict[str, object]:
    """Return authoritative object size and content type after a direct upload."""
    _assert_tenant_storage_path(storage_path)
    if settings.STORAGE_MODE == "local":
        path = (LOCAL_STORAGE_ROOT / bucket / storage_path).resolve()
        root = (LOCAL_STORAGE_ROOT / bucket).resolve()
        if root not in path.parents or not path.is_file():
            raise FileNotFoundError("Uploaded object was not found.")
        return {"size": path.stat().st_size, "content_type": None}
    try:
        response = _get_s3_client().head_object(Bucket=bucket, Key=storage_path)
    except ClientError as exc:
        raise FileNotFoundError("Uploaded object was not found.") from exc
    return {"size": int(response.get("ContentLength", -1)), "content_type": response.get("ContentType")}


def create_presigned_presentation_upload(
    event_id: uuid.UUID,
    speaker_id: uuid.UUID,
    original_filename: str,
    content_type: str,
    max_size_mb: int = settings.MAX_FILE_SIZE_MB,
) -> dict:
    """
    Convenience wrapper: build path + generate upload URL for a presentation.

    Returns upload dict with additional `stored_filename` key.
    """
    storage_path, stored_filename = build_presentation_path(
        event_id, speaker_id, original_filename
    )
    result = create_presigned_upload(
        bucket=settings.S3_BUCKET_PRESENTATIONS,
        storage_path=storage_path,
        content_type=content_type,
        max_size_bytes=max_size_mb * 1024 * 1024,
    )
    result["stored_filename"] = stored_filename
    return result


def create_presigned_poster_upload(
    event_id: uuid.UUID,
    speaker_id: uuid.UUID,
    original_filename: str,
    max_size_mb: int = 50,
) -> dict:
    """Convenience wrapper for poster PDF uploads."""
    storage_path, stored_filename = build_poster_path(event_id, speaker_id, original_filename)
    result = create_presigned_upload(
        bucket=settings.S3_BUCKET_POSTERS,
        storage_path=storage_path,
        content_type="application/pdf",
        max_size_bytes=max_size_mb * 1024 * 1024,
    )
    result["stored_filename"] = stored_filename
    return result


def create_presigned_import_upload(
    event_id: uuid.UUID,
    original_filename: str,
) -> dict:
    """Convenience wrapper for Excel import file uploads."""
    result = create_presigned_upload(
        bucket=settings.S3_BUCKET_IMPORTS,
        storage_path=build_import_path(event_id, original_filename)[0],
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        max_size_bytes=20 * 1024 * 1024,  # 20 MB hard limit for Excel files
    )
    return result


# ── Object management ─────────────────────────────────────────

def delete_object(bucket: str, storage_path: str) -> None:
    """
    Delete a single object from storage.
    """
    if settings.STORAGE_MODE == "local":
        local_path = LOCAL_STORAGE_ROOT / bucket / storage_path
        if local_path.exists():
            local_path.unlink()
            logger.info(f"Deleted local file {local_path}")
        return

    s3 = _get_s3_client()
    try:
        s3.delete_object(Bucket=bucket, Key=storage_path)
        logger.info(f"Deleted object {bucket}/{storage_path}")
    except ClientError as exc:
        error_code = exc.response["Error"]["Code"]
        if error_code == "NoSuchKey":
            logger.debug(f"Object not found during delete (already gone): {bucket}/{storage_path}")
        else:
            logger.error(f"Failed to delete {bucket}/{storage_path}: {exc}")
            raise RuntimeError(f"Storage delete failed: {exc}") from exc


def object_exists(bucket: str, storage_path: str) -> bool:
    """
    Return True if the object exists in storage.
    """
    if settings.STORAGE_MODE == "local":
        return (LOCAL_STORAGE_ROOT / bucket / storage_path).exists()

    s3 = _get_s3_client()
    try:
        s3.head_object(Bucket=bucket, Key=storage_path)
        return True
    except ClientError as exc:
        if exc.response["Error"]["Code"] in ("404", "NoSuchKey"):
            return False
        logger.error(f"head_object error for {bucket}/{storage_path}: {exc}")
        raise


def copy_object(
    source_bucket: str,
    source_path: str,
    dest_bucket: str,
    dest_path: str,
) -> None:
    """Copy an object within or between buckets (used by venue sync staging)."""
    s3 = _get_s3_client()
    try:
        s3.copy_object(
            CopySource={"Bucket": source_bucket, "Key": source_path},
            Bucket=dest_bucket,
            Key=dest_path,
        )
        logger.info(f"Copied {source_bucket}/{source_path} → {dest_bucket}/{dest_path}")
    except ClientError as exc:
        logger.error(f"Failed to copy object: {exc}")
        raise RuntimeError("Storage copy failed.") from exc


def move_object(
    source_bucket: str,
    source_path: str,
    dest_bucket: str,
    dest_path: str,
) -> None:
    """
    Move an object by copying it to the destination and then deleting the source.
    """
    if source_path == dest_path:
        return

    if settings.STORAGE_MODE == "local":
        src = LOCAL_STORAGE_ROOT / source_bucket / source_path
        dst = LOCAL_STORAGE_ROOT / dest_bucket / dest_path
        if src.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            src.rename(dst)
            logger.info(f"Moved local file {src} → {dst}")
        return
        
    copy_object(source_bucket, source_path, dest_bucket, dest_path)
    delete_object(source_bucket, source_path)
    logger.info(f"Moved {source_bucket}/{source_path} → {dest_bucket}/{dest_path}")


def get_object_bytes(
    bucket: str,
    storage_path: str,
    *,
    verified_organization_id: uuid.UUID | None = None,
    allow_platform: bool = False,
) -> bytes:
    """
    Download and return the raw bytes of an object.
    Supports local filesystem fallback in development.
    """
    _assert_tenant_storage_path(
        storage_path,
        verified_organization_id=verified_organization_id,
        allow_platform=allow_platform,
    )
    if settings.STORAGE_MODE == "local":
        # Strategy 1: Direct combination (as saved by the app)
        local_path = (LOCAL_STORAGE_ROOT / bucket / storage_path).absolute()
        logger.debug(f"[Storage] Seeking file (Strategy 1): {local_path}")
        if local_path.exists():
            return local_path.read_bytes()
        
        # Strategy 2: Single bucket nesting (avoiding double bucket)
        if storage_path.startswith(f"{bucket}/") or storage_path.startswith(f"{bucket}\\"):
            alt_path = (LOCAL_STORAGE_ROOT / storage_path).absolute()
            logger.debug(f"[Storage] Seeking file (Strategy 2): {alt_path}")
            if alt_path.exists():
                return alt_path.read_bytes()

        # Strategy 3: Normalized path (handling mixed slashes)
        norm_path = storage_path.replace("\\", "/").strip("/")
        if norm_path.startswith(f"{bucket}/"):
            norm_path = norm_path[len(bucket)+1:] # strip bucket prefix
        
        final_path = (LOCAL_STORAGE_ROOT / bucket / norm_path).absolute()
        logger.debug(f"[Storage] Seeking file (Strategy 3): {final_path}")
        if final_path.exists():
            return final_path.read_bytes()

        raise RuntimeError(f"Local file not found: {storage_path}")
        
    s3 = _get_s3_client()
    try:
        response = s3.get_object(Bucket=bucket, Key=storage_path)
        return response["Body"].read()
    except ClientError as exc:
        logger.error(f"Failed to download {bucket}/{storage_path}: {exc}")
        raise RuntimeError("Could not retrieve file from storage.") from exc


def upload_bytes(
    bucket: str,
    storage_path: str,
    data: bytes,
    content_type: str = "application/octet-stream",
    *,
    verified_organization_id: uuid.UUID | None = None,
    allow_platform: bool = False,
) -> None:
    """
    Upload raw bytes to storage.
    Supports local filesystem fallback in development.
    """
    _assert_tenant_storage_path(
        storage_path,
        verified_organization_id=verified_organization_id,
        allow_platform=allow_platform,
    )
    if settings.STORAGE_MODE == "local":
        local_path = LOCAL_STORAGE_ROOT / bucket / storage_path
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(data)
        logger.debug(f"Saved {len(data)} bytes to local storage: {local_path}")
        return

    s3 = _get_s3_client()
    try:
        s3.put_object(
            Bucket=bucket,
            Key=storage_path,
            Body=data,
            ContentType=content_type,
        )
        logger.debug(f"Uploaded {len(data)} bytes to {bucket}/{storage_path}")
    except ClientError as exc:
        logger.error(f"Failed to upload bytes to {bucket}/{storage_path}: {exc}")
        raise RuntimeError("Storage upload failed.") from exc
