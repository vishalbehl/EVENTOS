from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies.feature_gate import (
    enforce_event_feature,
    enforce_event_operation,
)
from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.communications.models.email_template import EmailTemplate
from app.modules.events.models.event import Event
from app.modules.agenda.models import Room
from app.modules.agenda.models import Session
from app.modules.events.models.speaker import Speaker
from app.modules.identity.models.user import User
from app.modules.notifications.schemas.notification import (
    CampaignCreate,
    CampaignUpdate,
)
from app.modules.rbac.models.rbac import UserAccessNode
from app.modules.registration.models.participant import Participant


class EventCampaignMutationService:
    """Canonical campaign configuration writes shared by both admin portals."""

    ELEVATED_ROLES = {"super_admin", "admin", "organiser"}

    @staticmethod
    async def _enforce_base(
        db: AsyncSession,
        event: Event,
        actor: User,
    ) -> None:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "communications.campaign.manage",
            user_id=actor.id,
        )
        await enforce_event_feature(
            db,
            event.organization_id,
            event.id,
            "FEAT_CAMPAIGN_MGMT",
            user_id=actor.id,
        )

    @staticmethod
    async def _validate_configuration(
        db: AsyncSession,
        *,
        event: Event,
        actor: User,
        template_id: uuid.UUID,
        recipient_filter: str,
        target_type: str,
        session_id_filter: uuid.UUID | None,
        room_id_filter: uuid.UUID | None,
        scheduled_at: datetime | None,
    ) -> EmailTemplate:
        template = await db.scalar(
            select(EmailTemplate).where(
                EmailTemplate.id == template_id,
                or_(
                    (EmailTemplate.scope_type == "EVENT") & (EmailTemplate.event_id == event.id),
                    (EmailTemplate.scope_type == "ORGANIZATION") & (EmailTemplate.organization_id == event.organization_id),
                    EmailTemplate.scope_type == "PLATFORM",
                ),
                EmailTemplate.deleted_at.is_(None),
            ).execution_options(skip_tenant_filter=True)
        )
        if template is None:
            raise HTTPException(
                status_code=404,
                detail="Email template not available for this event",
            )
        if scheduled_at is not None or template.template_type in {
            "reminder",
            "deadline",
        }:
            await enforce_event_operation(
                db,
                event.organization_id,
                event.id,
                "communications.reminders.manage",
                user_id=actor.id,
            )
        if session_id_filter is not None:
            session = await db.scalar(
                select(Session.id).where(
                    Session.id == session_id_filter,
                    Session.event_id == event.id,
                    Session.deleted_at.is_(None),
                )
            )
            if session is None:
                raise HTTPException(
                    status_code=404,
                    detail="Session filter not found in this event",
                )
        if room_id_filter is not None:
            room = await db.scalar(
                select(Room.id).where(
                    Room.id == room_id_filter,
                    Room.event_id == event.id,
                    Room.is_active.is_(True),
                )
            )
            if room is None:
                raise HTTPException(
                    status_code=404,
                    detail="Room filter not found in this event",
                )
        if recipient_filter == "specific_session" and session_id_filter is None:
            raise HTTPException(
                status_code=422,
                detail="session_id_filter is required for specific_session",
            )
        if recipient_filter == "specific_room" and room_id_filter is None:
            raise HTTPException(
                status_code=422,
                detail="room_id_filter is required for specific_room",
            )
        if target_type == "participant" and recipient_filter == "specific_speakers":
            raise HTTPException(
                status_code=422,
                detail="specific_speakers is not valid for participant campaigns",
            )

        if actor.role not in EventCampaignMutationService.ELEVATED_ROLES:
            if recipient_filter not in {"specific_session", "specific_room"}:
                raise HTTPException(
                    status_code=403,
                    detail="Your role may only manage campaigns for an assigned session or room.",
                )
            node_id = (
                session_id_filter
                if recipient_filter == "specific_session"
                else room_id_filter
            )
            node_type = (
                "SESSION" if recipient_filter == "specific_session" else "ROOM"
            )
            assignment = await db.scalar(
                select(UserAccessNode.id).where(
                    UserAccessNode.user_id == actor.id,
                    UserAccessNode.node_id == node_id,
                    UserAccessNode.node_type == node_type,
                )
            )
            if assignment is None:
                raise HTTPException(
                    status_code=403,
                    detail=f"You are not assigned to this {node_type.lower()}.",
                )
        return template

    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        event: Event,
        payload: CampaignCreate,
        actor: User,
    ) -> EmailCampaign:
        await EventCampaignMutationService._enforce_base(db, event, actor)
        template = await EventCampaignMutationService._validate_configuration(
            db,
            event=event,
            actor=actor,
            template_id=payload.template_id,
            recipient_filter=payload.recipient_filter,
            target_type=payload.target_type,
            session_id_filter=payload.session_id_filter,
            room_id_filter=payload.room_id_filter,
            scheduled_at=payload.scheduled_at,
        )
        values = payload.model_dump(exclude={"speaker_ids"})
        selected_ids = list(dict.fromkeys(payload.speaker_ids or []))
        if selected_ids:
            model = Participant if payload.target_type == "participant" else Speaker
            valid_count = int(
                await db.scalar(
                    select(func.count(model.id)).where(
                        model.event_id == event.id,
                        model.deleted_at.is_(None),
                        model.id.in_(selected_ids),
                    )
                )
                or 0
            )
            if valid_count != len(selected_ids):
                raise HTTPException(
                    status_code=404,
                    detail="One or more selected recipients do not belong to this event",
                )
            values["speaker_id_list"] = ",".join(str(item) for item in selected_ids)
            values["total_recipients"] = valid_count
        elif payload.recipient_filter in {
            "specific_speakers",
            "specific_participants",
        }:
            raise HTTPException(
                status_code=422,
                detail="Selected recipient IDs are required for this filter",
            )
        row = EmailCampaign(
            event_id=event.id,
            created_by=actor.id,
            template_version_id=template.current_published_version_id,
            **values,
        )
        db.add(row)
        await db.flush()
        return row

    @staticmethod
    async def update(
        db: AsyncSession,
        *,
        event: Event,
        campaign_id: uuid.UUID,
        payload: CampaignUpdate,
        actor: User,
        expected_version: int | None = None,
    ) -> tuple[EmailCampaign, dict[str, Any], list[str]]:
        await EventCampaignMutationService._enforce_base(db, event, actor)
        row = await db.scalar(
            select(EmailCampaign)
            .where(
                EmailCampaign.id == campaign_id,
                EmailCampaign.event_id == event.id,
                EmailCampaign.deleted_at.is_(None),
            )
            .with_for_update()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Email campaign not found")
        if row.status not in {"draft", "scheduled"}:
            raise HTTPException(
                status_code=409,
                detail="Only draft or scheduled campaigns can be edited",
            )
        if expected_version is not None and row.version != expected_version:
            raise HTTPException(status_code=409, detail={"code": "RESOURCE_VERSION_CONFLICT", "current_version": row.version})
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            raise HTTPException(status_code=422, detail="No campaign fields supplied")
        effective = {
            "template_id": changes.get("template_id", row.template_id),
            "recipient_filter": changes.get("recipient_filter", row.recipient_filter),
            "target_type": changes.get("target_type", row.target_type),
            "session_id_filter": changes.get(
                "session_id_filter", row.session_id_filter
            ),
            "room_id_filter": changes.get("room_id_filter", row.room_id_filter),
            "scheduled_at": changes.get("scheduled_at", row.scheduled_at),
        }
        await EventCampaignMutationService._validate_configuration(
            db,
            event=event,
            actor=actor,
            **effective,
        )
        old = {key: getattr(row, key, None) for key in changes}
        for key, value in changes.items():
            setattr(row, key, value)
        row.version += 1
        await db.flush()
        return row, old, sorted(changes)

    @staticmethod
    async def archive(
        db: AsyncSession,
        *,
        event: Event,
        campaign_id: uuid.UUID,
        actor: User,
        expected_version: int | None = None,
    ) -> tuple[EmailCampaign, str]:
        await EventCampaignMutationService._enforce_base(db, event, actor)
        row = await db.scalar(
            select(EmailCampaign)
            .where(
                EmailCampaign.id == campaign_id,
                EmailCampaign.event_id == event.id,
            )
            .with_for_update()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Campaign not found")
        if expected_version is not None and row.version != expected_version:
            raise HTTPException(status_code=409, detail={"code": "RESOURCE_VERSION_CONFLICT", "current_version": row.version})
        if (
            actor.role not in EventCampaignMutationService.ELEVATED_ROLES
            and row.created_by != actor.id
        ):
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to archive this campaign.",
            )
        if row.deleted_at is not None:
            return row, "ALREADY_ARCHIVED"
        if row.status == "sending":
            raise HTTPException(
                status_code=409,
                detail="A sending campaign cannot be archived",
            )
        row.deleted_at = datetime.now(timezone.utc)
        row.version += 1
        row.deleted_by = actor.id
        await db.flush()
        return row, "SOFT_DELETED"

    @staticmethod
    async def restore(
        db: AsyncSession,
        *,
        event: Event,
        campaign_id: uuid.UUID,
        actor: User,
    ) -> tuple[EmailCampaign, str]:
        await EventCampaignMutationService._enforce_base(db, event, actor)
        row = await db.scalar(
            select(EmailCampaign)
            .where(
                EmailCampaign.id == campaign_id,
                EmailCampaign.event_id == event.id,
            )
            .with_for_update()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Campaign not found")
        if row.deleted_at is None:
            return row, "ALREADY_ACTIVE"
        await EventCampaignMutationService._validate_configuration(
            db,
            event=event,
            actor=actor,
            template_id=row.template_id,
            recipient_filter=row.recipient_filter,
            target_type=row.target_type,
            session_id_filter=row.session_id_filter,
            room_id_filter=row.room_id_filter,
            scheduled_at=row.scheduled_at,
        )
        row.deleted_at = None
        row.deleted_by = None
        row.version += 1
        await db.flush()
        return row, "RESTORED"
