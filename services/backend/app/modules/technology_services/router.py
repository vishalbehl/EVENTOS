from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import OrganizerOrAbove, get_db
from app.core.tenant_context import TenantContextGuard
from app.modules.events.models.event import Event
from app.modules.technology_services.models import Requirement, ServiceRequest, ServiceRequestItem
from app.modules.technology_services.schemas import (
    ServiceRequestCreate,
    ServiceRequestKanbanOut,
    ServiceRequestKpiOut,
    ServiceRequestOut,
)


router = APIRouter(prefix="/service-requests", tags=["technology-services"])


def _request_query():
    return select(ServiceRequest).options(
        selectinload(ServiceRequest.items),
        selectinload(ServiceRequest.requirements),
    )


def _has_platform_scope(user) -> bool:
    return bool(
        user.role == "super_admin"
        or getattr(user, "platform_role", None) == "SUPER_ADMIN"
        or getattr(user, "is_platform_admin", False)
    )


def _target_organization_id(current_user, requested_organization_id: uuid.UUID | None) -> uuid.UUID:
    if _has_platform_scope(current_user):
        return requested_organization_id or current_user.organization_id
    if requested_organization_id and requested_organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Organization not found.")
    return current_user.organization_id


async def _authorized_event(
    db: AsyncSession,
    event_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> Event:
    event = await db.scalar(
        select(Event).where(
            Event.id == event_id,
            Event.organization_id == organization_id,
            Event.deleted_at.is_(None),
        )
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    return event


async def _authorized_request(
    db: AsyncSession, request_id: uuid.UUID, current_user
) -> ServiceRequest:
    query = _request_query().where(ServiceRequest.id == request_id)
    if not _has_platform_scope(current_user):
        query = query.where(ServiceRequest.organization_id == current_user.organization_id)
    service_request = await db.scalar(query)
    if not service_request:
        raise HTTPException(status_code=404, detail="Service request not found.")
    return service_request


@router.post("", response_model=ServiceRequestOut)
async def create_service_request(
    payload: ServiceRequestCreate,
    current_user: OrganizerOrAbove,
    event_id: uuid.UUID = Query(...),
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> ServiceRequest:
    target_org_id = _target_organization_id(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org_id):
        event = await _authorized_event(db, event_id, target_org_id)
        now = datetime.now(timezone.utc)
        service_request = ServiceRequest(
            organization_id=event.organization_id,
            event_id=event_id,
            request_number=f"SR-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
            title=payload.title,
            description=payload.description,
            status="DRAFT",
            priority=payload.priority.upper(),
            request_type=payload.request_type,
            requested_by=current_user.id,
            created_at=now,
            updated_at=now,
        )
        service_request.items = [ServiceRequestItem(**item.model_dump()) for item in payload.items]
        service_request.requirements = [Requirement(**item.model_dump()) for item in payload.requirements]
        db.add(service_request)
        await db.commit()
        return await _authorized_request(db, service_request.id, current_user)


@router.get("", response_model=list[ServiceRequestOut])
async def list_service_requests(
    current_user: OrganizerOrAbove,
    event_id: uuid.UUID = Query(...),
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[ServiceRequest]:
    target_org_id = _target_organization_id(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org_id):
        event = await _authorized_event(db, event_id, target_org_id)
        rows = await db.scalars(
            _request_query().where(
                ServiceRequest.organization_id == event.organization_id,
                ServiceRequest.event_id == event_id,
            ).order_by(ServiceRequest.created_at.desc())
        )
        return list(rows.unique().all())


@router.get("/kpi-strip", response_model=ServiceRequestKpiOut)
async def get_service_request_kpis(
    current_user: OrganizerOrAbove,
    event_id: uuid.UUID = Query(...),
    organization_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target_org_id = _target_organization_id(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org_id):
        event = await _authorized_event(db, event_id, target_org_id)
        result = await db.execute(
            select(ServiceRequest.status, func.count(ServiceRequest.id))
            .where(
                ServiceRequest.organization_id == event.organization_id,
                ServiceRequest.event_id == event.id,
            )
            .group_by(ServiceRequest.status)
        )
        status_counts = {str(row.status).upper(): int(row[1]) for row in result}
        total = sum(status_counts.values())
        closed = status_counts.get("COMPLETED", 0) + status_counts.get("CANCELLED", 0)
        return {"total": total, "open": max(total - closed, 0), "status_counts": status_counts}


@router.get("/kanban-columns", response_model=ServiceRequestKanbanOut)
async def get_service_request_kanban(
    current_user: OrganizerOrAbove,
    event_id: uuid.UUID = Query(...),
    organization_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target_org_id = _target_organization_id(current_user, organization_id)
    async with TenantContextGuard.scoped(db, target_org_id):
        event = await _authorized_event(db, event_id, target_org_id)
        count_result = await db.execute(
            select(ServiceRequest.status, func.count(ServiceRequest.id))
            .where(
                ServiceRequest.organization_id == event.organization_id,
                ServiceRequest.event_id == event.id,
            )
            .group_by(ServiceRequest.status)
        )
        counts = {str(row.status).upper(): int(row[1]) for row in count_result}
        canonical_statuses = ["DRAFT", "SUBMITTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]
        statuses = canonical_statuses + sorted(set(counts) - set(canonical_statuses))
        columns = []

        for request_status in statuses:
            cards = list((await db.scalars(
                select(ServiceRequest)
                .where(
                    ServiceRequest.organization_id == event.organization_id,
                    ServiceRequest.event_id == event.id,
                    ServiceRequest.status == request_status,
                )
                .order_by(ServiceRequest.updated_at.desc(), ServiceRequest.id)
                .offset(offset)
                .limit(limit)
            )).all())
            columns.append({
                "key": request_status.lower(),
                "label": request_status.replace("_", " ").title(),
                "count": counts.get(request_status, 0),
                "cards": cards,
            })

        return {"columns": columns, "limit": limit, "offset": offset}


@router.get("/{request_id}", response_model=ServiceRequestOut)
async def get_service_request(
    request_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> ServiceRequest:
    return await _authorized_request(db, request_id, current_user)


async def _transition(
    db: AsyncSession,
    service_request: ServiceRequest,
    expected: str,
    new_status: str,
) -> ServiceRequest:
    if service_request.status != expected:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Service request must be {expected} before transition to {new_status}.",
        )
    now = datetime.now(timezone.utc)
    service_request.status = new_status
    service_request.updated_at = now
    if new_status == "SUBMITTED":
        service_request.submitted_at = now
    if new_status == "IN_PROGRESS":
        service_request.approved_at = now
    await db.commit()
    return service_request


@router.post("/{request_id}/submit", response_model=ServiceRequestOut)
async def submit_service_request(
    request_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> ServiceRequest:
    service_request = await _authorized_request(db, request_id, current_user)
    await _transition(db, service_request, "DRAFT", "SUBMITTED")
    return await _authorized_request(db, request_id, current_user)


@router.post("/{request_id}/approve", response_model=ServiceRequestOut)
async def approve_service_request(
    request_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> ServiceRequest:
    service_request = await _authorized_request(db, request_id, current_user)
    await _transition(db, service_request, "SUBMITTED", "IN_PROGRESS")
    return await _authorized_request(db, request_id, current_user)
