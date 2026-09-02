from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import OrganizerOrAbove, get_db
from app.modules.events.models.event import Event
from app.modules.technology_services.application.commands import TechnologyServiceCommandService
from app.modules.technology_services.application.queries import TechnologyServiceQueryService
from app.modules.technology_services.models import ServiceRequest

router = APIRouter(prefix="/service-requests", tags=["technology-services"])


class ServiceRequestCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: Optional[str] = None
    priority: str = Field(default="NORMAL", max_length=20)
    request_type: str = Field(min_length=2, max_length=50)
    items: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    requirements: list[dict[str, Any]] = Field(default_factory=list, max_length=100)


def _tenant_event(user, event: Event, event_id: uuid.UUID) -> None:
    platform_admin = getattr(user, "role", None) == "super_admin" or getattr(user, "platform_role", None) == "SUPER_ADMIN" or getattr(user, "is_platform_admin", False)
    if event is None or (getattr(user, "organization_id", None) != event.organization_id and not platform_admin):
        raise HTTPException(status_code=404, detail="Event not found.")


def _out(row: ServiceRequest) -> dict[str, Any]:
    return {"id": str(row.id), "organization_id": str(row.organization_id), "event_id": str(row.event_id), "request_number": row.request_number, "title": row.title, "description": row.description, "status": row.status, "priority": row.priority, "request_type": row.request_type, "requested_by": str(row.requested_by), "version": row.version}


@router.post("")
async def create_service_request(event_id: uuid.UUID, payload: ServiceRequestCreate = Body(...), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    row = await TechnologyServiceCommandService(db).create(
        event_id=event_id,
        user=user,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        request_type=payload.request_type,
        items=payload.items,
    )
    return _out(row)


@router.get("/kpi-strip")
async def service_request_kpis(event_id: uuid.UUID, organization_id: Optional[uuid.UUID] = None, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    event = await TechnologyServiceQueryService(db).get_event_for_scope(
        event_id=event_id,
        organization_id=user.organization_id,
        is_platform_admin=getattr(user, "role", None) == "super_admin",
    )
    _tenant_event(user, event, event_id)
    if organization_id and organization_id != event.organization_id and getattr(user, "role", None) != "super_admin":
        raise HTTPException(status_code=404, detail="Event not found.")
    return await TechnologyServiceQueryService(db).kpis(event_id=event_id, organization_id=event.organization_id)


@router.get("/kanban-columns")
async def service_request_kanban(event_id: uuid.UUID, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    event = await TechnologyServiceQueryService(db).get_event_for_scope(
        event_id=event_id,
        organization_id=user.organization_id,
        is_platform_admin=getattr(user, "role", None) == "super_admin",
    )
    _tenant_event(user, event, event_id)
    rows = await TechnologyServiceQueryService(db).kanban(event_id=event_id, organization_id=event.organization_id, limit=limit, offset=offset)
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        groups.setdefault(row.status.lower(), []).append({"id": str(row.id), "request_number": row.request_number, "title": row.title, "status": row.status, "priority": row.priority})
    return {"columns": [{"key": key, "count": len(cards), "cards": cards} for key, cards in groups.items()]}


@router.get("/{request_id}")
async def get_service_request(request_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    row = await TechnologyServiceQueryService(db).get(request_id=request_id, organization_id=user.organization_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Service request not found.")
    return _out(row)


@router.get("")
async def list_service_requests(event_id: uuid.UUID, limit: int = Query(100, ge=1, le=200), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    rows = await TechnologyServiceQueryService(db).list(event_id=event_id, organization_id=user.organization_id, limit=limit)
    return [_out(row) for row in rows]


async def _transition(request_id: uuid.UUID, target: str, db: AsyncSession, user) -> dict[str, Any]:
    row = await TechnologyServiceCommandService(db).transition(
        request_id=request_id, target=target, organization_id=user.organization_id
    )
    return _out(row)


@router.post("/{request_id}/submit")
async def submit_service_request(request_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    return await _transition(request_id, "SUBMITTED", db, user)


@router.post("/{request_id}/approve")
async def approve_service_request(request_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    return await _transition(request_id, "IN_PROGRESS", db, user)
