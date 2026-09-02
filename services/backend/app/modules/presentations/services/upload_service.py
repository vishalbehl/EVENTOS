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
from contextlib import contextmanager
from datetime import date, datetime
from typing import Iterator, Optional, Iterator as IteratorType, TypeVar

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import os
import time
import shutil
from pathlib import Path
from urllib.parse import urlencode, quote
from loguru import logger

from app.config import settings
from app.database import tenant_org_id
from app.core.storage_security import create_local_storage_capability
from app.core.prometheus_metrics import observe_storage

# Local storage root from settings
LOCAL_STORAGE_ROOT = Path(settings.STORAGE_LOCAL_PATH)
_StorageResult = TypeVar("_StorageResult")


@contextmanager
def _storage_operation(operation: str) -> IteratorType[None]:
    """Measure one storage operation while keeping telemetry best effort."""
    started = time.perf_counter()
    outcome = "success"
    try:
        yield
    except FileNotFoundError:
        outcome = "not_found"
        raise
    except (ClientError, TimeoutError, OSError):
        outcome = "failure"
        raise
    except Exception:
        outcome = "failure"
        raise
    finally:
        observe_storage(operation, outcome, (time.perf_counter() - started) * 1000)


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
    canonical_prefix = f"tenant/{organization_id}/"
    legacy_prefix = f"{organization_id}/"
    if not normalized.startswith((canonical_prefix, legacy_prefix)):
        raise RuntimeError("Storage object key is outside the verified tenant namespace.")
    return organization_id


# ── S3 client factory (boto3 is thread-safe at the client level) ──
def _get_s3_client(*, for_presigned_url: bool = False):
    """
    Returns a boto3 S3 client configured for Cloudflare R2.
    R2 requires the endpoint URL and region='auto'.
    """
    kwargs = {
        "region_name": settings.S3_REGION,
        "config": Config(
            signature_version="s3v4",
            connect_timeout=settings.STORAGE_CONNECT_TIMEOUT_SECONDS,
            read_timeout=settings.STORAGE_READ_TIMEOUT_SECONDS,
            max_pool_connections=settings.STORAGE_MAX_CONNECTIONS,
            retries={"mode": "standard", "max_attempts": settings.STORAGE_MAX_RETRIES},
        ),
    }
    endpoint_url = settings.S3_ENDPOINT_URL
    if for_presigned_url and settings.S3_PUBLIC_ENDPOINT_URL:
        endpoint_url = settings.S3_PUBLIC_ENDPOINT_URL
    if endpoint_url:
        kwargs["endpoint_url"] = endpoint_url
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

    # Sign against the endpoint the client can reach. Object verification and
    # server-side operations continue to use the private endpoint.
    s3 = _get_s3_client(for_presigned_url=True)
    try:
        with _storage_operation("presign_upload"):
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
        logger.debug("Generated presigned PUT URL")
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
    verified_organization_id: uuid.UUID | None = None,
) -> str:
    """
    Generate a pre-signed GET URL for secure file download.

    Sets Content-Disposition to force a specific download filename
    when `filename` is provided.

    Returns the pre-signed URL string.
    """
    organization_id = _assert_tenant_storage_path(
        storage_path,
        verified_organization_id=verified_organization_id,
    )
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

    # A presigned URL signs its Host header, so the public endpoint must be
    # selected before signing rather than rewritten after the fact.
    s3 = _get_s3_client(for_presigned_url=True)
    params: dict = {"Bucket": bucket, "Key": storage_path}
    if filename:
        disposition_type = "inline" if inline else "attachment"
        params["ResponseContentDisposition"] = f'{disposition_type}; filename="{filename}"'
    elif inline:
        params["ResponseContentDisposition"] = "inline"

    try:
        with _storage_operation("presign_download"):
            url = s3.generate_presigned_url(
                "get_object",
                Params=params,
                ExpiresIn=expiry_seconds,
            )
        logger.debug("Generated presigned GET URL")
        return url
    except ClientError as exc:
        logger.error(f"Failed to generate presigned GET: {exc}")
        raise RuntimeError("Could not generate download URL.") from exc


def get_object_metadata(
    *,
    bucket: str,
    storage_path: str,
    verified_organization_id: uuid.UUID | None = None,
) -> dict[str, object]:
    """Return authoritative object size and content type after a direct upload."""
    _assert_tenant_storage_path(
        storage_path,
        verified_organization_id=verified_organization_id,
    )
    if settings.STORAGE_MODE == "local":
        path = (LOCAL_STORAGE_ROOT / bucket / storage_path).resolve()
        root = (LOCAL_STORAGE_ROOT / bucket).resolve()
        if root not in path.parents or not path.is_file():
            raise FileNotFoundError("Uploaded object was not found.")
        return {"size": path.stat().st_size, "content_type": None}
    try:
        with _storage_operation("head_object"):
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
            logger.info("Deleted local storage object")
        return

    s3 = _get_s3_client()
    try:
        with _storage_operation("delete_object"):
            s3.delete_object(Bucket=bucket, Key=storage_path)
        logger.info("Deleted storage object")
    except ClientError as exc:
        error_code = exc.response["Error"]["Code"]
        if error_code == "NoSuchKey":
            logger.debug("Storage object was already absent during delete")
        else:
            logger.error("Storage delete failed: {}", type(exc).__name__)
            raise RuntimeError("Storage delete failed.") from exc


def object_exists(bucket: str, storage_path: str) -> bool:
    """
    Return True if the object exists in storage.
    """
    if settings.STORAGE_MODE == "local":
        return (LOCAL_STORAGE_ROOT / bucket / storage_path).exists()

    s3 = _get_s3_client()
    try:
        with _storage_operation("head_object"):
            s3.head_object(Bucket=bucket, Key=storage_path)
        return True
    except ClientError as exc:
        if exc.response["Error"]["Code"] in ("404", "NoSuchKey"):
            return False
        logger.error("Storage metadata lookup failed: {}", type(exc).__name__)
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
        with _storage_operation("copy_object"):
            s3.copy_object(
                CopySource={"Bucket": source_bucket, "Key": source_path},
                Bucket=dest_bucket,
                Key=dest_path,
            )
        logger.info("Copied storage object")
    except ClientError as exc:
        logger.error("Storage copy failed: {}", type(exc).__name__)
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
    logger.info("Moved storage object")


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
        logger.debug("Seeking local storage object")
        if local_path.exists():
            return local_path.read_bytes()
        
        # Strategy 2: Single bucket nesting (avoiding double bucket)
        if storage_path.startswith(f"{bucket}/") or storage_path.startswith(f"{bucket}\\"):
            alt_path = (LOCAL_STORAGE_ROOT / storage_path).absolute()
            logger.debug("Seeking local storage fallback object")
            if alt_path.exists():
                return alt_path.read_bytes()

        # Strategy 3: Normalized path (handling mixed slashes)
        norm_path = storage_path.replace("\\", "/").strip("/")
        if norm_path.startswith(f"{bucket}/"):
            norm_path = norm_path[len(bucket)+1:] # strip bucket prefix
        
        final_path = (LOCAL_STORAGE_ROOT / bucket / norm_path).absolute()
        logger.debug("Seeking normalized local storage object")
        if final_path.exists():
            return final_path.read_bytes()

        raise RuntimeError(f"Local file not found: {storage_path}")
        
    s3 = _get_s3_client()
    try:
        with _storage_operation("get_object"):
            response = s3.get_object(Bucket=bucket, Key=storage_path)
        return response["Body"].read()
    except ClientError as exc:
        logger.error("Storage download failed: {}", type(exc).__name__)
        raise RuntimeError("Could not retrieve file from storage.") from exc


def iter_object_chunks(
    bucket: str,
    storage_path: str,
    *,
    verified_organization_id: uuid.UUID | None = None,
    allow_platform: bool = False,
    chunk_size: int = 1024 * 1024,
) -> Iterator[bytes]:
    """Yield an object in bounded chunks for workers and streaming consumers.

    This deliberately keeps the synchronous boto3 boundary synchronous. Celery
    workers can consume it directly, while API callers should continue to use
    presigned URLs instead of proxying large objects through FastAPI.
    """
    if chunk_size < 1:
        raise ValueError("chunk_size must be positive")
    _assert_tenant_storage_path(
        storage_path,
        verified_organization_id=verified_organization_id,
        allow_platform=allow_platform,
    )
    if settings.STORAGE_MODE == "local":
        candidates = [
            (LOCAL_STORAGE_ROOT / bucket / storage_path).resolve(),
            (LOCAL_STORAGE_ROOT / storage_path).resolve(),
        ]
        normalized = storage_path.replace("\\", "/").strip("/")
        if normalized.startswith(f"{bucket}/"):
            candidates.append((LOCAL_STORAGE_ROOT / bucket / normalized[len(bucket) + 1:]).resolve())
        root = (LOCAL_STORAGE_ROOT / bucket).resolve()
        path = next((candidate for candidate in candidates if candidate.is_file() and root in candidate.parents), None)
        if path is None:
            raise RuntimeError(f"Local file not found: {storage_path}")
        with path.open("rb") as handle:
            while chunk := handle.read(chunk_size):
                yield chunk
        return

    try:
        with _storage_operation("stream_object"):
            response = _get_s3_client().get_object(Bucket=bucket, Key=storage_path)
        body = response["Body"]
        try:
            while chunk := body.read(chunk_size):
                yield chunk
        finally:
            body.close()
    except ClientError as exc:
        logger.error("Storage stream failed: {}", type(exc).__name__)
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
        logger.debug("Saved {} bytes to local storage", len(data))
        return

    s3 = _get_s3_client()
    try:
        with _storage_operation("put_object"):
            s3.put_object(
                Bucket=bucket,
                Key=storage_path,
                Body=data,
                ContentType=content_type,
            )
        logger.debug("Uploaded {} bytes to storage", len(data))
    except ClientError as exc:
        logger.error("Storage upload failed: {}", type(exc).__name__)
        raise RuntimeError("Storage upload failed.") from exc


def upload_fileobj(
    bucket: str,
    storage_path: str,
    fileobj,
    content_type: str = "application/octet-stream",
    *,
    verified_organization_id: uuid.UUID | None = None,
    allow_platform: bool = False,
) -> None:
    """Upload a seekable file object without materializing it in memory."""
    _assert_tenant_storage_path(
        storage_path,
        verified_organization_id=verified_organization_id,
        allow_platform=allow_platform,
    )
    if settings.STORAGE_MODE == "local":
        local_path = LOCAL_STORAGE_ROOT / bucket / storage_path
        local_path.parent.mkdir(parents=True, exist_ok=True)
        with _storage_operation("upload_fileobj"), local_path.open("wb") as destination:
            shutil.copyfileobj(fileobj, destination, length=1024 * 1024)
        return

    try:
        with _storage_operation("upload_fileobj"):
            _get_s3_client().upload_fileobj(
                fileobj,
                bucket,
                storage_path,
                ExtraArgs={"ContentType": content_type},
            )
    except ClientError as exc:
        logger.error("Storage file-object upload failed: {}", type(exc).__name__)
        raise RuntimeError("Storage upload failed.") from exc
