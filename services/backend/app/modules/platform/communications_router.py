import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import StepUpAuth, SuperAdminOnly, get_db
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.maintenance_window import MaintenanceWindow
from app.modules.platform.models.platform_domain_tables import GlobalAnnouncement
from app.modules.platform.application.communications_commands import PlatformCommunicationsCommandService
from app.modules.platform.application.queries import PlatformCommunicationsQueryService
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/platform/communications", tags=["Platform Communications"])


class GlobalAnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    content: str = Field(..., min_length=3)
    is_active: bool = True
    reason: str = Field(..., min_length=12, max_length=1000)


class GlobalAnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=255)
    content: Optional[str] = Field(None, min_length=3)
    is_active: Optional[bool] = None
    reason: str = Field(..., min_length=12, max_length=1000)


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
    reason: str = Field(..., min_length=12, max_length=1000)

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
    reason: str = Field(..., min_length=12, max_length=1000)


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
    return await PlatformCommunicationsQueryService(db).list_announcements(is_active=is_active)


@router.post("/announcements", response_model=GlobalAnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_global_announcement(
    payload: GlobalAnnouncementCreate,
    current_user: SuperAdminOnly,
    step_up: StepUpAuth,
    db: AsyncSession = Depends(get_db),
):
    del step_up
    announcement = await PlatformCommunicationsCommandService(db).create_announcement(
        user=current_user, title=payload.title, content=payload.content,
        is_active=payload.is_active, reason=payload.reason
    )
    return announcement


@router.get("/announcements/{announcement_id}", response_model=GlobalAnnouncementResponse)
async def get_global_announcement(
    announcement_id: uuid.UUID,
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db),
):
    announcement = await PlatformCommunicationsQueryService(db).get_announcement(
        announcement_id=announcement_id
    )
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return announcement


@router.patch("/announcements/{announcement_id}", response_model=GlobalAnnouncementResponse)
async def update_global_announcement(
    announcement_id: uuid.UUID,
    payload: GlobalAnnouncementUpdate,
    current_user: SuperAdminOnly,
    step_up: StepUpAuth,
    db: AsyncSession = Depends(get_db),
):
    del step_up
    updates = payload.model_dump(exclude_unset=True, exclude={"reason"})
    announcement = await PlatformCommunicationsCommandService(db).update_announcement(
        user=current_user, announcement_id=announcement_id, updates=updates, reason=payload.reason
    )
    return announcement


@router.delete("/announcements/{announcement_id}", response_model=MessageResponse)
async def delete_global_announcement(
    announcement_id: uuid.UUID,
    current_user: SuperAdminOnly,
    step_up: StepUpAuth,
    payload: DestructiveActionRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    del step_up
    await PlatformCommunicationsCommandService(db).delete_announcement(
        user=current_user, announcement_id=announcement_id, reason=payload.reason
    )
    return MessageResponse(message="Global announcement deleted.")


@router.get("/maintenance-windows", response_model=List[MaintenanceWindowResponse])
async def list_maintenance_windows(
    current_user: SuperAdminOnly,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
):
    normalized = _validate_status(status_filter)
    return await PlatformCommunicationsQueryService(db).list_maintenance_windows(status=normalized)


@router.post("/maintenance-windows", response_model=MaintenanceWindowResponse, status_code=status.HTTP_201_CREATED)
async def create_maintenance_window(
    payload: MaintenanceWindowCreate,
    current_user: SuperAdminOnly,
    step_up: StepUpAuth,
    db: AsyncSession = Depends(get_db),
):
    del step_up
    maintenance = await PlatformCommunicationsCommandService(db).create_maintenance(
        user=current_user, values=payload.model_dump(exclude={"reason"}), reason=payload.reason
    )
    return maintenance


@router.patch("/maintenance-windows/{window_id}", response_model=MaintenanceWindowResponse)
async def update_maintenance_window(
    window_id: uuid.UUID,
    payload: MaintenanceWindowUpdate,
    current_user: SuperAdminOnly,
    step_up: StepUpAuth,
    db: AsyncSession = Depends(get_db),
):
    del step_up
    updates = payload.model_dump(exclude_unset=True, exclude={"reason"})
    maintenance = await PlatformCommunicationsCommandService(db).update_maintenance(
        user=current_user, window_id=window_id, updates=updates, reason=payload.reason
    )
    return maintenance


@router.delete("/maintenance-windows/{window_id}", response_model=MessageResponse)
async def delete_maintenance_window(
    window_id: uuid.UUID,
    current_user: SuperAdminOnly,
    step_up: StepUpAuth,
    payload: DestructiveActionRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    del step_up
    await PlatformCommunicationsCommandService(db).delete_maintenance(
        user=current_user, window_id=window_id, reason=payload.reason
    )
    return MessageResponse(message="Maintenance window deleted.")
