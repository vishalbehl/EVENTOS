# =============================================================
# Session Builder Router
# API endpoints for the drag-and-drop session builder.
# =============================================================
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.dependencies import get_db, get_current_event, CurrentEvent, get_current_user
from app.modules.identity.models.user import User
from app.modules.agenda.models import Session
from app.modules.agenda.models import Room
from app.modules.agenda.models import Track
from app.modules.events.models.speaker import Speaker
from app.modules.agenda.models import SessionPerson as SessionSpeaker
from app.modules.speakers.schemas.session_builder import (
    BulkReorderRequest,
    BulkReorderResponse,
    BuilderSnapshotResponse,
    ConflictDetail,
    DuplicateSessionRequest,
    DuplicateSessionResponse,
    PublishScheduleRequest,
    PublishScheduleResponse,
    MaterializeCandidateRequest,
    ScheduleRevisionCreate,
    ScheduleAnnouncementRequest,
    ScheduleRevisionResponse,
    SchedulePublicationSettings,
    RoomBuilderResponse,
    SessionBuilderDetail,
    SpeakerSlimResponse,
    TrackResponse,
    TrackUpsertRequest,
)
from app.modules.speakers.services.session_builder_service import (
    bulk_reorder_sessions,
    detect_conflicts,
    duplicate_session,
    get_builder_snapshot_data,
)
from app.modules.speakers.services.session_builder_programme_service import (
    create_schedule_revision, materialize_accepted_abstract, restore_schedule_revision,
)
from app.modules.programme.models import ProgrammeSchedulePublication, ProgrammeScheduleRevision
from app.modules.events.services.event_campaign_mutation_service import EventCampaignMutationService
from app.modules.notifications.schemas.notification import CampaignCreate
from app.core.dependencies.feature_gate import require_event_operation, enforce_event_operation
from app.core.concurrency import require_if_match
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.agenda.application.commands import TrackCommandService
from app.modules.agenda.application.queries import TrackQueryService
from app.modules.analytics.services.projection_dispatch import enqueue_event_speaker_projection_refresh

router = APIRouter(
    prefix="/events/{event_id}/sessions",
    tags=["session-builder"],
    dependencies=[require_event_operation("sessions.manage")],
)


@router.get("/builder-snapshot", response_model=BuilderSnapshotResponse)
async def get_builder_snapshot(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    """
    Return a single, fully denormalised snapshot containing everything the
    session builder needs on initial load: sessions, rooms, tracks,
    unscheduled speakers, and pre-computed conflicts.

    This replaces 5+ individual API calls with one optimised round-trip.
    """
    data = await get_builder_snapshot_data(event.id, db)

    # Serialize rooms with session counts
    session_room_counts: dict[uuid.UUID, int] = {}
    for s in data["sessions"]:
        if s.room_id:
            session_room_counts[s.room_id] = session_room_counts.get(s.room_id, 0) + 1

    rooms_resp = []
    for room in data["rooms"]:
        r_dict = {
            "id": room.id,
            "event_id": room.event_id,
            "name": room.name,
            "room_type": room.room_type,
            "room_coordinator": room.room_coordinator,
            "is_active": room.is_active,
            "sessions_count": session_room_counts.get(room.id, 0),
        }
        rooms_resp.append(RoomBuilderResponse(**r_dict))

    # Serialize unscheduled speakers
    unscheduled_resp = []
    for spk in data["unscheduled_speakers"]:
        unscheduled_resp.append(SpeakerSlimResponse(
            id=spk.id,
            full_name=f"{spk.first_name} {spk.last_name}",
            email=spk.email,
            affiliation=getattr(spk, "affiliation", None),
            upload_status=spk.upload_status,
            avatar_url=getattr(spk, "avatar_url", None),
        ))

    event_obj = data["event"]

    return BuilderSnapshotResponse(
        sessions=[SessionBuilderDetail.model_validate(s) for s in data["sessions"]],
        rooms=rooms_resp,
        tracks=[TrackResponse.model_validate(t) for t in data["tracks"]],
        unscheduled_speakers=unscheduled_resp,
        accepted_candidates=data["accepted_candidates"],
        conflicts=data["conflicts"],
        event_timezone=event_obj.timezone if event_obj else "UTC",
        event_start_date=event_obj.start_date if event_obj else None,
        event_end_date=event_obj.end_date if event_obj else None,
    )


@router.patch("/bulk-reorder", response_model=BulkReorderResponse)
async def bulk_reorder(
    payload: BulkReorderRequest,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Atomic bulk-update of session room assignments and times.
    Called by the frontend after every drag-and-drop operation (debounced 2s).

    - Validates all sessions belong to this event
    - Applies all changes in a single transaction
    - Returns new conflict state post-update
    """
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "sessions.manage",
        user_id=current_user.id,
    )

    try:
        updated_count, conflicts = await bulk_reorder_sessions(
            event_id=event.id,
            items=payload.items,
            db=db,
        )
        await db.commit()
    except ValueError as exc:
        await db.rollback()
        message = str(exc)
        if message.startswith("RESOURCE_VERSION_CONFLICT:"):
            _, resource_id, expected, actual = message.split(":", 3)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "RESOURCE_VERSION_CONFLICT", "resource_id": resource_id,
                        "expected_version": expected, "current_version": actual},
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Bulk reorder failed. All changes have been rolled back.",
        )

    return BulkReorderResponse(
        updated_count=updated_count,
        conflicts=conflicts,
        message=f"{updated_count} session(s) updated successfully",
    )


@router.get("/conflicts", response_model=list[ConflictDetail])
async def get_conflicts(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    """
    Return all current scheduling conflicts for the event.
    Computed on-the-fly from current DB state (no caching, always fresh).
    """
    return await detect_conflicts(event.id, db)


@router.post("/{session_id}/duplicate", response_model=DuplicateSessionResponse)
async def duplicate_session_endpoint(
    session_id: uuid.UUID,
    payload: DuplicateSessionRequest,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
):
    """
    Deep-copy a session with an optional time offset.
    The copy gets a unique session_code (original_copy_N).
    Speaker assignments are preserved (with is_confirmed reset to False).
    """
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "sessions.manage",
        user_id=current_user.id,
    )

    key = idempotency_key or f"session-builder.duplicate:{session_id}:{uuid.uuid4()}"
    try:
        idem = await begin_idempotent(
            db,
            organization_id=event.organization_id,
            actor_id=current_user.id,
            operation="session_builder.session.duplicate",
            key=key,
            payload={
                "event_id": str(event.id),
                "session_id": str(session_id),
                **payload.model_dump(mode="json"),
            },
        )
        if replay_response(idem):
            existing = await db.scalar(
                select(Session).where(
                    Session.id == idem.resource_id,
                    Session.event_id == event.id,
                )
            )
            if existing is None:
                raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_RESOURCE_MISSING"})
            await db.commit()
            return DuplicateSessionResponse(
                id=existing.id,
                session_code=existing.session_code,
                name=existing.name,
                start_time=existing.start_time,
                end_time=existing.end_time,
                room_id=existing.room_id,
                message=f"Session duplicated as '{existing.name}'.",
            )
        new_session = await duplicate_session(
            event_id=event.id,
            session_id=session_id,
            offset_minutes=payload.offset_minutes,
            new_room_id=payload.new_room_id,
            include_speakers=payload.include_speakers,
            db=db,
        )
        await complete_idempotent(
            db,
            idem,
            response_status=201,
            response_body={"resource_id": str(new_session.id)},
            resource_id=new_session.id,
        )
        await db.commit()
        await db.refresh(new_session)
        enqueue_event_speaker_projection_refresh(
            organization_id=event.organization_id, event_id=event.id
        )
    except HTTPException:
        await db.rollback()
        raise
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to duplicate session.",
        )

    return DuplicateSessionResponse(
        id=new_session.id,
        session_code=new_session.session_code,
        name=new_session.name,
        start_time=new_session.start_time,
        end_time=new_session.end_time,
        room_id=new_session.room_id,
        message=f"Session duplicated as '{new_session.name}'",
    )


@router.post("/candidates/{submission_id}/materialize", response_model=DuplicateSessionResponse)
async def materialize_candidate(
    submission_id: uuid.UUID,
    payload: MaterializeCandidateRequest,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
):
    """Turn accepted content into its one linked draft session; retries reuse it."""
    await enforce_event_operation(db, event.organization_id, event.id, "sessions.manage", user_id=current_user.id)
    key = idempotency_key or f"programme-candidate-materialize:{submission_id}:{payload.duration_minutes}"
    try:
        idem = await begin_idempotent(
            db, organization_id=event.organization_id, actor_id=current_user.id,
            operation="programme.abstract_candidate.materialize", key=key,
            payload={"event_id": str(event.id), "submission_id": str(submission_id), "duration_minutes": payload.duration_minutes},
        )
        replay = replay_response(idem)
        if replay:
            existing = await db.get(Session, idem.resource_id)
            if existing is None:
                raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_RESOURCE_MISSING"})
            await db.commit()
            return DuplicateSessionResponse(
                id=existing.id, session_code=existing.session_code, name=existing.title,
                start_time=existing.start_time, end_time=existing.end_time, room_id=existing.room_id,
                message="Accepted abstract is already in the waiting queue.",
            )
        session, created = await materialize_accepted_abstract(
            db=db, event=event, submission_id=submission_id, duration_minutes=payload.duration_minutes,
        )
        await complete_idempotent(
            db, idem, response_status=201 if created else 200,
            response_body={"resource_id": str(session.id), "created": created}, resource_id=session.id,
        )
        await db.commit()
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "ABSTRACT_CANDIDATE_UNAVAILABLE", "message": str(exc)})
    return DuplicateSessionResponse(
        id=session.id, session_code=session.session_code, name=session.name,
        start_time=session.start_time, end_time=session.end_time, room_id=session.room_id,
        message="Accepted abstract added to the waiting queue." if created else "Accepted abstract is already in the waiting queue.",
    )


@router.post("/publish-schedule", response_model=PublishScheduleResponse)
async def publish_schedule(
    event: CurrentEvent,
    payload: Optional[PublishScheduleRequest] = None,
    current_user: User = Depends(get_current_user),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
):
    """
    Atomically publish all event sessions (or specified session_ids),
    finalizing draft sessions and making them live for attendees, website, and venue displays.
    """
    from datetime import datetime, timezone
    from sqlalchemy import update

    key = idempotency_key or f"session-builder.publish:{event.id}:{uuid.uuid4()}"
    idem = await begin_idempotent(
        db,
        organization_id=event.organization_id,
        actor_id=current_user.id,
        operation="session_builder.schedule.publish",
        key=key,
        payload={"event_id": str(event.id), "session_ids": [str(item) for item in (payload.session_ids if payload else [])]},
    )
    replay = replay_response(idem)
    if replay:
        await db.commit()
        return PublishScheduleResponse.model_validate(replay[1])

    conflicts = await detect_conflicts(event.id, db)
    blocking = [item for item in conflicts if item.severity == "error"]
    if blocking:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "SCHEDULE_CONFLICTS_BLOCK_PUBLICATION",
                    "conflicts": [item.model_dump(mode="json") for item in blocking]},
        )

    revision = await create_schedule_revision(
        db=db, event_id=event.id, organization_id=event.organization_id,
        actor_id=current_user.id, label="Published schedule", reason="Publication checkpoint",
    )
    stmt = update(Session).where(
        Session.event_id == event.id,
        Session.deleted_at.is_(None),
    )
    if payload and payload.session_ids:
        stmt = stmt.where(Session.id.in_(payload.session_ids))

    stmt = stmt.values(
        is_published=True,
        updated_at=datetime.now(timezone.utc),
    )
    res = await db.execute(stmt)
    publication = await db.scalar(select(ProgrammeSchedulePublication).where(
        ProgrammeSchedulePublication.event_id == event.id
    ).with_for_update())
    if publication is None:
        publication = ProgrammeSchedulePublication(organization_id=event.organization_id, event_id=event.id)
        db.add(publication)
    publication.status = "PUBLISHED"
    publication.published_by = current_user.id
    publication.published_at = datetime.now(timezone.utc)
    publication.version = (publication.version or 0) + 1
    count = res.rowcount or 0
    response = PublishScheduleResponse(
        success=True,
        published_count=count,
        message=f"Successfully published {count} sessions to the live schedule.",
        revision_id=revision.id,
    )
    await complete_idempotent(
        db,
        idem,
        response_status=200,
        response_body=response.model_dump(mode="json"),
        resource_id=revision.id,
    )
    await db.commit()
    return response


@router.post("/unpublish-schedule", response_model=PublishScheduleResponse)
async def unpublish_schedule(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
):
    """Remove a schedule from all public read paths without discarding its draft."""
    from sqlalchemy import update

    key = idempotency_key or f"session-builder.unpublish:{event.id}:{uuid.uuid4()}"
    idem = await begin_idempotent(
        db,
        organization_id=event.organization_id,
        actor_id=current_user.id,
        operation="session_builder.schedule.unpublish",
        key=key,
        payload={"event_id": str(event.id)},
    )
    replay = replay_response(idem)
    if replay:
        await db.commit()
        return PublishScheduleResponse.model_validate(replay[1])

    revision = await create_schedule_revision(
        db=db, event_id=event.id, organization_id=event.organization_id,
        actor_id=current_user.id, label="Unpublished schedule", reason="Publication removed",
    )
    result = await db.execute(update(Session).where(
        Session.event_id == event.id, Session.deleted_at.is_(None),
    ).values(is_published=False))
    publication = await db.scalar(select(ProgrammeSchedulePublication).where(
        ProgrammeSchedulePublication.event_id == event.id
    ).with_for_update())
    if publication is not None:
        publication.status = "DRAFT"
        publication.published_at = None
        publication.published_by = current_user.id
        publication.version = (publication.version or 0) + 1
    response = PublishScheduleResponse(success=True, published_count=result.rowcount or 0,
        message="Schedule is no longer publicly published.", revision_id=revision.id)
    await complete_idempotent(
        db,
        idem,
        response_status=200,
        response_body=response.model_dump(mode="json"),
        resource_id=revision.id,
    )
    await db.commit()
    return response


@router.post("/revisions", response_model=ScheduleRevisionResponse, status_code=status.HTTP_201_CREATED)
async def checkpoint_schedule(payload: ScheduleRevisionCreate, event: CurrentEvent,
                              current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    revision = await create_schedule_revision(db=db, event_id=event.id, organization_id=event.organization_id,
                                              actor_id=current_user.id, label=payload.label, reason=payload.reason)
    await db.commit()
    return revision


@router.get("/revisions", response_model=list[ScheduleRevisionResponse])
async def list_schedule_revisions(event: CurrentEvent, db: AsyncSession = Depends(get_db)):
    return list((await db.scalars(select(ProgrammeScheduleRevision).where(
        ProgrammeScheduleRevision.event_id == event.id,
        ProgrammeScheduleRevision.organization_id == event.organization_id,
    ).order_by(ProgrammeScheduleRevision.revision_number.desc()).limit(100))).all())


@router.post("/revisions/{revision_id}/restore", response_model=ScheduleRevisionResponse)
async def restore_revision(revision_id: uuid.UUID, event: CurrentEvent,
                           current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        checkpoint = await restore_schedule_revision(db=db, event_id=event.id, organization_id=event.organization_id,
                                                     actor_id=current_user.id, revision_id=revision_id)
        await db.commit()
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=404, detail={"code": "SCHEDULE_REVISION_NOT_FOUND", "message": str(exc)})
    return checkpoint


@router.put("/publication", response_model=SchedulePublicationSettings)
async def configure_publication(payload: SchedulePublicationSettings, event: CurrentEvent,
                                db: AsyncSession = Depends(get_db)):
    publication = await db.scalar(select(ProgrammeSchedulePublication).where(
        ProgrammeSchedulePublication.event_id == event.id
    ).with_for_update())
    if publication is None:
        publication = ProgrammeSchedulePublication(organization_id=event.organization_id, event_id=event.id)
        db.add(publication)
    publication.embed_enabled, publication.json_feed_enabled = payload.embed_enabled, payload.json_feed_enabled
    publication.version = (publication.version or 0) + 1
    await db.commit()
    return SchedulePublicationSettings(embed_enabled=publication.embed_enabled, json_feed_enabled=publication.json_feed_enabled)


@router.get("/schedule-preview")
async def schedule_preview(event: CurrentEvent, db: AsyncSession = Depends(get_db)) -> dict:
    """Authenticated draft preview used before a schedule is published."""
    rows = list((await db.execute(
        select(Session, Room, Track)
        .outerjoin(Room, Room.id == Session.room_id)
        .outerjoin(Track, Track.id == Session.track_id)
        .where(Session.event_id == event.id, Session.deleted_at.is_(None))
        .order_by(Session.start_time, Session.id)
        .limit(1000)
    )).all())
    publication = await db.scalar(select(ProgrammeSchedulePublication).where(
        ProgrammeSchedulePublication.event_id == event.id,
        ProgrammeSchedulePublication.organization_id == event.organization_id,
    ))
    conflicts = await detect_conflicts(event.id, db)
    return {
        "event_id": str(event.id),
        "publication_status": publication.status if publication else "DRAFT",
        "sessions": [{
            "id": str(session.id), "code": session.session_code, "title": session.title,
            "type": session.session_type, "starts_at": session.start_time, "ends_at": session.end_time,
            "room": room.name if room else None, "track": track.name if track else None,
            "published": bool(session.is_published), "status": session.status,
        } for session, room, track in rows],
        "conflicts": [item.model_dump(mode="json") for item in conflicts],
        "publication_ready": not any(item.severity == "error" for item in conflicts),
    }


@router.post("/schedule-announcement", status_code=status.HTTP_201_CREATED)
async def create_schedule_announcement(
    payload: ScheduleAnnouncementRequest,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create one durable campaign configuration for announcing the programme."""
    key = idempotency_key or f"schedule-announcement:{event.id}:{payload.template_id}:{payload.scheduled_at}"
    try:
        idem = await begin_idempotent(
            db, organization_id=event.organization_id, actor_id=current_user.id,
            operation="programme.schedule_announcement.create", key=key,
            payload={"event_id": str(event.id), **payload.model_dump(mode="json")},
        )
        replay = replay_response(idem)
        if replay:
            await db.commit()
            return replay[1]
        campaign = await EventCampaignMutationService.create(
            db, event=event,
            payload=CampaignCreate(
                template_id=payload.template_id,
                name="Published programme announcement",
                recipient_filter=payload.recipient_filter,
                target_type=payload.target_type,
                scheduled_at=payload.scheduled_at,
            ),
            actor=current_user,
        )
        if payload.scheduled_at is not None:
            campaign.status = "scheduled"
        await complete_idempotent(
            db, idem, response_status=201,
            response_body={"campaign_id": str(campaign.id), "status": campaign.status, "scheduled_at": payload.scheduled_at},
            resource_id=campaign.id,
        )
        await db.commit()
        return {"campaign_id": str(campaign.id), "status": campaign.status, "scheduled_at": payload.scheduled_at}
    except Exception:
        await db.rollback()
        raise


# ── Tracks CRUD ───────────────────────────────────────────

tracks_router = APIRouter(
    prefix="/events/{event_id}/tracks",
    tags=["tracks"],
    dependencies=[require_event_operation("sessions.manage")],
)


@tracks_router.get("", response_model=list[TrackResponse])
async def list_tracks(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    """List all tracks for an event, sorted by sort_order."""
    tracks = await TrackQueryService(db).list_for_event(
        organization_id=event.organization_id, event_id=event.id
    )
    return [TrackResponse.model_validate(t) for t in tracks]


@tracks_router.post("", response_model=TrackResponse, status_code=status.HTTP_201_CREATED)
async def create_track(
    payload: TrackUpsertRequest,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new track for an event."""
    key = idempotency_key or f"track-create:{uuid.uuid4()}"
    return await TrackCommandService.create(
        db, event=event, payload=payload, actor_user_id=current_user.id, idempotency_key=key
    )


@tracks_router.patch("/{track_id}", response_model=TrackResponse)
async def update_track(
    track_id: uuid.UUID,
    payload: TrackUpsertRequest,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
):
    """Update a track's name, description, color or sort order."""
    expected_version = require_if_match(if_match) if if_match is not None else None
    return await TrackCommandService.update(
        db, event=event, track_id=track_id, payload=payload,
        actor_user_id=current_user.id, expected_version=expected_version,
        idempotency_key=idempotency_key,
    )


@tracks_router.delete("/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_track(
    track_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
):
    """Delete a track. Sessions remain but lose their track association."""
    expected_version = require_if_match(if_match) if if_match is not None else None
    await TrackCommandService.delete(
        db, event=event, track_id=track_id, actor_user_id=current_user.id,
        expected_version=expected_version, idempotency_key=idempotency_key,
    )
