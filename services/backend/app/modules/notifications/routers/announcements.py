import uuid
import httpx
import re
from datetime import datetime, timezone
from typing import List, Optional, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status, UploadFile, File, Form
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db, get_current_user, get_current_event, CurrentEvent
from app.modules.identity.models.user import User
from app.modules.communications.models.announcement import Announcement
from app.modules.notifications.schemas.announcement import (
    AnnouncementCreate, AnnouncementUpdate, AnnouncementResponse,
    LinkVerificationRequest, LinkVerificationResponse
)
from app.schemas.common import MessageResponse
from app.services import upload_service
from app.core.dependencies.feature_gate import require_event_operation
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.events.models.event import Event

router = APIRouter(tags=["announcements"])


@router.post("/events/{event_id}/announcements", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED, dependencies=[require_event_operation("announcements.manage")])
async def create_announcement(
    event: CurrentEvent,
    data: AnnouncementCreate,
    idempotency_key: str = Header(
        ..., alias="Idempotency-Key", min_length=8, max_length=200
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new event-wide announcement (organizer only)."""
    if current_user.role not in ["super_admin", "admin", "organiser"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to create announcements."
        )

    attachments_dump = None
    announcement_id = data.id or uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"eventos:announcement:{event.organization_id}:{idempotency_key}",
    )
    if data.attachments:
        attachments_dump = [item.model_dump() for item in data.attachments]
        expected_prefix = (
            f"{event.organization_id}/{event.id}/announcements/{announcement_id}/"
        )
        if any(
            item.get("type") == "file"
            and (
                not item.get("storage_path")
                or not item["storage_path"].startswith(expected_prefix)
            )
            for item in attachments_dump
        ):
            raise HTTPException(
                status_code=422,
                detail={"code": "INVALID_ANNOUNCEMENT_ATTACHMENT_SCOPE"},
            )

    existing = await db.get(Announcement, announcement_id)
    if existing is not None:
        expected = {
            "event_id": event.id,
            "created_by": current_user.id,
            "title": data.title,
            "body": data.body,
            "audience": data.audience,
            "priority": data.priority,
            "is_pinned": data.is_pinned,
            "scheduled_at": data.scheduled_at,
            "expires_at": data.expires_at,
            "attachments": attachments_dump,
        }
        if all(getattr(existing, key) == value for key, value in expected.items()):
            return existing
        raise HTTPException(
            status_code=409,
            detail={"code": "IDEMPOTENCY_CONFLICT"},
        )

    announcement = Announcement(
        id=announcement_id,
        event_id=event.id,
        title=data.title,
        body=data.body,
        audience=data.audience,
        priority=data.priority,
        is_pinned=data.is_pinned,
        scheduled_at=data.scheduled_at,
        expires_at=data.expires_at,
        attachments=attachments_dump,
        created_by=current_user.id
    )
    db.add(announcement)
    await db.commit()
    await db.refresh(announcement)
    return announcement


@router.get("/events/{event_id}/announcements", response_model=List[AnnouncementResponse], dependencies=[require_event_operation("announcements.read")])
async def list_announcements(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    """List all announcements for the event (organizer list)."""
    stmt = (
        select(Announcement)
        .where(Announcement.event_id == event.id, Announcement.deleted_at.is_(None))
        .order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.delete("/events/{event_id}/announcements/{announcement_id}", response_model=MessageResponse, dependencies=[require_event_operation("announcements.manage")])
async def delete_announcement(
    event: CurrentEvent,
    announcement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an announcement."""
    if current_user.role not in ["super_admin", "admin", "organiser"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete announcements."
        )

    stmt = select(Announcement).where(
        Announcement.id == announcement_id,
        Announcement.event_id == event.id,
        Announcement.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    ann = result.scalar_one_or_none()
    
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    ann.deleted_at = datetime.now(timezone.utc)
    ann.deleted_by = current_user.id
    await db.commit()
    return MessageResponse(message="Announcement archived and remains recoverable through Command Center.")


@router.post("/events/{event_id}/announcements/upload", dependencies=[require_event_operation("announcements.manage")])
async def upload_announcement_file(
    event: CurrentEvent,
    announcement_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    idempotency_key: str = Header(
        ..., alias="Idempotency-Key", min_length=8, max_length=200
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload an announcement attachment file directly to storage."""
    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read upload file: {str(e)}")

    reservation = await UsageReservationService.reserve(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        limit_key="storage_quota_mb",
        quantity=max(1, (len(contents) + 1024 * 1024 - 1) // (1024 * 1024)),
        unit="megabyte",
        idempotency_key=f"announcement-upload:{idempotency_key}",
        metadata={
            "announcement_id": str(announcement_id),
            "consumption_quantity": len(contents),
            "consumption_unit": "byte",
        },
    )

    # Construct safe path
    filename = file.filename
    clean_filename = re.sub(r"[^A-Za-z0-9._-]+", "_", filename)
    storage_path = f"{event.organization_id}/{event.id}/announcements/{announcement_id}/{clean_filename}"
    bucket = settings.S3_BUCKET_ASSETS

    # Upload bytes
    try:
        upload_service.upload_bytes(
            bucket=bucket,
            storage_path=storage_path,
            data=contents,
            content_type=file.content_type or "application/octet-stream"
        )
    except Exception as e:
        await UsageReservationService.release(db, reservation.id)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to upload attachment: {str(e)}")

    await UsageReservationService.consume(
        db,
        reservation.id,
        source="organizer_portal.announcements.upload",
        actor_user_id=current_user.id,
    )
    await db.commit()

    # Resolve access URL
    if settings.STORAGE_MODE == "local":
        url = f"{settings.API_BASE_URL}{settings.api_v1_prefix}/storage/{bucket}/{storage_path}"
    else:
        url = f"{settings.S3_ENDPOINT_URL}/{bucket}/{storage_path}"

    return {
        "type": "file",
        "name": filename,
        "size": len(contents),
        "url": url,
        "storage_path": storage_path
    }


@router.post("/events/{event_id}/announcements/verify-link", response_model=LinkVerificationResponse, dependencies=[require_event_operation("announcements.manage")])
async def verify_external_link(
    event: CurrentEvent,
    payload: LinkVerificationRequest,
):
    """Verifies reachability of an external URL and extracts its HTML page title."""
    url = payload.url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            headers = {"User-Agent": "Mozilla/5.0 (EventOS Link Verifier)"}
            response = await client.get(url, headers=headers, follow_redirects=True)
            if response.status_code == 200:
                html = response.text
                title_match = re.search(r"<title>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
                title = title_match.group(1).strip() if title_match else url
                # Decode HTML entities if any
                import html as html_lib
                title = html_lib.unescape(title)
                return LinkVerificationResponse(url=url, reachable=True, title=title[:100])
            return LinkVerificationResponse(url=url, reachable=False, title=None)
    except Exception:
        return LinkVerificationResponse(url=url, reachable=False, title=None)


# ── Portal-level active announcement endpoints ─────────────────────────

@router.get("/portal/announcements/signed-url")
async def get_presigned_download_url(
    storage_path: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Generate a short-lived presigned GET URL for an announcement file.
    Does NOT force attachment disposition so that PDFs can render in iframe.
    """
    parts = storage_path.split("/")
    if len(parts) < 5 or parts[2] != "announcements":
        raise HTTPException(status_code=404, detail="Announcement attachment not found")
    try:
        organization_id = uuid.UUID(parts[0])
        event_id = uuid.UUID(parts[1])
        announcement_id = uuid.UUID(parts[3])
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="Announcement attachment not found")

    now = datetime.now(timezone.utc)
    row = await db.execute(
        select(Announcement, Event)
        .join(Event, Event.id == Announcement.event_id)
        .where(
            Announcement.id == announcement_id,
            Announcement.event_id == event_id,
            Announcement.deleted_at.is_(None),
            Event.organization_id == organization_id,
            Event.deleted_at.is_(None),
            or_(Announcement.scheduled_at.is_(None), Announcement.scheduled_at <= now),
            or_(Announcement.expires_at.is_(None), Announcement.expires_at > now),
        )
    )
    matched = row.first()
    if matched is None or not any(
        attachment.get("type") == "file"
        and attachment.get("storage_path") == storage_path
        for attachment in (matched[0].attachments or [])
    ):
        raise HTTPException(status_code=404, detail="Announcement attachment not found")

    bucket = settings.S3_BUCKET_ASSETS
    try:
        if settings.STORAGE_MODE == "local":
            # For local storage, return direct local URL
            url = f"{settings.API_BASE_URL}{settings.api_v1_prefix}/storage/{bucket}/{storage_path}"
        else:
            url = upload_service.create_presigned_download(
                bucket=bucket,
                storage_path=storage_path,
                expiry_seconds=1200 # 20 minutes short-lived URL
            )
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not generate signed URL: {str(e)}")
