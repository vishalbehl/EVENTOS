"""Transaction-owning administrative registration corrections."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_event
from app.core.concurrency import raise_version_conflict
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.events.models.event import Event
from app.modules.analytics.services.projection_dispatch import (
    enqueue_event_registration_projection_refresh,
)
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.routers.registrations import helper_approve_registration


class RegistrationCorrectionCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def correct(self, *, organization_id, event_id, registration_id, actor,
                      status: str, reason: str, case_reference: str,
                      rejection_reason: str | None,
                      expected_version: int | None = None) -> dict:
        try:
            event_exists = await self.db.scalar(select(Event.id).where(
                Event.id == event_id, Event.organization_id == organization_id,
            ))
            if event_exists is None:
                raise HTTPException(status_code=404, detail="Event not found")
            row = await self.db.scalar(select(ParticipantRegistration).where(
                ParticipantRegistration.id == registration_id,
                ParticipantRegistration.event_id == event_id,
                ParticipantRegistration.deleted_at.is_(None),
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Registration not found")
            current_version = int(row.version or 1)
            if expected_version is not None and current_version != expected_version:
                raise_version_conflict(current_version)

            old = {
                "status": row.registration_status,
                "waitlist_position": row.waitlist_position,
                "reviewed_by": str(row.reviewed_by) if row.reviewed_by else None,
                "version": current_version,
            }
            if status == "APPROVED":
                capacity = await self.db.scalar(select(CapacityRule).where(
                    CapacityRule.event_id == event_id,
                    CapacityRule.session_id.is_(None),
                    CapacityRule.room_id.is_(None),
                ).with_for_update())
                if capacity:
                    approved_count = await self.db.scalar(select(func.count(Participant.id)).where(
                        Participant.event_id == event_id,
                        Participant.deleted_at.is_(None),
                    )) or 0
                    if approved_count >= capacity.capacity:
                        raise HTTPException(status_code=409, detail=f"Event capacity of {capacity.capacity} has been reached")
                old_position = row.waitlist_position
                await helper_approve_registration(self.db, row, actor.id, reason)
                if old_position is not None:
                    await self.db.execute(update(ParticipantRegistration).where(
                        ParticipantRegistration.event_id == event_id,
                        ParticipantRegistration.registration_status == "waitlisted",
                        ParticipantRegistration.waitlist_position > old_position,
                    ).values(
                        waitlist_position=ParticipantRegistration.waitlist_position - 1,
                        version=ParticipantRegistration.version + 1,
                    ))
            elif status == "WAITLISTED":
                max_position = await self.db.scalar(select(func.max(ParticipantRegistration.waitlist_position)).where(
                    ParticipantRegistration.event_id == event_id,
                    ParticipantRegistration.registration_status == "waitlisted",
                ))
                row.registration_status = "waitlisted"
                row.waitlist_position = (max_position or 0) + 1
                row.reviewed_by = actor.id
                row.reviewed_at = datetime.now(timezone.utc)
                row.review_notes = reason
            else:
                old_position = row.waitlist_position
                row.registration_status = "rejected"
                row.rejection_reason = rejection_reason
                row.waitlist_position = None
                row.reviewed_by = actor.id
                row.reviewed_at = datetime.now(timezone.utc)
                row.review_notes = reason
                if old["status"] == "waitlisted" and old_position is not None:
                    await self.db.execute(update(ParticipantRegistration).where(
                        ParticipantRegistration.event_id == event_id,
                        ParticipantRegistration.registration_status == "waitlisted",
                        ParticipantRegistration.waitlist_position > old_position,
                    ).values(
                        waitlist_position=ParticipantRegistration.waitlist_position - 1,
                        version=ParticipantRegistration.version + 1,
                    ))
            row.version = int(row.version or current_version) + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="registration",
                resource_id=row.id, action_type="REGISTRATION_ADMINISTRATIVE_CORRECTION",
                old_state=jsonable_encoder(old), new_state=jsonable_encoder({
                    "status": row.registration_status,
                    "waitlist_position": row.waitlist_position,
                    "version": row.version, "reason": reason,
                    "case_reference": case_reference,
                }), is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            enqueue_event_registration_projection_refresh(
                organization_id=organization_id,
                event_id=event_id,
            )
            await invalidate_event(organization_id, event_id)
            return {
                "id": row.id, "status": row.registration_status.upper(),
                "reviewed_by": row.reviewed_by, "reviewed_at": row.reviewed_at,
                "waitlist_position": row.waitlist_position,
            }
        except Exception:
            await self.db.rollback()
            raise
