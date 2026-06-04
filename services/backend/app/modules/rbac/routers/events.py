# backend/app/routers/events.py
from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from loguru import logger

from app.dependencies import (
    get_db, get_current_user, require_active_user,
    get_current_event, CurrentEvent, OrganizerOrAbove, AdminOrAbove
)
from app.modules.rbac.models.event import Event
from app.modules.auth.models.user import User
from app.modules.rbac.schemas.event import EventCreate, EventUpdate, EventResponse, EventSummary
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=List[EventSummary])
async def list_events(
    status_filter: Optional[str] = Query(None, alias="status",
                                         pattern="^(draft|active|completed|archived)$"),
    search: Optional[str] = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[EventSummary]:
    """List events scoped to the authenticated user's organisation."""
    if current_user.role == 'super_admin':
        q = select(Event)
    elif current_user.role == 'admin':
        q = select(Event).where(Event.organization_id == current_user.organization_id)
    else:
        # Restricted roles: only see assigned events
        from app.modules.rbac.models.rbac import UserAccessNode
        from app.modules.rbac.models.user_assignment import UserEventAssignment
        from sqlalchemy import or_, exists

        # Check in both new RBAC table and legacy assignments table
        # We also need to include events where the user has ROOM or SESSION assignments
        assigned_event_ids = select(UserAccessNode.node_id).where(
            UserAccessNode.user_id == current_user.id,
            UserAccessNode.node_type == 'EVENT'
        )

        # Get event IDs for assigned rooms
        from app.modules.venue.models.room import Room
        room_event_ids = select(Room.event_id).where(
            Room.id.in_(
                select(UserAccessNode.node_id).where(
                    UserAccessNode.user_id == current_user.id,
                    UserAccessNode.node_type == 'ROOM'
                )
            )
        )

        # Get event IDs for assigned sessions
        from app.modules.speakers.models.session import Session
        session_event_ids = select(Session.event_id).where(
            Session.id.in_(
                select(UserAccessNode.node_id).where(
                    UserAccessNode.user_id == current_user.id,
                    UserAccessNode.node_type == 'SESSION'
                )
            )
        )

        legacy_event_ids = select(UserEventAssignment.event_id).where(
            UserEventAssignment.user_id == current_user.id
        )

        q = select(Event).where(
            Event.organization_id == current_user.organization_id,
            or_(
                Event.id.in_(assigned_event_ids),
                Event.id.in_(room_event_ids),
                Event.id.in_(session_event_ids),
                Event.id.in_(legacy_event_ids)
            )
        )

    if status_filter:
        q = q.where(Event.status == status_filter)
    if search:
        q = q.where(Event.name.ilike(f"%{search}%"))
    
    q = q.order_by(Event.start_date.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    return [EventSummary.model_validate(e) for e in result.scalars().all()]


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    """Create a new event for this organisation."""
    existing = await db.execute(
        select(Event).where(
            Event.organization_id == current_user.organization_id,
            Event.short_code == payload.short_code,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Short code '{payload.short_code}' already in use.")

    db_data = payload.model_dump_for_db()
    event = Event(
        organization_id=current_user.organization_id,
        created_by=current_user.id,
        **db_data,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    # Automatically clone global default email templates for the new event
    from app.modules.notifications.models.email_template import EmailTemplate
    global_templates = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.event_id.is_(None),
            EmailTemplate.is_default.is_(True)
        )
    )
    for gt in global_templates.scalars().all():
        cloned = EmailTemplate(
            event_id=event.id,
            name=gt.name,
            template_type=gt.template_type,
            subject=gt.subject,
            body_html=gt.body_html,
            body_text=gt.body_text,
            is_default=False,
        )
        db.add(cloned)
    await db.commit()

    # Automatically seed all participant roles for the new event
    from app.modules.registration.routers.participant_roles import seed_default_roles
    await seed_default_roles(event.id, db)

    await db.refresh(event)
    return EventResponse.model_validate(event)


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(event: CurrentEvent) -> EventResponse:
    """Get a single event. Scoped to user's org (super_admin bypasses)."""
    return EventResponse.model_validate(event)


@router.patch("/{event_id}", response_model=EventResponse)
async def update_event(
    payload: EventUpdate,
    event: CurrentEvent,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db),
) -> EventResponse:

    if payload.short_code and payload.short_code != event.short_code:
        existing = await db.execute(
            select(Event).where(
                Event.organization_id == current_user.organization_id,
                Event.short_code == payload.short_code,
                Event.id != event.id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Short code '{payload.short_code}' already in use.",
            )

    update_data = payload.model_dump(exclude_unset=True)

    # Handle nested JSONB settings by merging (not replacing) existing keys
    for settings_field in ("speaker_settings", "registration_settings", "branding_settings"):
        if settings_field in update_data and update_data[settings_field] is not None:
            current = dict(getattr(event, settings_field) or {})
            current.update(update_data.pop(settings_field))
            update_data[settings_field] = current

    for field, value in update_data.items():
        setattr(event, field, value)

    if not event.speaker_mode_enabled and not event.registration_mode_enabled:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one mode (Speaker or Registration) must be enabled.",
        )

    await db.commit()
    await db.refresh(event)
    return EventResponse.model_validate(event)


async def _perform_nuclear_wipe(event_id: uuid.UUID, db: AsyncSession):
    """
    Internal logic for the nuclear wipe. Does NOT commit.
    """
    from sqlalchemy import delete, text, select
    from app.modules.speakers.models.session import Session
    from app.modules.speakers.models.speaker import Speaker
    from app.modules.venue.models.room import Room
    from app.modules.registration.models.import_job import ImportJob
    from app.modules.presentations.models.poster import Poster
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    from app.modules.notifications.models.email_campaign import EmailCampaign
    from app.modules.notifications.models.email_template import EmailTemplate
    from app.modules.venue.models.room_device import RoomDevice
    from app.modules.auth.models.security_event import SecurityEvent
    from app.modules.venue.models.srr_station import SRRStation
    from app.modules.venue.models.srr_checkin import SRRCheckin
    from app.modules.venue.models.venue_sync_job import VenueSyncJob
    from app.modules.notifications.models.webhook import Webhook
    from app.modules.presentations.models.presentation_bundle import PresentationBundle
    from app.models.audit_log import AuditLog
    
    # Imports for deep dependent logs
    from app.modules.presentations.models.file_integrity_log import FileIntegrityLog
    from app.modules.presentations.models.file_validation import FileValidation
    from app.modules.presentations.models.playback_event import PlaybackEvent
    from app.modules.venue.models.venue_telemetry import DeviceHeartbeat, WebsocketEvent
    from app.modules.notifications.models.email_log import EmailLog
    
    # 1. Temporarily disable triggers
    await db.execute(text("SET LOCAL session_replication_role = 'replica'"))
    
    # Subqueries
    session_ids = select(Session.id).where(Session.event_id == event_id)
    speaker_ids = select(Speaker.id).where(Speaker.event_id == event_id)
    file_ids = select(PresentationFile.id).where(PresentationFile.event_id == event_id)
    device_ids = select(RoomDevice.id).where(RoomDevice.event_id == event_id)
    
    # 0. Deep Logs & Telemetry
    await db.execute(delete(FileIntegrityLog).where(FileIntegrityLog.file_id.in_(file_ids)))
    await db.execute(delete(FileValidation).where(FileValidation.file_id.in_(file_ids)))
    await db.execute(delete(PlaybackEvent).where(PlaybackEvent.session_id.in_(session_ids)))
    await db.execute(delete(DeviceHeartbeat).where(DeviceHeartbeat.device_id.in_(device_ids)))
    await db.execute(delete(WebsocketEvent).where(WebsocketEvent.device_id.in_(device_ids)))
    await db.execute(delete(EmailLog).where(EmailLog.speaker_id.in_(speaker_ids)))
    
    # Many-to-Many and Tables without direct CASCADE relationships in code
    await db.execute(text("DELETE FROM presentations.bundle_files WHERE bundle_id IN (SELECT id FROM presentations.presentation_bundles WHERE event_id = :eid)").bindparams(eid=event_id))
    await db.execute(text("DELETE FROM speakers.session_speakers WHERE session_id IN (SELECT id FROM speakers.sessions WHERE event_id = :eid)").bindparams(eid=event_id))
    await db.execute(text("DELETE FROM presentations.presentation_queue WHERE session_id IN (SELECT id FROM speakers.sessions WHERE event_id = :eid)").bindparams(eid=event_id))
    
    # 1. Main Tables (presorted for FK dependencies where possible)
    await db.execute(delete(Session).where(Session.event_id == event_id))
    await db.execute(delete(Speaker).where(Speaker.event_id == event_id))
    await db.execute(delete(Poster).where(Poster.event_id == event_id))
    await db.execute(delete(Room).where(Room.event_id == event_id))
    await db.execute(delete(ImportJob).where(ImportJob.event_id == event_id))
    await db.execute(delete(PresentationBundle).where(PresentationBundle.event_id == event_id))
    await db.execute(delete(PresentationFile).where(PresentationFile.event_id == event_id))
    await db.execute(delete(EmailCampaign).where(EmailCampaign.event_id == event_id))
    await db.execute(delete(EmailTemplate).where(EmailTemplate.event_id == event_id))
    await db.execute(delete(RoomDevice).where(RoomDevice.event_id == event_id))
    await db.execute(delete(VenueSyncJob).where(VenueSyncJob.event_id == event_id))
    await db.execute(delete(Webhook).where(Webhook.event_id == event_id))
    await db.execute(delete(SRRStation).where(SRRStation.event_id == event_id))
    await db.execute(delete(SRRCheckin).where(SRRCheckin.event_id == event_id))
    await db.execute(delete(VenueActivityLog).where(VenueActivityLog.event_id == event_id))
    await db.execute(delete(SecurityEvent).where(SecurityEvent.event_id == event_id))
    await db.execute(delete(AuditLog).where(AuditLog.event_id == event_id))

@router.delete("/{event_id}", response_model=MessageResponse)
async def delete_event(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """
    Nuclear Delete: Deletes the event and ALL associated data in other tables atomically.
    """
    try:
        # 1. Wipe all associated data in the same transaction
        await _perform_nuclear_wipe(event.id, db)
        
        # 2. Finally delete the event itself
        await db.delete(event)
        await db.commit()
        
        logger.warning(f"Nuclear delete complete for event {event.id} ({event.name})")
        return MessageResponse(message="Event and all associated data have been permanently deleted.")
    except Exception as e:
        await db.rollback()
        logger.error(f"Nuclear delete FAILED for event {event.id}: {e}")
        raise HTTPException(status_code=500, detail=f"Nuclear delete failed: {str(e)}")


@router.post("/{event_id}/publish", response_model=EventResponse)
async def publish_event(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    """Transition event from draft → active."""
    if event.status != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Event is '{event.status}', not 'draft'.")
    event.status = "active"
    await db.commit()
    await db.refresh(event)
    return EventResponse.model_validate(event)


@router.post("/{event_id}/archive", response_model=EventResponse)
async def archive_event(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    event.status = "archived"
    await db.commit()
    await db.refresh(event)
    return EventResponse.model_validate(event)

@router.post("/{event_id}/clear-data", response_model=MessageResponse)
async def clear_event_data(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """
    DANGEROUS: Deletes all schedule-related data for this event but preserves the event settings.
    """
    try:
        await _perform_nuclear_wipe(event.id, db)
        await db.commit()
        logger.warning(f"All data cleared for event {event.id} by user request.")
        return MessageResponse(message="All schedule data has been cleared for this event.")
    except Exception as e:
        await db.rollback()
        logger.error(f"Clear data FAILED for event {event.id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear event data: {str(e)}")
