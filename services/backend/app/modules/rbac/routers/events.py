# backend/app/routers/events.py
from __future__ import annotations

import uuid
import asyncio
import math
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status, UploadFile, File, Form as FastAPIForm
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from loguru import logger
from app.modules.presentations.services import upload_service as _upload_service
from app.config import settings as _app_settings
import re as _re

from app.dependencies import (
    get_db, get_current_user, require_active_user,
    get_current_event, CurrentEvent, OrganizerOrAbove, AdminOrAbove, TokenDep
)
from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization
from app.modules.identity.models.user import User
from app.modules.rbac.schemas.event import EventCreate, EventUpdate, EventResponse, EventSummary
from app.schemas.common import MessageResponse
from app.core.dependencies.feature_gate import enforce_event_operation
from app.core.concurrency import require_if_match
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.events.services.event_mutation_service import EventMutationService
from app.modules.events.application.commands import EventCommandService
from app.modules.events.application.queries import EventQueryService
from app.modules.rbac.services.access_contexts import selected_request_context
from app.schemas.cursor_pagination import CursorPage

router = APIRouter(prefix="/events", tags=["events"])


async def _reserve_storage_upload(
    db: AsyncSession,
    *,
    event: Event,
    contents: bytes,
    idempotency_key: str,
    source: str,
):
    if len(contents) > int(event.max_file_size_mb) * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "code": "FILE_TOO_LARGE",
                "max_file_size_mb": event.max_file_size_mb,
            },
        )
    reserved_mb = max(1, math.ceil(len(contents) / (1024 * 1024)))
    return await UsageReservationService.reserve(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        limit_key="storage_quota_mb",
        quantity=reserved_mb,
        unit="megabytes",
        idempotency_key=idempotency_key,
        metadata={
            "source": source,
            "consumption_quantity": len(contents),
            "consumption_unit": "bytes",
        },
    )


@router.get("", response_model=List[EventSummary])
async def list_events(
    token: TokenDep,
    organization_id: Optional[uuid.UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status",
                                         pattern="^(draft|active|completed|archived)$"),
    search: Optional[str] = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> List[EventSummary]:
    """List events scoped to the authenticated user's organisation."""
    from app.modules.rbac.services.event_scope import listed_event_predicate
    from app.modules.rbac.services.access_contexts import selected_request_context
    target_org_id = token.active_organization_id
    if organization_id is not None and organization_id != target_org_id:
        raise HTTPException(404, detail={"code": "CONTEXT_NOT_FOUND"})
    delegated = token.access_mode == "DELEGATED"
    allowed_event_ids = select(Event.id).where(listed_event_predicate(db, current_user.id, target_org_id))
    if token.active_workspace_id is not None:
        allowed_event_ids = allowed_event_ids.where(Event.operational_workspace_id == token.active_workspace_id)
    if token.active_event_id is not None:
        allowed_event_ids = allowed_event_ids.where(Event.id == token.active_event_id)

    if not target_org_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ORGANIZATION_CONTEXT_REQUIRED"},
        )

    async with selected_request_context(db, current_user, token,
                                        event_id=token.active_event_id,
                                        action="EVENTS:VIEW" if delegated else None):
        events = await EventQueryService(db).list_offset(
            organization_id=target_org_id,
            page=page,
            page_size=page_size,
            status=status_filter,
            search=search,
            allowed_event_ids=allowed_event_ids,
        )
    return [EventSummary.model_validate(event) for event in events]


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    token: TokenDep,
    idempotency_key: str = Header(
        min_length=16,
        max_length=120,
        alias="Idempotency-Key",
    ),
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    if not token.active_organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ORGANIZATION_CONTEXT_REQUIRED"},
        )
    if token.access_mode != "DIRECT":
        raise HTTPException(status_code=403, detail={"code": "DIRECT_MEMBERSHIP_REQUIRED"})
    from app.modules.rbac.services.access_contexts import selected_request_context
    if payload.operational_workspace_id is None:
        payload = payload.model_copy(update={"operational_workspace_id": token.active_workspace_id})
    elif token.active_workspace_id is not None and payload.operational_workspace_id != token.active_workspace_id:
        raise HTTPException(status_code=404, detail={"code": "WORKSPACE_NOT_FOUND"})
    async with selected_request_context(db, current_user, token, action="EVENTS:CREATE", write=True):
        event = await EventCommandService.create(
            db,
            organization_id=token.active_organization_id,
            actor_user_id=current_user.id,
            payload=payload,
            idempotency_key=idempotency_key,
            source="organizer_portal",
        )
    return EventResponse.model_validate(event)


@router.get("/page", response_model=CursorPage[EventSummary])
async def list_events_page(
    token: TokenDep,
    organization_id: Optional[uuid.UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(draft|active|completed|archived)$"),
    search: Optional[str] = Query(None, max_length=100),
    page_size: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = Query(None, max_length=512),
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> CursorPage[EventSummary]:
    """Cursor pagination uses the same customer scope as the offset route."""
    from app.modules.rbac.services.event_scope import listed_event_predicate
    from app.modules.rbac.services.access_contexts import selected_request_context
    target_org_id = token.active_organization_id
    if organization_id is not None and organization_id != target_org_id:
        raise HTTPException(404, detail={"code": "CONTEXT_NOT_FOUND"})
    if not target_org_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "ORGANIZATION_CONTEXT_REQUIRED"})
    delegated = token.access_mode == "DELEGATED"
    allowed_event_ids = select(Event.id).where(listed_event_predicate(db, current_user.id, target_org_id))
    if token.active_workspace_id is not None:
        allowed_event_ids = allowed_event_ids.where(Event.operational_workspace_id == token.active_workspace_id)
    if token.active_event_id is not None:
        allowed_event_ids = allowed_event_ids.where(Event.id == token.active_event_id)

    async with selected_request_context(db, current_user, token,
                                        event_id=token.active_event_id,
                                        action="EVENTS:VIEW" if delegated else None):
        page = await EventQueryService(db).list_page(
            organization_id=target_org_id,
            page_size=page_size,
            cursor=cursor,
            status=status_filter,
            search=search,
            allowed_event_ids=allowed_event_ids,
        )
    return CursorPage(
        items=[EventSummary.model_validate(event) for event in page.items],
        next_cursor=page.next_cursor,
        has_next=page.has_next,
    )


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(event: CurrentEvent) -> EventResponse:
    """Get an event through accepted membership and explicit container scope."""
    return EventResponse.model_validate(event)


@router.get("/{event_id}/needs-attention", response_model=list[dict])
async def get_event_needs_attention(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Return actionable event setup/operations tasks for organizer pages."""
    from app.modules.organiser.router import _attention_for_event

    return await _attention_for_event(db, event)


@router.patch("/{event_id}", response_model=EventResponse)
async def update_event(
    payload: EventUpdate,
    event: CurrentEvent,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> EventResponse:
    expected_version = require_if_match(if_match)
    if idempotency_key is None:
        raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    if not 16 <= len(idempotency_key.strip()) <= 160:
        raise HTTPException(400, detail={"code": "INVALID_IDEMPOTENCY_KEY"})
    updated, _, _ = await EventCommandService.update(
        db,
        event=event,
        payload=payload,
        actor_user_id=current_user.id,
        expected_version=expected_version,
        idempotency_key=idempotency_key,
    )
    return EventResponse.model_validate(updated)


@router.delete("/{event_id}", response_model=MessageResponse)
async def delete_event(
    event: CurrentEvent,
    current_user: OrganizerOrAbove,
    token: TokenDep,
    if_match: int = Header(..., alias="If-Match", ge=1),
    reason: str = Header(..., alias="X-Change-Reason", min_length=12, max_length=1000),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Soft-delete an event; permanent purge is a governed lifecycle job."""
    async with selected_request_context(
        db, current_user, token, event_id=event.id, action="EVENTS:DELETE", write=True,
    ):
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "events.planning.manage",
            user_id=current_user.id,
        )
        archived = await EventCommandService.archive(
            db,
            event=event,
            actor_user_id=current_user.id,
            actor_role=current_user.platform_role or current_user.role,
            reason=reason,
            expected_version=if_match,
            idempotency_key=idempotency_key,
        )
    if archived.deleted_at is None:
        return MessageResponse(message="Event is already archived for recovery.")
    return MessageResponse(
        message="Event archived. It remains recoverable until its retention window expires."
    )


@router.post("/{event_id}/publish", response_model=EventResponse)
async def publish_event(
    event: CurrentEvent,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(
        None, alias="Idempotency-Key", min_length=16, max_length=160
    ),
) -> EventResponse:
    """Transition event from draft → active."""
    await enforce_event_operation(
        db, event.organization_id, event.id, "events.planning.manage",
        user_id=current_user.id,
    )
    if event.status != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Event is '{event.status}', not 'draft'.")
    published = await EventCommandService.publish(
        db,
        event=event,
        actor_user_id=current_user.id,
        idempotency_key=idempotency_key,
    )
    return EventResponse.model_validate(published)



@router.post("/{event_id}/archive", response_model=EventResponse)
async def archive_event(
    event: CurrentEvent,
    current_user: OrganizerOrAbove,
    token: TokenDep,
    if_match: int = Header(..., alias="If-Match", ge=1),
    reason: str = Header(..., alias="X-Change-Reason", min_length=12, max_length=1000),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    async with selected_request_context(
        db, current_user, token, event_id=event.id, action="EVENTS:DELETE", write=True,
    ):
        await enforce_event_operation(
            db, event.organization_id, event.id, "events.planning.manage",
            user_id=current_user.id,
        )
        archived = await EventCommandService.archive(
            db,
            event=event,
            actor_user_id=current_user.id,
            actor_role=current_user.platform_role or current_user.role,
            reason=reason,
            expected_version=if_match,
            idempotency_key=idempotency_key,
        )
    return EventResponse.model_validate(archived)

@router.post(
    "/{event_id}/clear-data",
    response_model=MessageResponse,
    deprecated=True,
    include_in_schema=False,
)
async def clear_event_data(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    del db
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "COMMAND_CENTER_LIFECYCLE_JOB_REQUIRED",
            "message": (
                "Bulk data clearing is unavailable in Organizer Portal. "
                "Create a previewed, approved lifecycle job in Command Center."
            ),
            "event_id": str(event.id),
        },
    )


# ── Branding Image Upload ─────────────────────────────────────────────────────

@router.post("/{event_id}/branding/upload", response_model=dict)
async def upload_branding_image(
    event: CurrentEvent,
    current_user: OrganizerOrAbove,
    file: UploadFile = File(...),
    field: str = FastAPIForm(...),   # "logo" | "header"
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Authenticated branding image upload.
    - field="logo"   → stores URL in branding_settings.logo_url  (replaces)
    - field="header" → appends URL to branding_settings.header_images list
    Returns the new full branding_settings dict.
    """
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "branding.logo.manage",
        user_id=current_user.id,
    )
    if field not in ("logo", "header"):
        raise HTTPException(status_code=400, detail="field must be 'logo' or 'header'")

    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")
    reservation = await _reserve_storage_upload(
        db,
        event=event,
        contents=contents,
        idempotency_key=f"branding:{idempotency_key}",
        source="event_branding_upload",
    )

    def _clean(text: str) -> str:
        return _re.sub(r"[^A-Za-z0-9\-]+", "_", text.strip()).strip("_")

    event_slug = _clean(event.short_code or str(event.id))
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    filename = f"{uuid.uuid4().hex[:8]}.{ext}"
    # Branding objects use the same verified tenant namespace as every other
    # S3-compatible object. The event short code is descriptive only; it must
    # never replace the organization boundary in the object key.
    storage_path = f"{event.organization_id}/{event_slug}/branding/{field}/{filename}"
    bucket = "event_branding"

    try:
        await asyncio.to_thread(
            _upload_service.upload_bytes,
            bucket=bucket,
            storage_path=storage_path,
            data=contents,
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as e:
        await UsageReservationService.release(db, reservation.id)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    if _app_settings.STORAGE_MODE == "local":
        url = f"{_app_settings.API_BASE_URL}{_app_settings.api_v1_prefix}/storage/{bucket}/{storage_path}"
    else:
        url = await asyncio.to_thread(
            _upload_service.create_presigned_download,
            bucket=bucket,
            storage_path=storage_path,
            expiry_seconds=31_536_000,
        )

    # Persist immediately to branding_settings
    branding = dict(event.branding_settings or {})
    if field == "logo":
        branding["logo_url"] = url
    else:  # header
        images = list(branding.get("header_images", []))
        images.append(url)
        branding["header_images"] = images
        if images:
            branding["banner_url"] = images[0]   # backward compat

    event.branding_settings = branding
    await UsageReservationService.consume(
        db,
        reservation.id,
        source="event_branding_upload",
        actor_user_id=current_user.id,
    )
    await db.commit()
    await db.refresh(event)

    return {"url": url, "branding_settings": dict(event.branding_settings)}


@router.post("/{event_id}/speaker-branding/upload", response_model=dict)
async def upload_speaker_branding_image(
    event: CurrentEvent,
    current_user: OrganizerOrAbove,
    file: UploadFile = File(...),
    field: str = FastAPIForm(...),   # "logo" | "header"
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Authenticated speaker branding image or template upload.
    - field="logo"          → stores URL in speaker_settings.branding.logo_url  (replaces)
    - field="header"        → appends URL to speaker_settings.branding.header_images list
    - field="template_file" → stores URL in speaker_settings.profile_settings.template_url
    Returns the new full speaker settings dict.
    """
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "branding.logo.manage",
        user_id=current_user.id,
    )
    if field not in ("logo", "header", "template_file"):
        raise HTTPException(status_code=400, detail="field must be 'logo', 'header', or 'template_file'")

    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")
    reservation = await _reserve_storage_upload(
        db,
        event=event,
        contents=contents,
        idempotency_key=f"speaker-branding:{idempotency_key}",
        source="speaker_branding_upload",
    )

    def _clean(text: str) -> str:
        return _re.sub(r"[^A-Za-z0-9\-]+", "_", text.strip()).strip("_")

    event_slug = _clean(event.short_code or str(event.id))
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    filename = f"{uuid.uuid4().hex[:8]}.{ext}"
    storage_path = f"{event_slug}/speaker_branding/{field}/{filename}"
    bucket = "event_branding"

    try:
        await asyncio.to_thread(
            _upload_service.upload_bytes,
            bucket=bucket,
            storage_path=storage_path,
            data=contents,
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as e:
        await UsageReservationService.release(db, reservation.id)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    if _app_settings.STORAGE_MODE == "local":
        url = f"{_app_settings.API_BASE_URL}{_app_settings.api_v1_prefix}/storage/{bucket}/{storage_path}"
    else:
        url = await asyncio.to_thread(
            _upload_service.create_presigned_download,
            bucket=bucket,
            storage_path=storage_path,
            expiry_seconds=31_536_000,
        )

    # Persist immediately to event.speaker_settings
    speaker_settings = dict(event.speaker_settings or {})
    branding = dict(speaker_settings.get("branding", {}))
    
    if field == "logo":
        branding["logo_url"] = url
        speaker_settings["branding"] = branding
    elif field == "header":
        images = list(branding.get("header_images", []))
        images.append(url)
        branding["header_images"] = images
        if images:
            branding["banner_url"] = images[0]   # backward compat
        speaker_settings["branding"] = branding
    else:  # template_file
        profile_settings = dict(speaker_settings.get("profile_settings", {}))
        profile_settings["template_url"] = url
        profile_settings["template_filename"] = file.filename
        speaker_settings["profile_settings"] = profile_settings

    event.speaker_settings = speaker_settings
    await UsageReservationService.consume(
        db,
        reservation.id,
        source="speaker_branding_upload",
        actor_user_id=current_user.id,
    )
    await db.commit()
    await db.refresh(event)

    return {
        "url": url,
        "branding_settings": branding,
        "profile_settings": speaker_settings.get("profile_settings", {})
    }


@router.post(
    "/venue-images/upload-temp",
    response_model=dict,
    deprecated=True,
    include_in_schema=False,
)
async def upload_temp_venue_image(
    current_user: User = Depends(require_active_user),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Retired because pre-event files cannot be assigned to an immutable event
    contract or event-scoped storage allowance.
    """
    del current_user, file, db
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "EVENT_CONTEXT_REQUIRED",
            "message": (
                "Create and activate the event before uploading venue images "
                "so storage is enforced against its event contract."
            ),
        },
    )


@router.post("/{event_id}/venue-images/upload", response_model=dict)
async def upload_venue_image(
    event: CurrentEvent,
    current_user: OrganizerOrAbove,
    file: UploadFile = File(...),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Authenticated venue image upload.
    Appends the uploaded image URL to the event's `venue_images` array.
    """
    await enforce_event_operation(
        db, event.organization_id, event.id, "events.planning.manage",
        user_id=current_user.id,
    )
    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")
    reservation = await _reserve_storage_upload(
        db,
        event=event,
        contents=contents,
        idempotency_key=f"venue-image:{idempotency_key}",
        source="event_venue_image_upload",
    )

    def _clean(text: str) -> str:
        return _re.sub(r"[^A-Za-z0-9\-]+", "_", text.strip()).strip("_")

    event_slug = _clean(event.short_code or str(event.id))
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    filename = f"{uuid.uuid4().hex[:8]}.{ext}"
    storage_path = f"{event_slug}/venue/{filename}"
    bucket = "event_branding"

    try:
        await asyncio.to_thread(
            _upload_service.upload_bytes,
            bucket=bucket,
            storage_path=storage_path,
            data=contents,
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as e:
        await UsageReservationService.release(db, reservation.id)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    if _app_settings.STORAGE_MODE == "local":
        url = f"{_app_settings.API_BASE_URL}{_app_settings.api_v1_prefix}/storage/{bucket}/{storage_path}"
    else:
        url = await asyncio.to_thread(
            _upload_service.create_presigned_download,
            bucket=bucket,
            storage_path=storage_path,
            expiry_seconds=31_536_000,
        )

    # Append to venue_images list
    images = list(event.venue_images or [])
    images.append(url)
    event.venue_images = images
    await UsageReservationService.consume(
        db,
        reservation.id,
        source="event_venue_image_upload",
        actor_user_id=current_user.id,
    )
    await db.commit()
    await db.refresh(event)

    return {"url": url, "venue_images": event.venue_images}
