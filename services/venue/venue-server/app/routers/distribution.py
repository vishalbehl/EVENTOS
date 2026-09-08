"""Target-driven, checksum-acknowledged presentation delivery protocol."""

import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_database
from app.config import settings
from app.models.operational_control import VenueAssetTransfer
from app.models.presentation_file import PresentationFile
from app.models.room_device import RoomDevice
from app.models.srr_station import SRRStation
from app.routers.srr import as_uuid
from app.routers.auth import DeviceAuth, require_operator, require_viewer, resolve_srr_device_credential, validate_room_device_credential
from app.runtime_events import record_runtime_event


router = APIRouter(prefix="/api/v1/venue/distribution", tags=["distribution"])
LEASE_SECONDS = 90


async def verify_target_device(
    venue_key: str | None = Header(default=None, alias="X-Venue-Key"),
    device_token: str | None = Header(default=None, alias="X-Device-Token"),
    device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"),
    device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_database),
) -> dict[str, Any]:
    if device_id and device_token:
        device = await validate_room_device_credential(db, device_id, device_token)
        if not device:
            raise HTTPException(status_code=401, detail="Invalid or revoked room-device credential.")
        return {"kind": "room_device", "id": device.id}
    if device_key:
        station = await resolve_srr_device_credential(
            db, device_key, allow_enrollment_token=settings.DEPLOYMENT_PROFILE == "local"
        )
        if station:
            return {"kind": "srr_station", "id": station.id}
    if settings.DEPLOYMENT_PROFILE == "local" and venue_key and hmac.compare_digest(venue_key, settings.VENUE_AUTH_KEY):
        return {"kind": "local", "id": None}
    raise HTTPException(status_code=401, detail="An enrolled target-device credential is required.")


class ClaimRequest(BaseModel):
    owner: str = Field(min_length=1, max_length=160)


class ProgressRequest(BaseModel):
    owner: str = Field(min_length=1, max_length=160)
    bytes_received: int = Field(ge=0)
    total_bytes: int = Field(gt=0)


class AcknowledgeRequest(BaseModel):
    target_node: str = Field(min_length=1, max_length=160)
    target_type: str = Field(min_length=1, max_length=50)
    file_id: uuid.UUID
    version_number: int = Field(ge=1)
    sha256: str = Field(min_length=64, max_length=64)
    size_bytes: int = Field(ge=0)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _payload(row: VenueAssetTransfer) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "file_id": str(row.file_id),
        "filename": row.filename,
        "version_number": row.version_number,
        "source_node": row.source_node,
        "target_node": row.target_node,
        "target_id": str(row.target_id) if row.target_id else None,
        "target_url": row.target_url,
        "target_type": row.target_type,
        "priority": row.priority,
        "progress_pct": row.progress_pct,
        "status": row.status,
        "checksum_verified": row.checksum_verified,
        "attempt_count": row.attempt_count,
        "last_error": row.error_message,
        "last_transfer_at": row.last_transfer_at.isoformat() if row.last_transfer_at else None,
        "acknowledged_at": row.acknowledged_at.isoformat() if row.acknowledged_at else None,
        "acknowledged_sha256": row.acknowledged_sha256,
    }


@router.get("/manifest")
async def manifest(
    target_node: Optional[str] = None,
    target_type: Optional[str] = None,
    identity: dict[str, Any] = Depends(verify_target_device),
    db: AsyncSession = Depends(get_database),
) -> dict[str, Any]:
    stmt = select(VenueAssetTransfer).where(
        VenueAssetTransfer.status.in_(["pending", "transferring", "received", "failed"])
    ).order_by(VenueAssetTransfer.priority.desc(), VenueAssetTransfer.created_at.asc())
    if target_node:
        stmt = stmt.where(VenueAssetTransfer.target_node == target_node)
    if target_type:
        stmt = stmt.where(VenueAssetTransfer.target_type == target_type)
    if identity["id"]:
        stmt = stmt.where(VenueAssetTransfer.target_id == identity["id"])
    rows = list((await db.execute(stmt.limit(500))).scalars().all())
    return {"server_time": _now().isoformat(), "transfers": [_payload(row) for row in rows]}


@router.post("/{transfer_id}/claim")
async def claim(
    transfer_id: uuid.UUID,
    payload: ClaimRequest,
    identity: dict[str, Any] = Depends(verify_target_device),
    db: AsyncSession = Depends(get_database),
) -> dict[str, Any]:
    # Claiming is a compare-and-set operation. Lock the transfer row until the
    # lease and attempt count are committed so concurrent targets cannot both
    # acquire the same delivery.
    row = await db.get(VenueAssetTransfer, transfer_id, with_for_update=True)
    if not row:
        raise HTTPException(status_code=404, detail="Transfer not found.")
    if identity["id"] and row.target_id != identity["id"]:
        raise HTTPException(status_code=403, detail="Device is not the assigned delivery target.")
    now = _now()
    if row.status in {"verified", "cancelled"}:
        return {"accepted": False, "transfer": _payload(row)}
    if row.status == "failed" and row.attempt_count >= settings.VENUE_DELIVERY_MAX_ATTEMPTS:
        raise HTTPException(status_code=409, detail="Transfer permanently failed; an operator must retry it.")
    file = await db.get(PresentationFile, row.file_id)
    if not file or file.version_number != row.version_number or file.is_current_version is False:
        row.status = "cancelled"
        row.lease_owner = None
        row.lease_expires_at = None
        row.error_message = "Transfer was cancelled because its presentation version is no longer authoritative."
        await db.commit()
        return {"accepted": False, "transfer": _payload(row)}
    # A retry of the same claim must not consume another attempt or move the
    # lease window backwards. This is important when a target retries after a
    # lost HTTP response.
    if row.status in {"transferring", "received"} and row.lease_owner == payload.owner:
        return {"accepted": True, "transfer": _payload(row)}
    if row.lease_expires_at and row.lease_expires_at > now and row.lease_owner != payload.owner:
        raise HTTPException(status_code=409, detail="Transfer is currently claimed by another worker.")
    row.lease_owner = payload.owner
    row.lease_expires_at = now + timedelta(seconds=LEASE_SECONDS)
    row.status = "transferring"
    row.attempt_count += 1
    row.last_transfer_at = now
    record_runtime_event(db, event_id=file.event_id, event_type="delivery.started", entity_type="asset_transfer", entity_id=str(row.id), payload={"transfer_id": str(row.id), "file_id": str(row.file_id), "version": row.version_number, "target_node": row.target_node, "target_type": row.target_type, "attempt": row.attempt_count})
    await db.commit()
    return {"accepted": True, "transfer": _payload(row)}


@router.post("/{transfer_id}/progress")
async def progress(
    transfer_id: uuid.UUID,
    payload: ProgressRequest,
    identity: dict[str, Any] = Depends(verify_target_device),
    db: AsyncSession = Depends(get_database),
) -> dict[str, Any]:
    """Persist resumable-download progress without implying verification."""
    row = await db.get(VenueAssetTransfer, transfer_id)
    if not row:
        raise HTTPException(status_code=404, detail="Transfer not found.")
    if identity["id"] and row.target_id != identity["id"]:
        raise HTTPException(status_code=403, detail="Device is not the assigned delivery target.")
    if row.status in {"verified", "cancelled"}:
        return {"accepted": False, "transfer": _payload(row)}
    if row.status != "transferring" or row.lease_owner != payload.owner:
        raise HTTPException(status_code=409, detail="Transfer must be claimed by this owner before reporting progress.")
    if row.lease_expires_at and row.lease_expires_at < _now():
        raise HTTPException(status_code=409, detail="Transfer claim has expired; claim it again before reporting progress.")
    file = await db.get(PresentationFile, row.file_id)
    if not file or file.version_number != row.version_number or file.is_current_version is False:
        raise HTTPException(status_code=409, detail="Transfer no longer points to the authoritative presentation version.")
    if payload.total_bytes != file.file_size_bytes:
        raise HTTPException(status_code=422, detail="Transfer total must match the authoritative file size.")
    if payload.bytes_received > file.file_size_bytes:
        raise HTTPException(status_code=422, detail="Received bytes cannot exceed the authoritative file size.")
    now = _now()
    completed = payload.bytes_received == payload.total_bytes
    progress_pct = 100 if completed else min(99, int(payload.bytes_received * 100 / payload.total_bytes))
    row.progress_pct = max(row.progress_pct, progress_pct)
    if completed:
        row.status = "received"
    row.last_transfer_at = now
    # Progress is also a liveness signal. Keep a slow but active LAN/Wi-Fi
    # transfer leased to its owner; a stalled target will still be recovered
    # when the lease expires without another progress report.
    row.lease_expires_at = now + timedelta(seconds=LEASE_SECONDS)
    row.error_message = None
    await db.commit()
    return {"accepted": True, "transfer": _payload(row)}


@router.post("/{transfer_id}/acknowledge")
async def acknowledge(
    transfer_id: uuid.UUID,
    payload: AcknowledgeRequest,
    identity: dict[str, Any] = Depends(verify_target_device),
    db: AsyncSession = Depends(get_database),
    device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"),
    device_key: str | None = Header(default=None, alias="X-Device-Key"),
) -> dict[str, Any]:
    # Direct unit callers do not pass FastAPI's Header defaults.
    if not isinstance(identity, dict):
        identity = {"id": None, "kind": "local"}
    if not isinstance(device_id, uuid.UUID):
        device_id = None
    if not isinstance(device_key, str):
        device_key = None
    row = await db.get(VenueAssetTransfer, transfer_id)
    file = await db.get(PresentationFile, payload.file_id)
    if not row or not file or row.file_id != file.id:
        raise HTTPException(status_code=404, detail="Transfer or presentation file not found.")
    if identity.get("id") and identity["id"] != (device_id or identity["id"]):
        raise HTTPException(status_code=403, detail="Acknowledgement identity does not match the authenticated target.")
    if device_id:
        device = await db.get(RoomDevice, device_id)
        if not device or row.target_id != device.id:
            raise HTTPException(status_code=403, detail="Device is not the assigned delivery target.")
    elif device_key:
        station = await resolve_srr_device_credential(
            db, device_key, allow_enrollment_token=settings.DEPLOYMENT_PROFILE == "local"
        )
        if not station or row.target_id != station.id:
            raise HTTPException(status_code=403, detail="Station is not the assigned delivery target.")
    elif settings.DEPLOYMENT_PROFILE != "local":
        raise HTTPException(status_code=401, detail="A device identity is required to acknowledge delivery.")
    if row.target_node != payload.target_node or row.target_type != payload.target_type:
        raise HTTPException(status_code=403, detail="Acknowledgement target does not match the transfer.")
    if row.version_number != payload.version_number or file.version_number != payload.version_number or file.is_current_version is False:
        raise HTTPException(status_code=409, detail="Acknowledgement is for an obsolete presentation version.")
    if row.status not in {"transferring", "received", "verified"}:
        raise HTTPException(status_code=409, detail="Transfer must be claimed and received before it can be acknowledged.")
    if row.status == "verified":
        if (
            row.acknowledged_sha256 == payload.sha256.lower()
            and row.version_number == payload.version_number
            and payload.size_bytes == file.file_size_bytes
        ):
            return {"accepted": True, "transfer": _payload(row)}
        raise HTTPException(status_code=409, detail="Transfer is already verified for a different file identity.")
    if payload.sha256.lower() != (file.content_sha256 or "").lower() or payload.size_bytes != file.file_size_bytes:
        row.status = "failed"
        row.error_message = "Target checksum or size did not match the authoritative file."
        row.acknowledged_sha256 = payload.sha256
        row.target_acknowledged_at = _now()
        record_runtime_event(db, event_id=file.event_id, event_type="delivery.failed", entity_type="asset_transfer", entity_id=str(row.id), payload={"transfer_id": str(row.id), "file_id": str(file.id), "version": row.version_number, "reason": "checksum_or_size_mismatch", "sha256": payload.sha256, "size_bytes": payload.size_bytes})
        await db.commit()
        raise HTTPException(status_code=409, detail=row.error_message)
    now = _now()
    row.status = "verified"
    row.progress_pct = 100
    row.checksum_verified = True
    row.acknowledged_at = now
    row.target_acknowledged_at = now
    row.acknowledged_sha256 = payload.sha256.lower()
    row.lease_owner = None
    row.lease_expires_at = None
    row.error_message = None
    record_runtime_event(db, event_id=file.event_id, event_type="delivery.verified", entity_type="asset_transfer", entity_id=str(row.id), payload={"transfer_id": str(row.id), "file_id": str(file.id), "version": file.version_number, "target_node": row.target_node, "target_type": row.target_type, "sha256": row.acknowledged_sha256, "size_bytes": file.file_size_bytes})
    await db.commit()
    return {"accepted": True, "transfer": _payload(row)}


@router.get("/{transfer_id}/download")
async def download_transfer_chunk(
    transfer_id: uuid.UUID,
    offset: int = Query(default=0, ge=0),
    chunk_size: int = Query(default=4 * 1024 * 1024, ge=64 * 1024, le=16 * 1024 * 1024),
    identity: dict[str, Any] = Depends(verify_target_device),
    db: AsyncSession = Depends(get_database),
) -> Response:
    row = await db.get(VenueAssetTransfer, transfer_id)
    file = await db.get(PresentationFile, row.file_id) if row else None
    if not row or not file or row.version_number != file.version_number or file.is_current_version is False or not file.local_cache_path:
        raise HTTPException(status_code=404, detail="Authoritative transfer file is not available.")
    if identity["id"] and row.target_id != identity["id"]:
        raise HTTPException(status_code=403, detail="Device is not the assigned delivery target.")
    path = Path(file.local_cache_path).expanduser().resolve()
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Presentation binary is missing from Venue Server storage.")
    total = path.stat().st_size
    if offset > total:
        raise HTTPException(status_code=416, detail="Requested transfer offset is beyond the file size.")
    with path.open("rb") as handle:
        handle.seek(offset)
        content = handle.read(chunk_size)
    end = offset + len(content) - 1 if content else offset
    return Response(
        content=content,
        media_type=file.mime_type or "application/octet-stream",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Range": f"bytes {offset}-{end}/{total}",
            "X-File-Id": str(file.id),
            "X-File-Version": str(file.version_number),
            "X-File-Sha256": file.content_sha256 or "",
            "X-File-Size": str(total),
            "X-Transfer-Id": str(row.id),
        },
    )


@router.post("/{transfer_id}/retry")
async def retry(
    transfer_id: uuid.UUID,
    _: Any = Depends(require_operator),
    db: AsyncSession = Depends(get_database),
) -> dict[str, Any]:
    row = await db.get(VenueAssetTransfer, transfer_id)
    if not row:
        raise HTTPException(status_code=404, detail="Transfer not found.")
    if row.status == "verified":
        raise HTTPException(status_code=409, detail="Verified transfers cannot be retried.")
    row.status = "pending"
    row.progress_pct = 0
    row.attempt_count = 0
    row.error_message = None
    row.lease_owner = None
    row.lease_expires_at = None
    file = await db.get(PresentationFile, row.file_id)
    if file:
        record_runtime_event(db, event_id=file.event_id, event_type="delivery.retry_requested", entity_type="asset_transfer", entity_id=str(row.id), payload={"transfer_id": str(row.id), "file_id": str(file.id), "version": row.version_number})
    await db.commit()
    return {"accepted": True, "transfer": _payload(row)}


@router.get("/status")
async def status(
    file_id: str | None = None,
    room_id: str | None = None,
    speaker_id: str | None = None,
    station_id: str | None = None,
    target_node: str | None = None,
    transfer_status: str | None = Query(default=None, alias="status"),
    _: Any = Depends(require_viewer),
    db: AsyncSession = Depends(get_database),
) -> dict[str, Any]:
    stmt = select(VenueAssetTransfer)
    if file_id:
        stmt = stmt.where(VenueAssetTransfer.file_id == as_uuid(file_id, "file_id"))
    if speaker_id:
        speaker_uuid = as_uuid(speaker_id, "speaker_id")
        speaker_file_ids = select(PresentationFile.id).where(PresentationFile.speaker_id == speaker_uuid)
        stmt = stmt.where(VenueAssetTransfer.file_id.in_(speaker_file_ids))
    if target_node:
        stmt = stmt.where(VenueAssetTransfer.target_node == target_node)
    if station_id:
        stmt = stmt.where(VenueAssetTransfer.target_id == as_uuid(station_id, "station_id"))
    if transfer_status:
        stmt = stmt.where(VenueAssetTransfer.status == transfer_status)
    if room_id:
        room_uuid = as_uuid(room_id, "room_id")
        target_ids = list((await db.execute(select(RoomDevice.id).where(RoomDevice.room_id == room_uuid))).scalars().all())
        stmt = stmt.where(VenueAssetTransfer.target_id.in_(target_ids))
    rows = list((await db.execute(stmt.order_by(VenueAssetTransfer.updated_at.desc()).limit(1000))).scalars().all())
    return {"server_time": _now().isoformat(), "transfers": [_payload(row) for row in rows]}
