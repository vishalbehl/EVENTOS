import uuid
import httpx
import re
from datetime import datetime, timezone
from typing import List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
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

router = APIRouter(tags=["announcements"])


@router.post("/events/{event_id}/announcements", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    event: CurrentEvent,
    data: AnnouncementCreate,
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
    if data.attachments:
        attachments_dump = [item.model_dump() for item in data.attachments]

    announcement = Announcement(
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


@router.get("/events/{event_id}/announcements", response_model=List[AnnouncementResponse])
async def list_announcements(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    """List all announcements for the event (organizer list)."""
    stmt = (
        select(Announcement)
        .where(Announcement.event_id == event.id)
        .order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.delete("/events/{event_id}/announcements/{announcement_id}", response_model=MessageResponse)
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
        Announcement.event_id == event.id
    )
    result = await db.execute(stmt)
    ann = result.scalar_one_or_none()
    
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    # If there are uploaded file attachments, clean them up from storage
    if ann.attachments:
        for att in ann.attachments:
            if att.get("type") == "file" and att.get("storage_path"):
                try:
                    upload_service.delete_object(settings.S3_BUCKET_ASSETS, att["storage_path"])
                except Exception:
                    pass

    await db.delete(ann)
    await db.commit()
    return MessageResponse(message="Announcement deleted successfully.")


@router.post("/events/{event_id}/announcements/upload")
async def upload_announcement_file(
    event: CurrentEvent,
    announcement_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
):
    """Upload an announcement attachment file directly to storage."""
    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read upload file: {str(e)}")

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
        raise HTTPException(status_code=500, detail=f"Failed to upload attachment: {str(e)}")

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


@router.post("/events/{event_id}/announcements/verify-link", response_model=LinkVerificationResponse)
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
