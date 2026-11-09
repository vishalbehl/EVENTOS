from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from types import SimpleNamespace

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies.feature_gate import (
    enforce_event_feature,
    enforce_event_operation,
)
from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.communications.models.email_template import EmailTemplate
from app.modules.communications.models.email_template_version import EmailTemplateVersion
from app.modules.events.models.event import Event
from app.modules.agenda.models import Room
from app.modules.agenda.models import Session
from app.modules.events.models.speaker import Speaker
from app.modules.identity.models.user import User
from app.modules.notifications.schemas.notification import (
    CampaignCreate,
    CampaignUpdate,
)
from app.modules.notifications.services.campaign_recipient_filters import (
    validate_recipient_filter, parse_recipient_ids,
)
from app.modules.registration.models.participant import Participant


class EventCampaignMutationService:
    """Canonical campaign configuration writes shared by both admin portals."""


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
        recipient_ids=(),
    ) -> SimpleNamespace:
        validate_recipient_filter(target_type=target_type, recipient_filter=recipient_filter,
            session_id_filter=session_id_filter, room_id_filter=room_id_filter, recipient_ids=recipient_ids)
        if recipient_ids:
            model = Participant if target_type == "participant" else Speaker
            count = await db.scalar(select(func.count(model.id)).where(
                model.id.in_(recipient_ids), model.event_id == event.id, model.deleted_at.is_(None)))
            if count != len(set(recipient_ids)):
                raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
        # Core projection deliberately permits only the owned event/org or
        # truly global platform template. No generic tenant-filter bypass.
        template_table = EmailTemplate.__table__
        version_table = EmailTemplateVersion.__table__
        template_row = (await db.execute(select(template_table.c.id, template_table.c.template_type,
            template_table.c.current_published_version_id).join(version_table,
                (version_table.c.id == template_table.c.current_published_version_id)
                & (version_table.c.template_id == template_table.c.id)).where(
                template_table.c.id == template_id, template_table.c.deleted_at.is_(None),
                template_table.c.target_type == target_type,
                template_table.c.current_published_version_id.is_not(None),
                version_table.c.lifecycle_state.in_(("PUBLISHED", "LEGACY")),
                or_(
                    (template_table.c.scope_type == "EVENT") & (template_table.c.event_id == event.id)
                        & or_(template_table.c.organization_id == event.organization_id,
                            template_table.c.organization_id.is_(None)),
                    (template_table.c.scope_type == "ORGANIZATION") & (template_table.c.organization_id == event.organization_id)
                        & template_table.c.event_id.is_(None),
                    (template_table.c.scope_type == "PLATFORM") & template_table.c.organization_id.is_(None)
                        & template_table.c.event_id.is_(None),
                )))).mappings().one_or_none()
        template = SimpleNamespace(**template_row) if template_row is not None else None
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

        # The shared scoped operation decision is authoritative; global role
        # labels and assignment-node presence cannot expand or replace it.
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
            recipient_ids=tuple(dict.fromkeys(payload.speaker_ids or [])),
        )
        values = payload.model_dump(exclude={"speaker_ids"})
        selected_ids = list(dict.fromkeys(payload.speaker_ids or []))
        if selected_ids:
            # The indexed ownership count already ran in configuration validation.
            valid_count = len(selected_ids)
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
        changes = payload.model_dump(exclude_unset=True, exclude={"speaker_ids"})
        if "speaker_ids" in payload.model_fields_set:
            ids = tuple(dict.fromkeys(payload.speaker_ids or []))
            changes["speaker_id_list"] = ",".join(map(str, ids)) if ids else None
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
            "recipient_ids": parse_recipient_ids(changes.get("speaker_id_list", row.speaker_id_list)),
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
            raise HTTPException(status_code=412, detail={"code": "RESOURCE_VERSION_CONFLICT"})
        # _enforce_base supplies accepted, scoped campaign-manage authority;
        # neither a global role label nor creator identity is a separate grant.
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
            recipient_ids=parse_recipient_ids(row.speaker_id_list),
        )
        row.deleted_at = None
        row.deleted_by = None
        row.version += 1
        await db.flush()
        return row, "RESTORED"
