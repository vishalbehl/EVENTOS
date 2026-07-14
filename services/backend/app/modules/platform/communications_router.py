import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import SuperAdminOnly, get_db
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.maintenance_window import MaintenanceWindow
from app.modules.platform.models.platform_domain_tables import GlobalAnnouncement
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/platform/communications", tags=["Platform Communications"])


class GlobalAnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    content: str = Field(..., min_length=3)
    is_active: bool = True


class GlobalAnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=255)
    content: Optional[str] = Field(None, min_length=3)
    is_active: Optional[bool] = None


class GlobalAnnouncementResponse(BaseModel):
    id: uuid.UUID
    title: str
    content: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MaintenanceWindowCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: Optional[str] = None
    starts_at: datetime
    ends_at: datetime
    affected_services: Optional[List[str]] = None
    status: str = "SCHEDULED"

    @field_validator("ends_at")
    @classmethod
    def validate_window(cls, value: datetime, info):
        starts_at = info.data.get("starts_at")
        if starts_at and value <= starts_at:
            raise ValueError("ends_at must be after starts_at")
        return value


class MaintenanceWindowUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    description: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    affected_services: Optional[List[str]] = None
    status: Optional[str] = None
    notification_sent: Optional[bool] = None


class MaintenanceWindowResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    starts_at: datetime
    ends_at: datetime
    affected_services: Optional[List[str]] = None
    status: str
    notification_sent: bool
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DestructiveActionRequest(BaseModel):
    reason: str = Field(..., min_length=8, max_length=1000)


def _validate_status(value: Optional[str]) -> Optional[str]:
    if value is None:
        return value
    normalized = value.upper()
    allowed = {"SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"}
    if normalized not in allowed:
        raise HTTPException(status_code=422, detail=f"Unsupported maintenance status: {value}")
    return normalized


@router.get("/announcements", response_model=List[GlobalAnnouncementResponse])
async def list_global_announcements(
    current_user: SuperAdminOnly,
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(GlobalAnnouncement).order_by(GlobalAnnouncement.created_at.desc())
    if is_active is not None:
        stmt = stmt.where(GlobalAnnouncement.is_active == is_active)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/announcements", response_model=GlobalAnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_global_announcement(
    payload: GlobalAnnouncementCreate,
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db),
):
    announcement = GlobalAnnouncement(
        title=payload.title,
        content=payload.content,
        is_active=payload.is_active,
    )
    db.add(announcement)
    await db.commit()
    await db.refresh(announcement)
    return announcement


@router.get("/announcements/{announcement_id}", response_model=GlobalAnnouncementResponse)
async def get_global_announcement(
    announcement_id: uuid.UUID,
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db),
):
    announcement = await db.get(GlobalAnnouncement, announcement_id)
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return announcement


@router.patch("/announcements/{announcement_id}", response_model=GlobalAnnouncementResponse)
async def update_global_announcement(
    announcement_id: uuid.UUID,
    payload: GlobalAnnouncementUpdate,
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db),
):
    announcement = await db.get(GlobalAnnouncement, announcement_id)
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(announcement, key, value)

    await db.commit()
    await db.refresh(announcement)
    return announcement


@router.delete("/announcements/{announcement_id}", response_model=MessageResponse)
async def delete_global_announcement(
    announcement_id: uuid.UUID,
    current_user: SuperAdminOnly,
    payload: DestructiveActionRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    announcement = await db.get(GlobalAnnouncement, announcement_id)
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    db.add(AuditLog(
        organization_id=current_user.organization_id,
        actor_user_id=current_user.id,
        resource_type="global_announcement",
        resource_id=announcement.id,
        action_type="GLOBAL_ANNOUNCEMENT_DELETED",
        actor_role=current_user.platform_role or current_user.role,
        old_state={
            "title": announcement.title,
            "is_active": announcement.is_active,
            "created_at": announcement.created_at.isoformat() if announcement.created_at else None,
        },
        change_diff={"reason": payload.reason},
        is_sensitive=True,
    ))
    await db.delete(announcement)
    await db.commit()
    return MessageResponse(message="Global announcement deleted.")


@router.get("/maintenance-windows", response_model=List[MaintenanceWindowResponse])
async def list_maintenance_windows(
    current_user: SuperAdminOnly,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(MaintenanceWindow).order_by(MaintenanceWindow.starts_at.desc())
    normalized = _validate_status(status_filter)
    if normalized:
        stmt = stmt.where(MaintenanceWindow.status == normalized)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/maintenance-windows", response_model=MaintenanceWindowResponse, status_code=status.HTTP_201_CREATED)
async def create_maintenance_window(
    payload: MaintenanceWindowCreate,
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db),
):
    maintenance = MaintenanceWindow(
        title=payload.title,
        description=payload.description,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        affected_services=payload.affected_services,
        status=_validate_status(payload.status) or "SCHEDULED",
        created_by=current_user.id,
    )
    db.add(maintenance)
    await db.commit()
    await db.refresh(maintenance)
    return maintenance


@router.patch("/maintenance-windows/{window_id}", response_model=MaintenanceWindowResponse)
async def update_maintenance_window(
    window_id: uuid.UUID,
    payload: MaintenanceWindowUpdate,
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db),
):
    maintenance = await db.get(MaintenanceWindow, window_id)
    if not maintenance:
        raise HTTPException(status_code=404, detail="Maintenance window not found")

    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates:
        updates["status"] = _validate_status(updates["status"])
    starts_at = updates.get("starts_at", maintenance.starts_at)
    ends_at = updates.get("ends_at", maintenance.ends_at)
    if starts_at and ends_at and ends_at <= starts_at:
        raise HTTPException(status_code=422, detail="ends_at must be after starts_at")

    for key, value in updates.items():
        setattr(maintenance, key, value)
    maintenance.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(maintenance)
    return maintenance


@router.delete("/maintenance-windows/{window_id}", response_model=MessageResponse)
async def delete_maintenance_window(
    window_id: uuid.UUID,
    current_user: SuperAdminOnly,
    payload: DestructiveActionRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    maintenance = await db.get(MaintenanceWindow, window_id)
    if not maintenance:
        raise HTTPException(status_code=404, detail="Maintenance window not found")
    db.add(AuditLog(
        organization_id=current_user.organization_id,
        actor_user_id=current_user.id,
        resource_type="maintenance_window",
        resource_id=maintenance.id,
        action_type="MAINTENANCE_WINDOW_DELETED",
        actor_role=current_user.platform_role or current_user.role,
        old_state={
            "title": maintenance.title,
            "status": maintenance.status,
            "starts_at": maintenance.starts_at.isoformat() if maintenance.starts_at else None,
            "ends_at": maintenance.ends_at.isoformat() if maintenance.ends_at else None,
            "affected_services": maintenance.affected_services,
        },
        change_diff={"reason": payload.reason},
        is_sensitive=True,
    ))
    await db.delete(maintenance)
    await db.commit()
    return MessageResponse(message="Maintenance window deleted.")
