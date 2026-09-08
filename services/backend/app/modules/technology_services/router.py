from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Header
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import OrganizerOrAbove, get_db
from app.modules.events.models.event import Event
from app.modules.technology_services.application.commands import TechnologyServiceCommandService
from app.modules.technology_services.application.queries import TechnologyServiceQueryService
from app.modules.technology_services.events import dispatch_staged_event, stage_event
from app.modules.technology_services.models import ServiceRequest, ServiceRequestEventSnapshot
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.core.concurrency import require_if_match

router = APIRouter(prefix="/service-requests", tags=["technology-services"])


class ServiceRequestCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: Optional[str] = None
    priority: str = Field(default="NORMAL", max_length=20)
    request_type: str = Field(default="VENUE_OPS", min_length=2, max_length=50)
    items: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    requirements: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    planning_overrides: dict[str, Any] = Field(default_factory=dict)

    @field_validator("items", "requirements")
    @classmethod
    def validate_items(cls, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        for item in value:
            if not str(item.get("description") or item.get("name") or item.get("service_definition_id") or item.get("service_id") or item.get("requirement_type") or "").strip():
                raise ValueError("Each service requirement needs a description or catalogue reference.")
            if int(item.get("quantity", 1)) < 1:
                raise ValueError("Requirement quantity must be at least 1.")
        return value


class ServiceRequestUpdate(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    planning_overrides: dict[str, Any] = Field(default_factory=dict)
    description: Optional[str] = None
    expected_version: int | None = Field(default=None, ge=1)

    @field_validator("items")
    @classmethod
    def validate_items(cls, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        for item in value:
            if not str(item.get("description") or item.get("name") or item.get("service_definition_id") or "").strip():
                raise ValueError("Each service requirement needs a description or catalogue reference.")
            if int(item.get("quantity", 1)) < 1:
                raise ValueError("Requirement quantity must be at least 1.")
        return value


class TransitionRequest(BaseModel):
    expected_version: int | None = Field(default=None, ge=1)


class CommentCreate(BaseModel):
    body: str = Field(min_length=3, max_length=5000)


class AttachmentCreate(BaseModel):
    upload_id: uuid.UUID


def _tenant_event(user, event: Event, event_id: uuid.UUID) -> None:
    platform_admin = getattr(user, "role", None) == "super_admin" or getattr(user, "platform_role", None) == "SUPER_ADMIN" or getattr(user, "is_platform_admin", False)
    if event is None or (getattr(user, "organization_id", None) != event.organization_id and not platform_admin):
        raise HTTPException(status_code=404, detail="Event not found.")


def _out(row: ServiceRequest) -> dict[str, Any]:
    return {"id": str(row.id), "organization_id": str(row.organization_id), "event_id": str(row.event_id), "request_number": row.request_number, "title": row.title, "description": row.description, "status": row.status, "priority": row.priority, "request_type": row.request_type, "requested_by": str(row.requested_by), "version": row.version, "event_snapshot": row.event_snapshot, "planning_overrides": row.planning_overrides, "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None, "items": [{"id": str(item.id), "description": item.description, "quantity": item.quantity, "service_definition_id": str(item.service_definition_id) if item.service_definition_id else None, "template_type": item.template_type, "template_id": str(item.template_id) if item.template_id else None, "template_version": item.template_version, "source": item.source, "duration_days": item.duration_days, "room_scope": item.room_scope, "configuration": item.configuration, "notes": item.notes, "included_scope": item.included_scope, "excluded_scope": item.excluded_scope} for item in getattr(row, "items", [])]}


@router.post("")
async def create_service_request(event_id: uuid.UUID, payload: ServiceRequestCreate = Body(...), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    row = await TechnologyServiceCommandService(db).create(
        event_id=event_id,
        user=user,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        request_type=payload.request_type,
        items=[*payload.items, *payload.requirements],
        planning_overrides=payload.planning_overrides,
    )
    return _out(row)


@router.post("/events/{event_id}/venue-ops/requests")
async def create_venue_ops_request(event_id: uuid.UUID, payload: ServiceRequestCreate = Body(...), idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", min_length=8, max_length=128), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    idempotency_key = idempotency_key or f"legacy-{uuid.uuid4()}"
    idem = await begin_idempotent(db, organization_id=user.organization_id, actor_id=user.id, operation="venue_ops.request.create", key=idempotency_key, payload={"event_id": str(event_id), **payload.model_dump(mode="json")})
    replay = replay_response(idem)
    if replay:
        return replay[1]
    row = await TechnologyServiceCommandService(db).create(event_id=event_id, user=user, title=payload.title, description=payload.description, priority=payload.priority, request_type=payload.request_type or "VENUE_OPS", items=[*payload.items, *payload.requirements], planning_overrides=payload.planning_overrides)
    result = _out(row)
    await TechnologyServiceCommandService(db).complete_idempotent(idem, response_status=201, response_body=result, resource_id=row.id)
    return result


@router.get("/events/{event_id}/venue-ops/overview")
async def venue_ops_overview(event_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    result = await TechnologyServiceQueryService(db).venue_ops_overview(event_id=event_id, organization_id=user.organization_id)
    if not result: raise HTTPException(status_code=404, detail="Event not found.")
    return result


@router.get("/events/{event_id}/venue-ops/recommendations")
async def venue_ops_recommendations(event_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    result = await TechnologyServiceQueryService(db).venue_ops_recommendations(event_id=event_id, organization_id=user.organization_id)
    if not result: raise HTTPException(status_code=404, detail="Event not found.")
    return result


@router.get("/events/{event_id}/venue-ops/services")
async def venue_ops_services(event_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    event = await TechnologyServiceQueryService(db).get_event_for_scope(event_id=event_id, organization_id=user.organization_id)
    if event is None: raise HTTPException(status_code=404, detail="Event not found.")
    return await TechnologyServiceQueryService(db).venue_ops_service_definitions()


@router.post("/events/{event_id}/venue-ops/recommendations/recalculate")
async def recalculate_recommendations(event_id: uuid.UUID, payload: dict[str, Any] = Body(default={}), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    result = await TechnologyServiceQueryService(db).venue_ops_recommendations(event_id=event_id, organization_id=user.organization_id, overrides=payload.get("overrides") or {})
    if not result: raise HTTPException(status_code=404, detail="Event not found.")
    await TechnologyServiceCommandService(db).record_recommendation_snapshot(event_id=event_id, organization_id=user.organization_id, facts=result["facts"], overrides=payload.get("overrides") or {})
    return result


@router.get("/events/{event_id}/venue-ops/quotes")
async def venue_ops_quotes(event_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    event = await TechnologyServiceQueryService(db).get_event_for_scope(event_id=event_id, organization_id=user.organization_id)
    if event is None: raise HTTPException(status_code=404, detail="Event not found.")
    return await TechnologyServiceQueryService(db).venue_ops_quotes(
        event_id=event_id,
        organization_id=user.organization_id,
    )


@router.get("/events/{event_id}/venue-ops/fulfilment")
async def venue_ops_fulfilment(event_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    event = await TechnologyServiceQueryService(db).get_event_for_scope(event_id=event_id, organization_id=user.organization_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    return await TechnologyServiceQueryService(db).venue_ops_fulfilment(
        event_id=event_id,
        organization_id=user.organization_id,
    )


@router.patch("/{request_id}")
async def update_service_request(request_id: uuid.UUID, payload: ServiceRequestUpdate, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", min_length=8, max_length=128), if_match: str | None = Header(default=None, alias="If-Match"), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    idempotency_key = idempotency_key or f"legacy-{uuid.uuid4()}"
    expected_version = require_if_match(if_match) if if_match is not None else payload.expected_version
    idem = await begin_idempotent(db, organization_id=user.organization_id, actor_id=user.id, operation="venue_ops.request.update", key=idempotency_key, payload={"request_id": str(request_id), "expected_version": expected_version, **payload.model_dump(mode="json")})
    replay = replay_response(idem)
    if replay:
        return replay[1]
    row = await TechnologyServiceCommandService(db).save_draft(request_id=request_id, organization_id=user.organization_id, user=user, items=payload.items, overrides=payload.planning_overrides, description=payload.description, expected_version=expected_version)
    result = _out(row)
    await TechnologyServiceCommandService(db).complete_idempotent(idem, response_status=200, response_body=result, resource_id=row.id)
    return result


@router.post("/{request_id}/clarifications")
async def add_service_request_clarification(request_id: uuid.UUID, payload: CommentCreate, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", min_length=8, max_length=128), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    idempotency_key = idempotency_key or f"legacy-{uuid.uuid4()}"
    idem = await begin_idempotent(db, organization_id=user.organization_id, actor_id=user.id, operation="venue_ops.request.clarification", key=idempotency_key, payload={"request_id": str(request_id), **payload.model_dump(mode="json")})
    replay = replay_response(idem)
    if replay:
        return replay[1]
    comment = await TechnologyServiceCommandService(db).add_comment(request_id=request_id, organization_id=user.organization_id, user=user, body=payload.body)
    result = {"id": str(comment.id), "request_id": str(comment.request_id), "body": comment.body, "author_type": comment.author_type, "created_at": comment.created_at.isoformat()}
    await TechnologyServiceCommandService(db).complete_idempotent(idem, response_status=201, response_body=result, resource_id=comment.id)
    return result


@router.get("/{request_id}/timeline")
async def service_request_timeline(request_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    return await TechnologyServiceQueryService(db).request_timeline(request_id=request_id, organization_id=user.organization_id)


@router.get("/{request_id}/event-snapshots")
async def service_request_event_snapshots(request_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    snapshots = await TechnologyServiceQueryService(db).request_snapshots(request_id=request_id, organization_id=user.organization_id)
    if not snapshots and await TechnologyServiceQueryService(db).request_detail(request_id=request_id, organization_id=user.organization_id) is None:
        raise HTTPException(status_code=404, detail="Service request not found.")
    return snapshots


@router.get("/{request_id}/attachments")
async def service_request_attachments(request_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    attachments = await TechnologyServiceQueryService(db).request_attachments(request_id=request_id, organization_id=user.organization_id)
    if not attachments and await TechnologyServiceQueryService(db).request_detail(request_id=request_id, organization_id=user.organization_id) is None:
        raise HTTPException(status_code=404, detail="Service request not found.")
    return attachments


@router.post("/{request_id}/attachments", status_code=201)
async def attach_service_request_upload(request_id: uuid.UUID, payload: AttachmentCreate, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", min_length=8, max_length=128), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    idempotency_key = idempotency_key or f"legacy-{uuid.uuid4()}"
    idem = await begin_idempotent(db, organization_id=user.organization_id, actor_id=user.id, operation="venue_ops.request.attachment", key=idempotency_key, payload={"request_id": str(request_id), "upload_id": str(payload.upload_id)})
    replay = replay_response(idem)
    if replay:
        return replay[1]
    attachment = await TechnologyServiceCommandService(db).attach_upload(request_id=request_id, organization_id=user.organization_id, user=user, upload_id=payload.upload_id)
    result = {"id": str(attachment.id), "request_id": str(attachment.request_id), "file_name": attachment.file_name, "content_type": attachment.content_type, "size_bytes": attachment.size_bytes, "created_at": attachment.created_at.isoformat()}
    await TechnologyServiceCommandService(db).complete_idempotent(idem, response_status=201, response_body=result, resource_id=attachment.id)
    return result


@router.get("/{request_id}/overview")
async def service_request_overview(request_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    detail = await TechnologyServiceQueryService(db).request_detail(request_id=request_id, organization_id=user.organization_id)
    if detail is None: raise HTTPException(status_code=404, detail="Service request not found.")
    return detail


@router.get("/{request_id}/requirements")
async def service_request_requirements(request_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    detail = await TechnologyServiceQueryService(db).request_detail(request_id=request_id, organization_id=user.organization_id)
    if detail is None: raise HTTPException(status_code=404, detail="Service request not found.")
    return detail["items"]


@router.get("/{request_id}/history")
async def service_request_history(request_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    detail = await TechnologyServiceQueryService(db).request_detail(request_id=request_id, organization_id=user.organization_id)
    if detail is None: raise HTTPException(status_code=404, detail="Service request not found.")
    return []


@router.get("/{request_id}/activity-logs")
async def service_request_activity_logs(request_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    detail = await TechnologyServiceQueryService(db).request_detail(request_id=request_id, organization_id=user.organization_id)
    if detail is None: raise HTTPException(status_code=404, detail="Service request not found.")
    return []


@router.post("/{request_id}/remarks")
async def service_request_remark(request_id: uuid.UUID, payload: CommentCreate, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", min_length=8, max_length=128), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    return await add_service_request_clarification(request_id, payload, idempotency_key, db, user)


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
        groups.setdefault(row.status.lower(), []).append({"id": str(row.id), "request_number": row.request_number, "title": row.title, "status": row.status, "priority": row.priority, "request_type": row.request_type, "created_at": None, "updated_at": None})
    return {"columns": [{"key": key, "label": key.replace("_", " ").title(), "count": len(cards), "cards": cards} for key, cards in groups.items()], "limit": limit, "offset": offset}


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


async def _transition(request_id: uuid.UUID, target: str, db: AsyncSession, user, expected_version: int | None = None) -> dict[str, Any]:
    row = await TechnologyServiceCommandService(db).transition(
        request_id=request_id, target=target, organization_id=user.organization_id, expected_version=expected_version, actor_id=user.id
    )
    return _out(row)


@router.post("/{request_id}/submit")
async def submit_service_request(request_id: uuid.UUID, payload: TransitionRequest = Body(default=TransitionRequest()), idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", min_length=8, max_length=128), if_match: str | None = Header(default=None, alias="If-Match"), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    idempotency_key = idempotency_key or f"legacy-{uuid.uuid4()}"
    expected_version = require_if_match(if_match) if if_match is not None else payload.expected_version
    idem = await begin_idempotent(db, organization_id=user.organization_id, actor_id=user.id, operation="venue_ops.request.submit", key=idempotency_key, payload={"request_id": str(request_id), "expected_version": expected_version})
    replay = replay_response(idem)
    if replay:
        return replay[1]
    result = await _transition(request_id, "SUBMITTED", db, user, expected_version)
    await TechnologyServiceCommandService(db).complete_idempotent(idem, response_status=200, response_body=result, resource_id=request_id)
    return result


@router.post("/{request_id}/approve")
async def approve_service_request(request_id: uuid.UUID, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", min_length=8, max_length=128), if_match: str | None = Header(default=None, alias="If-Match"), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    idempotency_key = idempotency_key or f"legacy-{uuid.uuid4()}"
    expected_version = require_if_match(if_match) if if_match is not None else None
    idem = await begin_idempotent(db, organization_id=user.organization_id, actor_id=user.id, operation="venue_ops.request.approve", key=idempotency_key, payload={"request_id": str(request_id), "expected_version": expected_version})
    replay = replay_response(idem)
    if replay:
        return replay[1]
    result = await _transition(request_id, "IN_PROGRESS", db, user, expected_version)
    await TechnologyServiceCommandService(db).complete_idempotent(idem, response_status=200, response_body=result, resource_id=request_id)
    return result
