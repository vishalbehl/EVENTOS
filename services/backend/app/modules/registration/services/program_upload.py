"""Staff program upload: durable prepare, unlocked storage, authorised finalisation."""
from __future__ import annotations

import asyncio
import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from loguru import logger
from sqlalchemy import select

from app.config import settings
from app.core.dependencies.feature_gate import enforce_event_operation
from app.core.upload_service import UploadService
from app.core.upload_validation import validate_upload_metadata
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.events.models.event import Event
from app.modules.files.models.file import DurableUpload
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import UsageReservation
from app.modules.identity.models.user import User
from app.services import upload_service
from .managed_registration_uploads import registration_upload_buckets, require_upload_not_recovering


async def upload_program(
    db,
    *,
    organization_id,
    event_id,
    actor_id,
    auth_revision,
    access_mode,
    workspace_id,
    relationship_id,
    acting_organization_id,
    file,
    key,
    mime_type,
):
    # The request's initial admission is read-only. Release its policy locks
    # before hashing a potentially slow spooled stream.
    await db.commit()
    digest, size, prefix = hashlib.sha256(), 0, bytearray()
    maximum = min(settings.INLINE_UPLOAD_MAX_MB, settings.MAX_FILE_SIZE_MB) * 1024 * 1024
    while chunk := await file.read(1024 * 1024):
        size += len(chunk)
        if size > maximum:
            raise HTTPException(413, detail={"code": "DIRECT_UPLOAD_REQUIRED"})
        prefix.extend(chunk[:max(0, 8 - len(prefix))])
        digest.update(chunk)
    signature = bytes(prefix)
    if not (signature.startswith(b"%PDF-") if mime_type == "application/pdf" else signature.startswith(b"PK\x03\x04")):
        raise HTTPException(415, detail={"code": "PROGRAM_DOCUMENT_SIGNATURE_INVALID"})
    checksum = digest.hexdigest()
    validate_upload_metadata(filename=file.filename, mime_type=mime_type,
        size_bytes=size, declared_checksum=checksum)
    fingerprint = hashlib.sha256(f"{event_id}:{file.filename}:{mime_type}:{size}:{checksum}".encode()).hexdigest()
    reservation_key = f"program-upload:{key}"
    attempt = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    capability_expires_at = int((now + timedelta(hours=24)).timestamp())

    if workspace_id is None or acting_organization_id is None:
        raise HTTPException(503, detail={"code": "ACCESS_RECONCILIATION_REQUIRED"})
    if access_mode == "DIRECT" and (
        acting_organization_id != organization_id or relationship_id is not None
    ):
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
    if access_mode == "DELEGATED" and (
        acting_organization_id == organization_id or relationship_id is None
    ):
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
    if access_mode not in {"DIRECT", "DELEGATED"}:
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})

    authority_snapshot = {
        "actor_id": str(actor_id),
        "auth_revision": auth_revision,
        "access_mode": access_mode,
        "workspace_id": str(workspace_id),
        "relationship_id": str(relationship_id) if relationship_id else None,
        "acting_organization_id": str(acting_organization_id),
    }

    async def authority():
        user = User.__table__
        current_revision = await db.scalar(select(user.c.auth_revision).where(user.c.id == actor_id,
            user.c.is_active.is_(True), user.c.deleted_at.is_(None)))
        if current_revision is None or current_revision != auth_revision:
            raise HTTPException(401, detail={"code": "AUTHENTICATION_REQUIRED"})
        event = await db.scalar(select(Event).where(Event.id == event_id,
            Event.organization_id == organization_id, Event.deleted_at.is_(None))
            .execution_options(populate_existing=True))
        if event is None:
            raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
        await enforce_event_operation(db, organization_id, event_id,
            "registration.forms.manage", user_id=actor_id)
        return event

    async def locked_reservation():
        # Match capacity allocation ordering, serialising same-key first creation.
        await db.scalar(select(Organization.id).where(Organization.id == organization_id).with_for_update())
        return await db.scalar(select(UsageReservation).where(
            UsageReservation.organization_id == organization_id,
            UsageReservation.idempotency_key == reservation_key).with_for_update()
            .execution_options(populate_existing=True))

    try:
        event = await authority()
        if event.operational_workspace_id != workspace_id:
            raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
        reservation = await locked_reservation()
        if reservation is not None:
            metadata = dict(reservation.metadata_json or {})
            if reservation.event_id != event_id or metadata.get("fingerprint") != fingerprint:
                raise HTTPException(409, detail={"code": "IDEMPOTENCY_CONFLICT"})
            snapshot_fields_present = {
                field for field in authority_snapshot if field in metadata
            }
            # Older already-consumed receipts predate the selected-context
            # snapshot. They remain safely replayable because authority() above
            # has just re-authorised the current request. A retained RESERVED
            # attempt, or a partially populated snapshot, must fail closed.
            if ((snapshot_fields_present and snapshot_fields_present != set(authority_snapshot))
                    or (reservation.status != "CONSUMED" and not snapshot_fields_present)
                    or any(metadata.get(field) != value
                        for field, value in authority_snapshot.items()
                        if field in metadata)):
                raise HTTPException(409, detail={"code": "IDEMPOTENCY_CONFLICT"})
            if reservation.status == "CONSUMED":
                result = dict(metadata["response"])
                await db.commit()
                return result
            if reservation.status != "RESERVED":
                if reservation.status == "RELEASED":
                    raise HTTPException(409, detail={"code": "UPLOAD_ATTEMPT_CLOSED",
                        "message": "This upload attempt is closed. Select the file again to start a new attempt."})
                raise HTTPException(409, detail={"code": "UPLOAD_RECONCILIATION_REQUIRED"})
            if metadata.get("lease_until", 0) > now.timestamp():
                raise HTTPException(409, detail={"code": "UPLOAD_IN_PROGRESS"}, headers={"Retry-After": "5"})
            row = await db.scalar(select(DurableUpload).where(
                DurableUpload.id == uuid.UUID(metadata["upload_id"]),
                DurableUpload.organization_id == organization_id,
                DurableUpload.event_id == event_id,
                DurableUpload.created_by == actor_id,
                DurableUpload.object_key == metadata.get("storage_path"),
                DurableUpload.storage_bucket.in_(registration_upload_buckets()),
                DurableUpload.size_bytes == size,
                DurableUpload.checksum == checksum,
            ).with_for_update().execution_options(populate_existing=True))
            if row is None or row.status != "uploading":
                raise HTTPException(409, detail={"code": "UPLOAD_RECONCILIATION_REQUIRED"})
            require_upload_not_recovering(row)
        else:
            object_key = f"tenant/{organization_id}/event/{event_id}/registration_program/{key}.{file.filename.rsplit('.', 1)[-1].lower()}"
            row = await UploadService.create(db, organization_id=organization_id, event_id=event_id,
                created_by=actor_id, object_key=object_key, storage_bucket=settings.S3_BUCKET_REGISTRATION_UPLOADS,
                original_filename=file.filename, mime_type=mime_type, size_bytes=size, checksum=checksum)
            await UploadService.apply_transition(db, row, "uploading")
            reservation = await UsageReservationService.reserve(db, organization_id=organization_id,
                event_id=event_id, limit_key="storage_quota_mb", quantity=max(1, (size + 1048575) // 1048576),
                unit="megabyte", idempotency_key=reservation_key,
                metadata={"fingerprint": fingerprint, "upload_id": str(row.id),
                    "storage_path": object_key,
                    "capability_expires_at": capability_expires_at,
                    "consumption_quantity": size, "consumption_unit": "bytes",
                    **authority_snapshot})
            metadata = dict(reservation.metadata_json or {})
            db.add(AuditLog(organization_id=organization_id, actor_user_id=actor_id,
                resource_type="upload", resource_id=row.id, action_type="PROGRAM_UPLOAD_PREPARED",
                is_sensitive=True, new_state={"event_id": str(event_id), "size_bytes": size}))
        metadata.update({"attempt": attempt, "lease_until": (now + timedelta(minutes=5)).timestamp(),
            "delivery_hold": True})
        reservation.metadata_json = metadata
        reservation.expires_at = now + timedelta(minutes=10)
        upload_id, reservation_id, object_key, storage_bucket = row.id, reservation.id, row.object_key, row.storage_bucket
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    # Only immutable scalar snapshots are used here. No database/policy locks
    # span the storage operation or presigned URL generation.
    try:
        def transfer():
            file.file.seek(0)
            upload_service.upload_fileobj(bucket=storage_bucket, storage_path=object_key,
                fileobj=file.file, content_type=mime_type, verified_organization_id=organization_id,
                write_once=True, expected_checksum=checksum)
        await asyncio.to_thread(transfer)
    except Exception as failure:
        # Outcome may be uncertain: retain quota and object metadata, never
        # delete an object or release another attempt's reservation.
        closed_attempt = False
        try:
            reservation = await locked_reservation()
            closed_attempt = reservation is not None and reservation.status == "RELEASED"
            if reservation is not None and (reservation.metadata_json or {}).get("attempt") == attempt:
                reservation.metadata_json = {**reservation.metadata_json,
                    "lease_until": 0, "storage_error": type(failure).__name__}
                await db.commit()
            else:
                await db.rollback()
        except Exception:
            await db.rollback()
        if isinstance(failure, upload_service.RegistrationUploadWriteConflict):
            closed = closed_attempt
            raise HTTPException(409, detail={"code": "UPLOAD_ATTEMPT_CLOSED" if closed else "UPLOAD_OBJECT_CONFLICT",
                "message": ("This upload attempt is closed. Select the file again to start a new attempt."
                    if closed else "This upload attempt cannot accept another write. Wait for recovery before retrying.")},
                headers={"Retry-After": "5"}) from failure
        raise HTTPException(503, detail={"code": "PROGRAM_STORAGE_UNAVAILABLE",
            "message": "Upload not finalised. Retry the same file; its durable reservation is retained."}) from failure

    try:
        event = await authority()
        reservation = await locked_reservation()
        if reservation is None or reservation.id != reservation_id or (reservation.metadata_json or {}).get("attempt") != attempt:
            raise HTTPException(409, detail={"code": "UPLOAD_ATTEMPT_SUPERSEDED"})
        reservation_metadata = dict(reservation.metadata_json or {})
        row = await db.scalar(select(DurableUpload).where(DurableUpload.id == upload_id,
            DurableUpload.organization_id == organization_id,
            DurableUpload.event_id == event_id,
            DurableUpload.created_by == actor_id,
            DurableUpload.object_key == object_key,
            DurableUpload.storage_bucket == storage_bucket,
            DurableUpload.size_bytes == size,
            DurableUpload.checksum == checksum,
        ).with_for_update().execution_options(populate_existing=True))
        if row is None or row.status != "uploading":
            raise HTTPException(409, detail={"code": "UPLOAD_RECONCILIATION_REQUIRED"})
        require_upload_not_recovering(row)
        if (reservation_metadata.get("storage_path") != object_key
                or any(reservation_metadata.get(field) != value
                    for field, value in authority_snapshot.items())):
            raise HTTPException(409, detail={"code": "UPLOAD_RECONCILIATION_REQUIRED"})
        from app.modules.registration.services.public_upload_capability import public_upload_response
        capability_expires_at = int(
            reservation_metadata.get("capability_expires_at")
            or capability_expires_at
        )
        result = public_upload_response(upload_id=upload_id, event_id=event_id,
            filename=file.filename, expires_at=capability_expires_at)
        result["managed_url"] = (
            f"{settings.api_v1_prefix}/public/events/{event_id}/registration-documents/{upload_id}"
        )
        reservation.metadata_json = {**reservation_metadata, "delivery_hold": False,
            "lease_until": 0, "response": result, "dispatch_due": 0, "dispatch_attempts": 0,
            "capability_expires_at": capability_expires_at}
        reservation.expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
        await UploadService.apply_transition(db, row, "uploaded")
        await UsageReservationService.consume(db, reservation_id,
            source="registration.program.upload", actor_user_id=actor_id)
        db.add(AuditLog(organization_id=organization_id, actor_user_id=actor_id,
            resource_type="upload", resource_id=upload_id, action_type="REGISTRATION_PROGRAM_UPLOADED",
            is_sensitive=True, new_state={"event_id": str(event_id),
                "workspace_id": str(event.operational_workspace_id), "size_bytes": size}))
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    from app.modules.registration.services.managed_registration_uploads import dispatch_committed_registration_upload
    await dispatch_committed_registration_upload(upload_id=upload_id, organization_id=organization_id)
    return result
