"""Transaction-owned presentation file commands."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.platform.models.organization_console import UsageReservation
from app.modules.platform.services.metering_service import MeteringService
from app.modules.agenda.models import Session, SessionPerson as SessionSpeaker
from app.modules.events.models.speaker import Speaker
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.presentations.schemas.file import UploadRequestBody
from app.services import upload_service
from app.core.dependencies.feature_gate import enforce_event_operation
from app.modules.presentations.services.file_administration_service import (
    PresentationFileAdministrationService,
)


class PresentationFileCommandService:
    """Own the transaction around administrative file state changes."""

    @staticmethod
    async def apply(
        db: AsyncSession,
        *,
        event,
        file_id,
        actor_id,
        action: str,
        reason: str | None = None,
        source: str,
    ):
        try:
            row = await PresentationFileAdministrationService.apply(
                db,
                event,
                file_id,
                actor_id,
                action,
                reason=reason,
                source=source,
            )
            await db.commit()
            return row
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def confirm_upload(
        db: AsyncSession,
        *,
        event,
        file_id,
        actor_id,
    ):
        """Finalize an uploaded file and consume its durable storage reservation."""
        try:
            row = await PresentationFileAdministrationService.require_file(
                db, event.id, file_id, lock=True
            )
            previous = await db.scalars(
                select(PresentationFile).where(
                    PresentationFile.session_speaker_id == row.session_speaker_id,
                    PresentationFile.id != row.id,
                    PresentationFile.is_current_version.is_(True),
                )
            )
            for old in previous:
                old.is_current_version = False
            row.is_current_version = True
            row.upload_status = "pending_validation"
            speaker = await db.get(Speaker, row.speaker_id)
            if speaker:
                speaker.upload_status = "uploaded"
            reservation = await db.scalar(
                select(UsageReservation).where(
                    UsageReservation.organization_id == event.organization_id,
                    UsageReservation.idempotency_key == f"presentation-upload:{row.id}",
                ).with_for_update()
            )
            if not reservation:
                raise ValueError("RESERVATION_UNAVAILABLE")
            await UsageReservationService.consume(
                db,
                reservation.id,
                source="presentations.confirm_upload",
                actor_user_id=actor_id,
            )
            await MeteringService.record(
                db,
                organization_id=event.organization_id,
                event_id=event.id,
                metric_key="file_count",
                quantity=1,
                unit="file",
                source="presentations.confirm_upload",
                idempotency_key=f"presentation-file-count:{row.id}",
                metadata={"file_id": str(row.id)},
            )
            await db.commit()
            return row
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def create_upload_record(
        db: AsyncSession,
        *,
        event,
        actor_id,
        payload: UploadRequestBody,
        idempotency_key: str,
    ) -> tuple[PresentationFile, int, bool]:
        """Reserve quota and persist the upload record before presigning."""
        try:
            session_speaker = await db.scalar(
                select(SessionSpeaker)
                .where(SessionSpeaker.id == payload.session_speaker_id)
                .options(
                    selectinload(SessionSpeaker.session).selectinload(Session.room),
                    selectinload(SessionSpeaker.speaker),
                )
            )
            if session_speaker is None or session_speaker.session.event_id != event.id:
                from fastapi import HTTPException, status
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session speaker slot not found.")

            max_bytes = event.max_file_size_mb * 1024 * 1024
            if payload.file_size_bytes > max_bytes:
                from fastapi import HTTPException, status
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds maximum size of {event.max_file_size_mb} MB.",
                )
            max_version = await db.scalar(
                select(func.max(PresentationFile.version_number)).where(
                    PresentationFile.session_speaker_id == session_speaker.id
                )
            ) or 0
            next_version = int(max_version) + 1
            if next_version > 1:
                await enforce_event_operation(
                    db,
                    event.organization_id,
                    event.id,
                    "presentations.versions.create",
                    user_id=actor_id,
                )
            storage_path, stored_filename = upload_service.build_presentation_path(
                event.id,
                session_speaker.speaker_id,
                payload.filename,
                event_name=event.name,
                hall_name=session_speaker.session.room.name if session_speaker.session.room else None,
                session_date=session_speaker.start_time or session_speaker.session.start_time,
                session_name=session_speaker.session.name,
                speaker_name=session_speaker.speaker.full_name,
            )
            file_id = uuid.uuid5(
                uuid.NAMESPACE_URL,
                f"eventos:presentation-upload:{event.organization_id}:{idempotency_key}",
            )
            request_fingerprint = hashlib.sha256(
                f"{payload.session_speaker_id}|{payload.filename}|{payload.file_size_bytes}|{payload.mime_type}|{payload.file_format}".encode()
            ).hexdigest()
            reservation = await UsageReservationService.reserve(
                db,
                organization_id=event.organization_id,
                event_id=event.id,
                limit_key="storage_quota_mb",
                quantity=max(1, (payload.file_size_bytes + 1024 * 1024 - 1) // (1024 * 1024)),
                unit="megabyte",
                idempotency_key=f"presentation-upload:{file_id}",
                ttl_seconds=settings.S3_PRESIGNED_EXPIRY_SECONDS,
                metadata={
                    "file_id": str(file_id), "bytes": payload.file_size_bytes,
                    "request_fingerprint": request_fingerprint,
                    "consumption_quantity": payload.file_size_bytes,
                    "consumption_unit": "byte",
                },
            )
            if reservation.metadata_json.get("request_fingerprint") not in {None, request_fingerprint}:
                from fastapi import HTTPException
                raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
            existing = await db.get(PresentationFile, file_id)
            if existing is not None:
                if existing.event_id != event.id:
                    from fastapi import HTTPException
                    raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
                await db.rollback()
                return existing, max_bytes, True
            row = PresentationFile(
                id=file_id,
                speaker_id=session_speaker.speaker_id,
                session_speaker_id=session_speaker.id,
                event_id=event.id,
                original_filename=payload.filename,
                stored_filename=stored_filename,
                storage_path=storage_path,
                file_size_bytes=payload.file_size_bytes,
                mime_type=payload.mime_type,
                file_format=payload.file_format,
                upload_status="processing",
                upload_source="web",
                version_number=next_version,
                is_current_version=False,
            )
            db.add(row)
            await db.flush()
            await db.commit()
            return row, max_bytes, False
        except Exception:
            await db.rollback()
            raise
