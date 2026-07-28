# backend/app/routers/posters.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db, get_current_user, get_current_event, CurrentEvent, OrganizerOrAbove
from app.modules.presentations.models.poster import Poster
from app.modules.identity.models.user import User
from app.modules.presentations.schemas.poster import (
    PosterCreate, PosterUpdate, PosterResponse,
    PosterReviewRequest, PosterScheduleRequest,
    PosterUploadRequest, PresignedPosterUploadResponse,
    PosterBatchStatusRequest, PosterBatchScheduleRequest,
)
from app.schemas.common import MessageResponse
from app.modules.presentations.schemas.file import FileDownloadResponse
from app.services import upload_service
from app.websocket.events import broadcast_file_event, EventType
from app.core.dependencies.feature_gate import require_event_operation

router = APIRouter(prefix="/events/{event_id}/posters", tags=["posters"], dependencies=[require_event_operation("eposters.manage")])


@router.get("/categories", response_model=List[str])
async def list_poster_categories(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> List[str]:
    """Get unique categories used in posters for this event."""
    result = await db.execute(
        select(Poster.category)
        .where(Poster.event_id == event.id, Poster.category.isnot(None))
        .distinct()
    )
    return [r[0] for r in result.all() if r[0]]



# ── CRUD ──────────────────────────────────────────────────────

@router.get("", response_model=List[PosterResponse])
async def list_posters(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    poster_status: Optional[str] = Query(None, alias="status"),
    screen: Optional[str] = Query(None),
    featured_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> List[PosterResponse]:
    """List ePosters for this event. Supports filtering by status and screen."""
    from app.modules.events.models.speaker import Speaker
    from app.modules.events.models.session import Session
    from sqlalchemy import or_

    q = select(Poster, Speaker.first_name, Speaker.last_name, Speaker.email).outerjoin(Speaker, Poster.speaker_id == Speaker.id).where(Poster.event_id == event.id)

    # Apply restricted access filtering for non-admin roles
    if current_user.role not in ["super_admin", "admin", "organiser"]:
        from app.modules.rbac.models.rbac import UserAccessNode
        from app.modules.rbac.models.user_assignment import UserEventAssignment

        # Get assigned node IDs for this user
        nodes_result = await db.execute(
            select(UserAccessNode.node_id, UserAccessNode.node_type)
            .where(UserAccessNode.user_id == current_user.id)
        )
        nodes = nodes_result.all()
        
        assigned_event_ids = {n.node_id for n in nodes if n.node_type == 'EVENT'}
        assigned_room_ids = {n.node_id for n in nodes if n.node_type == 'ROOM'}
        assigned_session_ids = {n.node_id for n in nodes if n.node_type == 'SESSION'}
        
        # Also check legacy assignments (only if they are event-wide)
        legacy_result = await db.execute(
            select(UserEventAssignment.event_id).where(
                UserEventAssignment.user_id == current_user.id,
                or_(
                    ~UserEventAssignment.permissions.has_key('node_type'),
                    UserEventAssignment.permissions['node_type'].astext == 'event'
                )
            )
        )
        assigned_event_ids.update(legacy_result.scalars().all())

        # Filter posters: they must be linked to an assigned event, room, or session
        if event.id not in assigned_event_ids:
            q = q.where(
                or_(
                    Poster.session_id.in_(assigned_session_ids),
                    Poster.session_id.in_(
                        select(Session.id).where(Session.room_id.in_(assigned_room_ids))
                    )
                )
            )

    if poster_status:
        q = q.where(Poster.status == poster_status)
    if screen:
        q = q.where(func.concat(',', Poster.display_screen, ',').like(f'%,{screen.strip().lower()},%'))
    if featured_only:
        q = q.where(Poster.is_featured.is_(True))
    q = q.order_by(Poster.display_order, Poster.submitted_at)
    q = q.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    
    posters_with_names = []
    for row in result.all():
        poster = row[0]
        first_name = row[1]
        last_name = row[2]
        email = row[3]
        
        p_resp = PosterResponse.model_validate(poster)
        if first_name and last_name:
            p_resp.speaker_name = f"{first_name} {last_name}"
        if email:
            p_resp.speaker_email = email
        posters_with_names.append(p_resp)
        
    return posters_with_names


@router.post("", response_model=PosterResponse, status_code=status.HTTP_201_CREATED)
async def create_poster(
    payload: PosterCreate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> PosterResponse:
    """Register a new ePoster submission (metadata only, no file yet)."""
    poster = Poster(
        event_id=event.id,
        speaker_id=payload.speaker_id,
        title=payload.title,
        authors=payload.authors,
        category=payload.category,
        abstract=payload.abstract,
        status="pending",
    )
    db.add(poster)
    await db.commit()
    await db.refresh(poster)
    return PosterResponse.model_validate(poster)


@router.get("/{poster_id}", response_model=PosterResponse)
async def get_poster(
    poster_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PosterResponse:
    poster = await _get_poster_or_404(db, poster_id, event.id, user=current_user)
    
    from app.modules.events.models.speaker import Speaker
    # We still need the speaker name and email for the response
    q = select(Speaker.first_name, Speaker.last_name, Speaker.email).where(Speaker.id == poster.speaker_id)
    result = await db.execute(q)
    row = result.first()
    
    p_resp = PosterResponse.model_validate(poster)
    if row:
        first_name, last_name, email = row
        if first_name and last_name:
            p_resp.speaker_name = f"{first_name} {last_name}"
        if email:
            p_resp.speaker_email = email
    return p_resp


@router.patch("/{poster_id}", response_model=PosterResponse)
async def update_poster(
    poster_id: uuid.UUID,
    payload: PosterUpdate,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PosterResponse:
    poster = await _get_poster_or_404(db, poster_id, event.id, user=current_user)
    
    update_data = payload.model_dump(exclude_unset=True)
    
    # If the poster is already approved, we only allow updating the status
    # (This allows an admin to reject an accidentally approved poster)
    if poster.status == "approved":
        for k, v in update_data.items():
            if k == "status":
                continue
            
            # Get the current value from the model to compare
            current_val = getattr(poster, k)
            
            # Treat empty string and None as equivalent for comparison
            val_to_check = v if v != "" else None
            curr_to_check = current_val if current_val != "" else None
            
            # If the value is actually different, then we block it
            if val_to_check != curr_to_check:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Cannot edit '{k}' while poster is approved. Reject it first to make changes.",
                )
            
    for field, value in update_data.items():
        setattr(poster, field, value)
    await db.commit()
    await db.refresh(poster)
    return PosterResponse.model_validate(poster)


@router.delete("/{poster_id}", response_model=MessageResponse)
async def delete_poster(
    poster_id: uuid.UUID,
    event: CurrentEvent,
    user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    poster = await _get_poster_or_404(db, poster_id, event.id, user=user)
    if poster.status == "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete an approved poster. Reject it first.",
        )
    await db.delete(poster)
    await db.commit()
    return MessageResponse(message="Poster deleted.")


# ── Upload flow ───────────────────────────────────────────────

@router.post("/{poster_id}/upload-url", response_model=PresignedPosterUploadResponse)
async def request_poster_upload_url(
    poster_id: uuid.UUID,
    payload: PosterUploadRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> PresignedPosterUploadResponse:
    """Author requests a pre-signed S3 URL to upload the PDF directly."""
    poster = await _get_poster_or_404(db, poster_id, event.id)
    if poster.status not in ("pending", "submitted", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot upload a poster in '{poster.status}' state.",
        )

    storage_path, stored_filename = upload_service.build_poster_path(event.id, uuid.uuid4(), payload.filename)
    upload_info = upload_service.create_presigned_upload(
        bucket=settings.S3_BUCKET_POSTERS,
        storage_path=storage_path,
        content_type=payload.mime_type or "application/octet-stream",
        max_size_bytes=payload.file_size_bytes,
    )

    # Save storage metadata and transition status to 'submitted'
    poster.storage_path = storage_path
    poster.original_filename = payload.filename
    poster.file_size_bytes = payload.file_size_bytes
    poster.version_number = poster.version_number + 1
    poster.status = "submitted"
    poster.submitted_at = datetime.now(timezone.utc)
    poster.rejection_reason = None
    await db.commit()

    return PresignedPosterUploadResponse(
        poster_id=poster.id,
        upload_url=upload_info["url"],
        expires_in=settings.S3_PRESIGNED_EXPIRY_SECONDS,
    )


@router.get("/{poster_id}/download", response_model=FileDownloadResponse)
async def get_poster_download_url(
    poster_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user), # Add current_user
    db: AsyncSession = Depends(get_db),
) -> FileDownloadResponse:
    """Generate a pre-signed S3 download URL for a poster."""
    poster = await _get_poster_or_404(db, poster_id, event.id, user=current_user)
    if not poster.storage_path:
        raise HTTPException(status_code=404, detail="No file uploaded for this poster.")
        
    url = upload_service.create_presigned_download(
        bucket=settings.S3_BUCKET_POSTERS,
        storage_path=poster.storage_path,
        filename=poster.original_filename or f"poster_{poster_id}.pdf",
    )
    
    # Log download
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    db.add(VenueActivityLog(
        event_id=event.id,
        speaker_id=poster.speaker_id,
        performed_by=current_user.id,
        action="download",
        action_category="FILE_OPS",
        details={"source": "organizer_portal", "type": "poster", "poster_id": str(poster_id)}
    ))
    await db.commit()
    
    return FileDownloadResponse(
        download_url=url,
        expires_in=settings.S3_PRESIGNED_EXPIRY_SECONDS,
        filename=poster.original_filename or f"poster_{poster_id}.pdf",
    )


# ── Organizer review workflow ─────────────────────────────────

@router.post("/{poster_id}/review", response_model=PosterResponse)
async def review_poster(
    poster_id: uuid.UUID,
    payload: PosterReviewRequest,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PosterResponse:
    """
    Organizer approves or rejects a poster.
    Transition: submitted / under_review → approved | rejected
    """
    poster = await _get_poster_or_404(db, poster_id, event.id, user=current_user)
    if poster.status not in ("submitted", "under_review"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot review a poster in '{poster.status}' state.",
        )

    poster.status = payload.decision
    poster.reviewed_by = current_user.id
    poster.reviewed_at = datetime.now(timezone.utc)
    if payload.decision == "rejected":
        poster.rejection_reason = payload.rejection_reason
    elif payload.decision == "approved":
        poster.rejection_reason = None
        
    # Log review
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    db.add(VenueActivityLog(
        event_id=event.id,
        speaker_id=poster.speaker_id,
        performed_by=current_user.id,
        action="approve" if payload.decision == "approved" else "reject",
        action_category="REVIEWS",
        details={
            "source": "organizer_portal", 
            "type": "poster", 
            "poster_id": str(poster_id),
            "reason": payload.rejection_reason if payload.decision == "rejected" else None
        }
    ))
    
    await db.commit()
    await db.refresh(poster)
    return PosterResponse.model_validate(poster)


@router.post("/{poster_id}/mark-under-review", response_model=PosterResponse)
async def mark_under_review(
    poster_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PosterResponse:
    """Mark poster as under review (signals to author that organizer is looking at it)."""
    poster = await _get_poster_or_404(db, poster_id, event.id, user=current_user)
    if poster.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only 'submitted' posters can be marked under review.",
        )
    poster.status = "under_review"
    poster.reviewed_by = current_user.id
    await db.commit()
    await db.refresh(poster)
    return PosterResponse.model_validate(poster)


@router.post("/{poster_id}/withdraw", response_model=PosterResponse)
async def withdraw_poster(
    poster_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PosterResponse:
    """Author withdraws their own poster submission."""
    poster = await _get_poster_or_404(db, poster_id, event.id, user=current_user)
    if poster.status in ("approved",):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot withdraw an approved poster. Contact the organizer.",
        )
    poster.status = "withdrawn"
    await db.commit()
    await db.refresh(poster)
    return PosterResponse.model_validate(poster)


# ── Display screen scheduling ─────────────────────────────────

@router.post("/{poster_id}/schedule", response_model=PosterResponse)
async def schedule_poster(
    poster_id: uuid.UUID,
    payload: PosterScheduleRequest,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PosterResponse:
    """
    Assign an approved poster to a physical display screen.
    Only approved posters can be scheduled.
    """
    poster = await _get_poster_or_404(db, poster_id, event.id, user=current_user)
    if poster.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only approved posters can be scheduled for display.",
        )
    poster.display_screen = payload.display_screen
    poster.display_order = payload.display_order
    poster.is_featured = payload.is_featured
    await db.commit()
    await db.refresh(poster)
    return PosterResponse.model_validate(poster)


@router.delete("/{poster_id}/schedule", response_model=PosterResponse)
async def unschedule_poster(
    poster_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PosterResponse:
    """Remove a poster from its assigned display screen."""
    poster = await _get_poster_or_404(db, poster_id, event.id, user=current_user)
    poster.display_screen = None
    poster.display_order = 0
    poster.is_featured = False
    await db.commit()
    await db.refresh(poster)
    return PosterResponse.model_validate(poster)


# ── Kiosk / Signage endpoints ─────────────────────────────────

@router.get("/screens/{screen_id}", response_model=List[PosterResponse])
async def get_screen_posters(
    screen_id: str,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> List[PosterResponse]:
    """
    Public endpoint called by ePoster Display kiosks.
    Returns approved, scheduled posters for the given screen.
    Ordered by is_featured (desc) then display_order.
    """
    result = await db.execute(
        select(Poster).where(
            Poster.event_id == event.id,
            Poster.status == "approved",
            func.concat(',', Poster.display_screen, ',').like(f'%,{screen_id.strip().lower()},%'),
        ).order_by(Poster.is_featured.desc(), Poster.display_order)
    )
    return [PosterResponse.model_validate(p) for p in result.scalars().all()]


# ── Batch operations ──────────────────────────────────────────

@router.post("/batch-approve", response_model=MessageResponse)
async def batch_approve_posters(
    event: CurrentEvent,
    poster_ids: List[uuid.UUID] = Body(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Batch approve multiple posters at once."""
    q = select(Poster).where(Poster.id.in_(poster_ids), Poster.event_id == event.id)
    
    # Enforce assignments for restricted roles
    if current_user.role not in ["super_admin", "admin", "organiser"]:
        from app.modules.rbac.models.rbac import UserAccessNode
        from app.modules.events.models.session import Session
        from app.modules.rbac.models.user_assignment import UserEventAssignment
        from sqlalchemy import or_, and_

        # Get assigned node IDs
        nodes_result = await db.execute(
            select(UserAccessNode.node_id, UserAccessNode.node_type)
            .where(UserAccessNode.user_id == current_user.id)
        )
        nodes = nodes_result.all()
        assigned_event_ids = {n.node_id for n in nodes if n.node_type == 'EVENT'}
        assigned_room_ids = {n.node_id for n in nodes if n.node_type == 'ROOM'}
        assigned_session_ids = {n.node_id for n in nodes if n.node_type == 'SESSION'}
        
        legacy_result = await db.execute(
            select(UserEventAssignment.event_id).where(UserEventAssignment.user_id == current_user.id)
        )
        assigned_event_ids.update(legacy_result.scalars().all())

        if event.id not in assigned_event_ids:
            q = q.where(
                or_(
                    Poster.session_id.in_(assigned_session_ids),
                    Poster.session_id.in_(
                        select(Session.id).where(Session.room_id.in_(assigned_room_ids))
                    )
                )
            )

    result = await db.execute(q)
    posters = result.scalars().all()
    
    approved = 0
    for p in posters:
        if p.status in ("submitted", "under_review"):
            p.status = "approved"
            p.reviewed_by = current_user.id
            p.reviewed_at = datetime.now(timezone.utc)
            p.rejection_reason = None
            approved += 1
    await db.commit()
    return MessageResponse(message=f"{approved} poster(s) approved.")


@router.post("/batch-schedule", response_model=MessageResponse)
async def batch_schedule_posters(
    event: CurrentEvent,
    payload: PosterBatchScheduleRequest = Body(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """
    Assign multiple posters to screens in a single operation.
    For each screen in the payload, it clears existing assignments and sets the new ones.
    Supports multiple screens per poster via comma-separated values in display_screen.
    """
    # 1. Map out which screens are being updated
    updated_screens = {s.strip().lower() for s in payload.assignments.keys()}
    
    # 2. Map of poster_id -> set of screens it should be on (for the updated screens)
    new_assignments: dict[uuid.UUID, set[str]] = {}
    for screen_id, pids in payload.assignments.items():
        sid = screen_id.strip().lower()
        for pid in pids:
            if pid not in new_assignments:
                new_assignments[pid] = set()
            new_assignments[pid].add(sid)

    # 3. Fetch all posters for this event to update their strings
    # (In a large event this might be many posters, but typically posters are in the hundreds)
    result = await db.execute(select(Poster).where(Poster.event_id == event.id))
    posters = result.scalars().all()
    
    total_updated = 0
    for p in posters:
        # Get current screens as a set
        current_screens = set()
        if p.display_screen:
            current_screens = {s.strip().lower() for s in p.display_screen.split(",") if s.strip()}
        
        # Remove any screens that were part of this batch update
        current_screens -= updated_screens
        
        # Add any new screens assigned to this poster in this batch
        if p.id in new_assignments:
            current_screens |= new_assignments[p.id]
        
        # Generate new string
        new_val = ",".join(sorted(list(current_screens))) if current_screens else None
        
        if p.display_screen != new_val:
            p.display_screen = new_val
            total_updated += 1
                
    await db.commit()
    return MessageResponse(message=f"Synced configuration for {len(payload.assignments)} screens. Updated {total_updated} poster records.")


@router.post("/batch-status", response_model=MessageResponse)
async def batch_update_posters_status(
    event: CurrentEvent,
    payload: PosterBatchStatusRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Batch update the status of multiple posters."""
    q = select(Poster).where(
        Poster.id.in_(payload.poster_ids),
        Poster.event_id == event.id
    )

    # Enforce assignments for restricted roles
    if current_user.role not in ["super_admin", "admin", "organiser"]:
        from app.modules.rbac.models.rbac import UserAccessNode
        from app.modules.events.models.session import Session
        from app.modules.rbac.models.user_assignment import UserEventAssignment
        from sqlalchemy import or_, and_

        # Get assigned node IDs
        nodes_result = await db.execute(
            select(UserAccessNode.node_id, UserAccessNode.node_type)
            .where(UserAccessNode.user_id == current_user.id)
        )
        nodes = nodes_result.all()
        assigned_event_ids = {n.node_id for n in nodes if n.node_type == 'EVENT'}
        assigned_room_ids = {n.node_id for n in nodes if n.node_type == 'ROOM'}
        assigned_session_ids = {n.node_id for n in nodes if n.node_type == 'SESSION'}
        
        legacy_result = await db.execute(
            select(UserEventAssignment.event_id).where(UserEventAssignment.user_id == current_user.id)
        )
        assigned_event_ids.update(legacy_result.scalars().all())

        if event.id not in assigned_event_ids:
            q = q.where(
                or_(
                    Poster.session_id.in_(assigned_session_ids),
                    Poster.session_id.in_(
                        select(Session.id).where(Session.room_id.in_(assigned_room_ids))
                    )
                )
            )

    result = await db.execute(q)
    posters = result.scalars().all()
    
    updated_count = 0
    for p in posters:
        p.status = payload.status
        if payload.status == "approved":
            p.reviewed_by = current_user.id
            p.reviewed_at = datetime.now(timezone.utc)
            p.rejection_reason = None
        updated_count += 1
            
    await db.commit()
    return MessageResponse(message=f"Successfully updated status for {updated_count} poster(s).")


@router.post("/batch-delete", response_model=MessageResponse)
async def batch_delete_posters(
    event: CurrentEvent,
    user: OrganizerOrAbove,
    payload: dict = Body(...), # { poster_ids: uuid[] }
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Batch delete multiple posters."""
    poster_ids = payload.get("poster_ids", [])
    if not poster_ids:
        return MessageResponse(message="No posters selected for deletion.")
        
    q = select(Poster).where(
        Poster.id.in_(poster_ids),
        Poster.event_id == event.id
    )

    # Enforce assignments for restricted roles
    if user.role not in ["super_admin", "admin", "organiser"]:
        from app.modules.rbac.models.rbac import UserAccessNode
        from app.modules.events.models.session import Session
        from app.modules.rbac.models.user_assignment import UserEventAssignment
        from sqlalchemy import or_, and_

        # Get assigned node IDs
        nodes_result = await db.execute(
            select(UserAccessNode.node_id, UserAccessNode.node_type)
            .where(UserAccessNode.user_id == user.id)
        )
        nodes = nodes_result.all()
        assigned_event_ids = {n.node_id for n in nodes if n.node_type == 'EVENT'}
        assigned_room_ids = {n.node_id for n in nodes if n.node_type == 'ROOM'}
        assigned_session_ids = {n.node_id for n in nodes if n.node_type == 'SESSION'}
        
        legacy_result = await db.execute(
            select(UserEventAssignment.event_id).where(UserEventAssignment.user_id == user.id)
        )
        assigned_event_ids.update(legacy_result.scalars().all())

        if event.id not in assigned_event_ids:
            q = q.where(
                or_(
                    Poster.session_id.in_(assigned_session_ids),
                    Poster.session_id.in_(
                        select(Session.id).where(Session.room_id.in_(assigned_room_ids))
                    )
                )
            )

    result = await db.execute(q)
    posters = result.scalars().all()
    
    deleted_count = 0
    for p in posters:
        # Avoid deleting approved posters unless explicitly rejected first (optional safety)
        if p.status == "approved":
            continue
        await db.delete(p)
        deleted_count += 1
            
    await db.commit()
    return MessageResponse(message=f"Successfully deleted {deleted_count} poster(s).")


# ── Helper ────────────────────────────────────────────────────

async def _get_poster_or_404(
    db: AsyncSession, 
    poster_id: uuid.UUID, 
    event_id: uuid.UUID,
    user: Optional[User] = None
) -> Poster:
    result = await db.execute(
        select(Poster).where(Poster.id == poster_id, Poster.event_id == event_id)
    )
    p = result.scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Poster not found.")
    
    # Enforce assignments for restricted roles
    if user and user.role not in ["super_admin", "admin", "organiser"]:
        from app.modules.rbac.models.rbac import UserAccessNode
        from app.modules.events.models.session import Session
        from sqlalchemy import or_, and_

        # Check if assigned to the event, or the specific session/room of this poster
        assignment_check = await db.execute(
            select(UserAccessNode).where(
                UserAccessNode.user_id == user.id,
                or_(
                    and_(UserAccessNode.node_id == event_id, UserAccessNode.node_type == 'EVENT'),
                    and_(UserAccessNode.node_id == p.session_id, UserAccessNode.node_type == 'SESSION'),
                    and_(
                        UserAccessNode.node_type == 'ROOM',
                        UserAccessNode.node_id.in_(
                            select(Session.room_id).where(Session.id == p.session_id)
                        )
                    )
                )
            )
        )
        if not assignment_check.scalar_one_or_none():
            # Check legacy assignments as fallback
            from app.modules.rbac.models.user_assignment import UserEventAssignment
            legacy_check = await db.execute(
                select(UserEventAssignment).where(
                    UserEventAssignment.user_id == user.id,
                    UserEventAssignment.event_id == event_id
                )
            )
            if not legacy_check.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, 
                    detail="You do not have permission to access this poster."
                )

    return p
