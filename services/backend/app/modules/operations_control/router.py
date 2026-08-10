from __future__ import annotations

import hashlib
import json
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import and_, desc, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.config import settings
from app.core.encryption import decrypt, encrypt
from app.dependencies import StepUpAuth, get_db
from app.modules.audit.models.audit_log import AuditLog
from app.modules.deployment_management.models import Risk, RiskAction, RiskComment, RiskEvidence
from app.modules.events.models.event import Event
from app.modules.files.models.file import Asset
from app.modules.identity.models.user import User
from app.modules.operations_control.models import JobControlRequest, SourceApiKey
from app.modules.operations_planning.models import Project
from app.modules.platform.models.organization import Organization
from app.modules.search.models.search import SearchJob
from app.modules.superadmin.dependencies import require_super_admin
from app.modules.technology_services.models import RequestAssignment, ServiceRequest, ServiceSlaTarget
from app.modules.venue.models.room_device import RoomDevice
from app.modules.venue.models.venue_sync_job import VenueSyncJob


router = APIRouter(prefix="/platform/operations", tags=["platform-operations-control"])


def _problem(code: str, message: str, status_code: int = 409) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _fingerprint(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _audit(db: AsyncSession, actor: User, org_id: uuid.UUID, resource_type: str, resource_id: uuid.UUID, action: str, reason: str, state: dict[str, Any] | None = None) -> None:
    db.add(AuditLog(
        organization_id=org_id,
        actor_user_id=actor.id,
        actor_role=actor.platform_role or actor.role,
        resource_type=resource_type,
        resource_id=resource_id,
        action_type=action,
        new_state={"reason": reason, **(state or {})},
        is_sensitive=action in {"JOB_CANCEL_REQUESTED", "SEARCH_REINDEX_REQUESTED", "RISK_ACCEPTED", "VENUE_CREDENTIAL_CHANGED", "SOURCE_API_KEY_CREATED", "SOURCE_API_KEY_REVOKED"},
    ))


class ReasonedCommand(BaseModel):
    organization_id: uuid.UUID
    event_id: Optional[uuid.UUID] = None
    reason: str = Field(min_length=12, max_length=1000)


class RequestPatch(BaseModel):
    organization_id: uuid.UUID
    version: int = Field(ge=1)
    priority: Optional[str] = None
    title: Optional[str] = Field(default=None, min_length=3, max_length=255)
    description: Optional[str] = Field(default=None, max_length=5000)
    reason: str = Field(min_length=12, max_length=1000)


class RequestAssign(BaseModel):
    organization_id: uuid.UUID
    version: int = Field(ge=1)
    assigned_to: uuid.UUID
    role: str = Field(min_length=2, max_length=100)
    reason: str = Field(min_length=12, max_length=1000)


class RequestTransition(BaseModel):
    organization_id: uuid.UUID
    version: int = Field(ge=1)
    target_status: str
    reason: str = Field(min_length=12, max_length=1000)


REQUEST_TRANSITIONS = {
    "DRAFT": {"SUBMITTED", "CANCELLED"},
    "SUBMITTED": {"TRIAGED", "REJECTED", "CANCELLED"},
    "TRIAGED": {"APPROVED", "REJECTED", "IN_PROGRESS"},
    "APPROVED": {"IN_PROGRESS", "CANCELLED"},
    "IN_PROGRESS": {"COMPLETED", "CANCELLED"},
    "COMPLETED": {"CLOSED"},
    "REJECTED": {"CLOSED"},
}


class RiskCreate(BaseModel):
    organization_id: uuid.UUID
    project_id: uuid.UUID
    title: str = Field(min_length=3, max_length=255)
    description: Optional[str] = None
    severity: str = "MEDIUM"
    probability: str = "MEDIUM"
    category: Optional[str] = None
    impact: Optional[str] = None
    owner_user_id: Optional[uuid.UUID] = None
    due_date: Optional[date] = None
    mitigation_plan: Optional[str] = None
    reason: str = Field(min_length=12, max_length=1000)


class RiskPatch(BaseModel):
    organization_id: uuid.UUID
    version: int = Field(ge=1)
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    probability: Optional[str] = None
    category: Optional[str] = None
    impact: Optional[str] = None
    owner_user_id: Optional[uuid.UUID] = None
    due_date: Optional[date] = None
    mitigation_plan: Optional[str] = None
    status: Optional[str] = None
    reason: str = Field(min_length=12, max_length=1000)


class RiskActionIn(BaseModel):
    organization_id: uuid.UUID
    action_description: str = Field(min_length=3)
    assigned_to: uuid.UUID
    due_date: Optional[date] = None
    reason: str = Field(min_length=12)


class RiskCommentIn(BaseModel):
    organization_id: uuid.UUID
    comment: str = Field(min_length=2, max_length=5000)


class RiskEvidenceIn(BaseModel):
    organization_id: uuid.UUID
    asset_id: uuid.UUID
    description: Optional[str] = None
    reason: str = Field(min_length=12)


class RiskDecision(BaseModel):
    organization_id: uuid.UUID
    version: int = Field(ge=1)
    reason: str = Field(min_length=12, max_length=2000)


class SourceKeyCreate(BaseModel):
    organization_id: uuid.UUID
    event_id: uuid.UUID
    source_type: Literal["registration_server", "venue_server"] = "registration_server"
    name: str = Field(default="Registration Server", min_length=2, max_length=120)
    permissions: dict[str, bool] = Field(default_factory=lambda: {"read": True, "push": True})
    expires_at: Optional[datetime] = None
    reason: str = Field(default="Source API key created from Operations Console.", min_length=12, max_length=1000)

    @field_validator("expires_at")
    @classmethod
    def expires_at_must_be_future(cls, value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return value
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        if value <= _now():
            raise ValueError("Expiration date and time must be in the future.")
        return value


class SourceKeyRevoke(BaseModel):
    organization_id: uuid.UUID
    reason: str = Field(min_length=12, max_length=1000)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _status_by_counts(*, failed: int = 0, stale: int = 0, active: int = 0, total: int = 0) -> str:
    if failed > 0:
        return "DEGRADED"
    if stale > 0:
        return "STALE"
    if active > 0 or total > 0:
        return "HEALTHY"
    return "UNAVAILABLE"


def _source_url() -> str:
    return f"{settings.API_BASE_URL.rstrip('/')}/api/v1/registration-source"


def _mask_api_key(raw_key: str | None) -> str | None:
    if not raw_key:
        return None
    if len(raw_key) <= 14:
        return "••••" + raw_key[-4:]
    return f"{raw_key[:7]}••••••••••{raw_key[-6:]}"


def _decrypt_source_key(key: SourceApiKey) -> str | None:
    encrypted = getattr(key, "api_key_encrypted", None)
    if not encrypted:
        return None
    try:
        return decrypt(encrypted)
    except Exception:
        return None


def _source_key_dict(key: SourceApiKey, organization: Organization | None = None, event: Event | None = None) -> dict[str, Any]:
    raw_key = _decrypt_source_key(key)
    source_url = _source_url()
    return {
        "id": str(key.id),
        "event_id": str(key.event_id),
        "organization_id": str(key.organization_id),
        "event_name": event.name if event else None,
        "organization_name": organization.name if organization else None,
        "name": key.name,
        "key_prefix": key.key_prefix,
        "masked_key": _mask_api_key(raw_key) or f"{key.key_prefix}••••••••••",
        "api_key": raw_key,
        "api_key_recoverable": raw_key is not None,
        "api_url": source_url,
        "source_url": source_url,
        "source_type": key.source_type,
        "permissions": key.permissions or {},
        "expires_at": key.expires_at.isoformat() if key.expires_at else None,
        "revoked_at": key.revoked_at.isoformat() if key.revoked_at else None,
        "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None,
        "created_by": str(key.created_by) if key.created_by else None,
        "created_at": key.created_at.isoformat() if key.created_at else None,
        "status": "REVOKED" if key.revoked_at else "EXPIRED" if key.expires_at and key.expires_at <= _now() else "ACTIVE",
    }


async def _event_for_org(db: AsyncSession, event_id: uuid.UUID, org_id: uuid.UUID) -> Event:
    event = await db.scalar(
        select(Event)
        .where(Event.id == event_id, Event.organization_id == org_id, Event.deleted_at.is_(None))
        .execution_options(skip_tenant_filter=True)
    )
    if event is None:
        raise _problem("NOT_FOUND", "Event not found.", 404)
    return event


async def _request_for_org(db: AsyncSession, request_id: uuid.UUID, org_id: uuid.UUID) -> ServiceRequest:
    row = await db.scalar(select(ServiceRequest).where(ServiceRequest.id == request_id, ServiceRequest.organization_id == org_id))
    if row is None:
        raise _problem("NOT_FOUND", "Service request not found.", 404)
    return row


async def _risk_for_org(db: AsyncSession, risk_id: uuid.UUID, org_id: uuid.UUID) -> tuple[Risk, Project]:
    result = await db.execute(select(Risk, Project).join(Project, Project.id == Risk.project_id).where(Risk.id == risk_id, Project.organization_id == org_id))
    row = result.first()
    if row is None:
        raise _problem("NOT_FOUND", "Risk not found.", 404)
    return row[0], row[1]


@router.get("/overview")
async def operations_overview(
    organization_id: Optional[uuid.UUID] = None,
    event_id: Optional[uuid.UUID] = None,
    source_type: Optional[Literal["cloud", "venue_server", "registration_server"]] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> dict[str, Any]:
    checked_at = _now()
    if event_id:
        event = await db.scalar(select(Event).where(Event.id == event_id, Event.deleted_at.is_(None)))
        if event is None:
            raise _problem("NOT_FOUND", "Event not found.", 404)
        if organization_id and event.organization_id != organization_id:
            raise _problem("NOT_FOUND", "Event not found for this organization.", 404)
        organization_id = event.organization_id

    def scoped(stmt):
        if organization_id is not None and hasattr(stmt.column_descriptions[0].get("entity"), "organization_id"):
            stmt = stmt.where(stmt.column_descriptions[0]["entity"].organization_id == organization_id)
        if event_id is not None and hasattr(stmt.column_descriptions[0].get("entity"), "event_id"):
            stmt = stmt.where(stmt.column_descriptions[0]["entity"].event_id == event_id)
        return stmt

    sources: list[dict[str, Any]] = []

    try:
        db_row = (await db.execute(text("""
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE state='active') AS active,
                   COUNT(*) FILTER (WHERE wait_event_type='Lock') AS waiting
            FROM pg_stat_activity WHERE datname=current_database()
        """))).one()
        db_status = "DEGRADED" if db_row.waiting else "HEALTHY"
        sources.append({"key": "cloud_db", "status": db_status, "freshness_at": checked_at.isoformat(), "detail": f"{db_row.active}/{db_row.total} active database connections; {db_row.waiting} waiting on locks."})
    except Exception:
        sources.append({"key": "cloud_db", "status": "DOWN", "freshness_at": None, "detail": "Database telemetry query failed."})

    asset_stmt = select(func.count(Asset.id), func.coalesce(func.sum(Asset.file_size_bytes), 0))
    if organization_id:
        asset_stmt = asset_stmt.where(Asset.organization_id == organization_id)
    try:
        object_count, total_bytes = (await db.execute(asset_stmt)).one()
        storage_status = "UNAVAILABLE" if object_count == 0 else "HEALTHY"
        provider_note = "local metadata" if settings.STORAGE_MODE == "local" else f"{settings.STORAGE_MODE} metadata"
        sources.append({"key": "storage", "status": storage_status, "freshness_at": checked_at.isoformat(), "detail": f"{object_count} tracked objects / {int(total_bytes)} bytes from {provider_note}."})
    except Exception:
        sources.append({"key": "storage", "status": "DOWN", "freshness_at": None, "detail": "Storage metadata query failed."})

    job_stmt = select(VenueSyncJob.status, func.count(VenueSyncJob.id), func.max(VenueSyncJob.created_at)).group_by(VenueSyncJob.status)
    if event_id:
        job_stmt = job_stmt.where(VenueSyncJob.event_id == event_id)
    try:
        rows = (await db.execute(job_stmt)).all()
        status_counts = {str(row[0]): int(row[1]) for row in rows}
        newest = max((row[2] for row in rows if row[2]), default=None)
        total = sum(status_counts.values())
        sources.append({"key": "venue_sync", "status": _status_by_counts(failed=status_counts.get("failed", 0), active=status_counts.get("in_progress", 0) + status_counts.get("pending", 0), total=total), "freshness_at": newest.isoformat() if newest else None, "detail": f"{status_counts.get('completed', 0)} completed, {status_counts.get('pending', 0)} pending, {status_counts.get('failed', 0)} failed sync jobs."})
    except Exception:
        sources.append({"key": "venue_sync", "status": "DOWN", "freshness_at": None, "detail": "Venue sync job query failed."})

    key_stmt = select(SourceApiKey)
    if organization_id:
        key_stmt = key_stmt.where(SourceApiKey.organization_id == organization_id)
    if event_id:
        key_stmt = key_stmt.where(SourceApiKey.event_id == event_id)
    if source_type in {"registration_server", "venue_server"}:
        key_stmt = key_stmt.where(SourceApiKey.source_type == source_type)
    try:
        keys = list((await db.scalars(key_stmt)).all())
        active_keys = [key for key in keys if key.revoked_at is None and (key.expires_at is None or key.expires_at > checked_at)]
        stale_keys = [key for key in active_keys if key.last_used_at and key.last_used_at < checked_at - timedelta(hours=2)]
        latest_used = max((key.last_used_at for key in keys if key.last_used_at), default=None)
        sources.append({"key": "source_api_keys", "status": _status_by_counts(stale=len(stale_keys), active=len(active_keys), total=len(keys)), "freshness_at": latest_used.isoformat() if latest_used else None, "detail": f"{len(active_keys)} active / {len(keys)} total source keys. Source URL: {_source_url()}"})
    except Exception:
        sources.append({"key": "source_api_keys", "status": "DOWN", "freshness_at": None, "detail": "Source API key query failed."})

    device_stmt = select(RoomDevice)
    if organization_id:
        device_stmt = device_stmt.where(RoomDevice.organization_id == organization_id)
    if event_id:
        device_stmt = device_stmt.where(RoomDevice.event_id == event_id)
    try:
        devices = list((await db.scalars(device_stmt)).all())
        online = [device for device in devices if device.status == "online"]
        stale = [device for device in online if (device.last_heartbeat_at or device.last_heartbeat or checked_at) < checked_at - timedelta(minutes=2)]
        latest_heartbeat = max(((device.last_heartbeat_at or device.last_heartbeat) for device in devices if (device.last_heartbeat_at or device.last_heartbeat)), default=None)
        sources.append({"key": "devices", "status": _status_by_counts(stale=len(stale), active=len(online), total=len(devices)), "freshness_at": latest_heartbeat.isoformat() if latest_heartbeat else None, "detail": f"{len(online)}/{len(devices)} devices online; {len(stale)} stale heartbeats."})
    except Exception:
        sources.append({"key": "devices", "status": "DOWN", "freshness_at": None, "detail": "Device heartbeat query failed."})

    requests_stmt = select(func.count(ServiceRequest.id))
    if organization_id:
        requests_stmt = requests_stmt.where(ServiceRequest.organization_id == organization_id)
    if event_id:
        requests_stmt = requests_stmt.where(ServiceRequest.event_id == event_id)
    open_requests = await db.scalar(requests_stmt.where(ServiceRequest.status.notin_(["COMPLETED", "CLOSED", "REJECTED", "CANCELLED"]))) or 0
    sources.append({"key": "requests", "status": "DEGRADED" if open_requests else "HEALTHY", "freshness_at": checked_at.isoformat(), "detail": f"{open_requests} open operational requests."})

    risk_stmt = select(func.count(Risk.id)).join(Project, Project.id == Risk.project_id)
    if organization_id:
        risk_stmt = risk_stmt.where(Project.organization_id == organization_id)
    if event_id:
        risk_stmt = risk_stmt.where(Project.event_id == event_id)
    open_risks = await db.scalar(risk_stmt.where(Risk.status.notin_(["RESOLVED", "CLOSED", "ACCEPTED"]))) or 0
    sources.append({"key": "risks", "status": "DEGRADED" if open_risks else "HEALTHY", "freshness_at": checked_at.isoformat(), "detail": f"{open_risks} unresolved operational risks."})

    priority = {"DOWN": 5, "DEGRADED": 4, "STALE": 3, "UNAVAILABLE": 2, "HEALTHY": 1}
    worst = max(sources, key=lambda item: priority.get(item["status"], 0))["status"] if sources else "UNAVAILABLE"
    overall = "HEALTHY" if worst == "HEALTHY" else worst
    return {
        "overall_status": overall,
        "checked_at": checked_at,
        "deployment_profile": settings.DEPLOYMENT_PROFILE,
        "source_url": _source_url(),
        "realtime": {"mode": "hybrid", "transport": "polling", "status": "CONNECTED"},
        "scope": {"organization_id": str(organization_id) if organization_id else None, "event_id": str(event_id) if event_id else None, "source_type": source_type},
        "sources": sources,
    }


@router.get("/storage")
async def storage_telemetry(
    organization_id: Optional[uuid.UUID] = None,
    event_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> dict[str, Any]:
    if event_id:
        event = await db.scalar(select(Event).where(Event.id == event_id, Event.deleted_at.is_(None)))
        if event is None:
            raise _problem("NOT_FOUND", "Event not found.", 404)
        if organization_id and event.organization_id != organization_id:
            raise _problem("NOT_FOUND", "Event not found for this organization.", 404)
        organization_id = event.organization_id
    base = select(Asset)
    if organization_id:
        base = base.where(Asset.organization_id == organization_id)
    scoped_assets = base.subquery()
    total, size = (await db.execute(select(func.count(scoped_assets.c.id), func.coalesce(func.sum(scoped_assets.c.file_size_bytes), 0)))).one()
    statuses = (await db.execute(select(scoped_assets.c.processing_status, func.count(scoped_assets.c.id), func.coalesce(func.sum(scoped_assets.c.file_size_bytes), 0)).group_by(scoped_assets.c.processing_status))).all()
    return {
        "provider_status": "HEALTHY" if settings.STORAGE_MODE == "local" else "UNVERIFIED",
        "provider_detail": "Local storage metadata is authoritative in local profile." if settings.STORAGE_MODE == "local" else "Database metadata is authoritative; object-provider quota and reachability are not configured for this request path.",
        "total_objects": total,
        "total_bytes": int(size),
        "capacity_bytes": None,
        "by_status": [{"status": row[0], "count": row[1], "bytes": int(row[2])} for row in statuses],
        "freshness_at": _now(),
        "scope": {"organization_id": str(organization_id) if organization_id else None, "event_id": str(event_id) if event_id else None},
    }


@router.get("/requests")
async def list_operational_requests(
    organization_id: Optional[uuid.UUID] = None, event_id: Optional[uuid.UUID] = None,
    request_status: Optional[str] = Query(None, alias="status"), priority: Optional[str] = None,
    request_type: Optional[str] = None, cursor: Optional[uuid.UUID] = None, limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin),
) -> dict[str, Any]:
    stmt = select(ServiceRequest).order_by(desc(ServiceRequest.created_at), desc(ServiceRequest.id))
    if organization_id: stmt = stmt.where(ServiceRequest.organization_id == organization_id)
    if event_id: stmt = stmt.where(ServiceRequest.event_id == event_id)
    if request_status: stmt = stmt.where(ServiceRequest.status == request_status.upper())
    if priority: stmt = stmt.where(ServiceRequest.priority == priority.upper())
    if request_type: stmt = stmt.where(ServiceRequest.request_type == request_type)
    if cursor:
        anchor = await db.scalar(select(ServiceRequest).where(ServiceRequest.id == cursor))
        if anchor: stmt = stmt.where(or_(ServiceRequest.created_at < anchor.created_at, and_(ServiceRequest.created_at == anchor.created_at, ServiceRequest.id < anchor.id)))
    rows = list((await db.scalars(stmt.limit(limit + 1))).all())
    return {"items": [_request_dict(row) for row in rows[:limit]], "next_cursor": str(rows[limit - 1].id) if len(rows) > limit else None, "has_next": len(rows) > limit}


def _request_dict(row: ServiceRequest) -> dict[str, Any]:
    return {"id": row.id, "organization_id": row.organization_id, "event_id": row.event_id, "request_number": row.request_number, "title": row.title, "description": row.description, "status": row.status, "priority": row.priority, "request_type": row.request_type, "version": row.version, "created_at": row.created_at, "updated_at": row.updated_at}


@router.get("/requests/{request_id}")
async def get_operational_request(request_id: uuid.UUID, organization_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, organization_id):
        row = await _request_for_org(db, request_id, organization_id)
        assignments = list((await db.scalars(select(RequestAssignment).where(RequestAssignment.request_id == request_id).order_by(desc(RequestAssignment.assigned_at)))).all())
        sla = await db.scalar(select(ServiceSlaTarget).where(ServiceSlaTarget.request_id == request_id))
        return {**_request_dict(row), "assignments": [{"id": a.id, "assigned_to": a.assigned_to, "role": a.role, "status": a.status, "assigned_at": a.assigned_at} for a in assignments], "sla": None if sla is None else {"response_deadline": sla.response_deadline, "resolution_deadline": sla.resolution_deadline, "responded_at": sla.responded_at, "resolved_at": sla.resolved_at}}


@router.patch("/requests/{request_id}")
async def patch_operational_request(request_id: uuid.UUID, body: RequestPatch, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        row = await _request_for_org(db, request_id, body.organization_id)
        if row.version != body.version: raise _problem("VERSION_CONFLICT", "Service request was changed by another user.")
        old = _request_dict(row)
        for field in ("priority", "title", "description"):
            value = getattr(body, field)
            if value is not None: setattr(row, field, value.upper() if field == "priority" else value)
        row.version += 1
        _audit(db, actor, body.organization_id, "service_request", row.id, "OPERATIONAL_REQUEST_UPDATED", body.reason, {"old": old, "version": row.version})
        await db.commit()
        return _request_dict(row)


@router.post("/requests/{request_id}/assign")
async def assign_operational_request(request_id: uuid.UUID, body: RequestAssign, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        row = await _request_for_org(db, request_id, body.organization_id)
        if row.version != body.version: raise _problem("VERSION_CONFLICT", "Service request was changed by another user.")
        await db.execute(text("UPDATE technology_services.request_assignments SET status='INACTIVE' WHERE request_id=:id AND status='ACTIVE'"), {"id": request_id})
        assignment = RequestAssignment(request_id=request_id, assigned_to=body.assigned_to, assigned_by=actor.id, role=body.role, status="ACTIVE")
        db.add(assignment); row.version += 1
        _audit(db, actor, body.organization_id, "service_request", row.id, "OPERATIONAL_REQUEST_ASSIGNED", body.reason, {"assigned_to": str(body.assigned_to), "version": row.version})
        await db.commit(); await db.refresh(assignment)
        return {"assignment_id": assignment.id, "version": row.version, "status": "ACTIVE"}


@router.post("/requests/{request_id}/transition")
async def transition_operational_request(request_id: uuid.UUID, body: RequestTransition, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        row = await _request_for_org(db, request_id, body.organization_id)
        target = body.target_status.upper()
        if row.version != body.version: raise _problem("VERSION_CONFLICT", "Service request was changed by another user.")
        if target not in REQUEST_TRANSITIONS.get(row.status.upper(), set()): raise _problem("INVALID_TRANSITION", f"Cannot transition {row.status} to {target}.")
        previous = row.status; row.status = target; row.version += 1
        now = datetime.now(timezone.utc)
        if target == "APPROVED": row.approved_at = now
        if target in {"COMPLETED", "CLOSED"}: row.completed_at = now
        _audit(db, actor, body.organization_id, "service_request", row.id, "OPERATIONAL_REQUEST_TRANSITIONED", body.reason, {"from": previous, "to": target, "version": row.version})
        await db.commit(); return _request_dict(row)


def _risk_dict(risk: Risk, project: Project) -> dict[str, Any]:
    return {"id": risk.id, "organization_id": project.organization_id, "event_id": project.event_id, "project_id": project.id, "title": risk.title, "description": risk.description, "severity": risk.severity, "probability": risk.probability, "category": risk.category, "impact": risk.impact, "owner_user_id": risk.owner_user_id, "due_date": risk.due_date, "mitigation_plan": risk.mitigation_plan, "status": risk.status, "version": risk.version, "accepted_by": risk.accepted_by, "accepted_at": risk.accepted_at, "resolved_at": risk.resolved_at}


@router.get("/risks")
async def list_risks(organization_id: Optional[uuid.UUID] = None, event_id: Optional[uuid.UUID] = None, risk_status: Optional[str] = Query(None, alias="status"), severity: Optional[str] = None, limit: int = Query(50, ge=1, le=100), db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin)) -> dict[str, Any]:
    stmt = select(Risk, Project).join(Project, Project.id == Risk.project_id).order_by(desc(Risk.id)).limit(limit)
    if organization_id: stmt = stmt.where(Project.organization_id == organization_id)
    if event_id: stmt = stmt.where(Project.event_id == event_id)
    if risk_status: stmt = stmt.where(Risk.status == risk_status.upper())
    if severity: stmt = stmt.where(Risk.severity == severity.upper())
    rows = (await db.execute(stmt)).all()
    return {"items": [_risk_dict(r, p) for r, p in rows]}


@router.get("/projects")
async def list_operations_projects(organization_id: Optional[uuid.UUID] = None, event_id: Optional[uuid.UUID] = None, limit: int = Query(200, ge=1, le=500), db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin)) -> dict[str, Any]:
    stmt = select(Project).order_by(Project.name).limit(limit)
    if organization_id: stmt = stmt.where(Project.organization_id == organization_id)
    if event_id: stmt = stmt.where(Project.event_id == event_id)
    rows = list((await db.scalars(stmt)).all())
    return {"items": [{"id": row.id, "organization_id": row.organization_id, "event_id": row.event_id, "name": row.name, "project_code": row.project_code, "status": row.status} for row in rows]}


@router.get("/risks/{risk_id}")
async def get_risk(risk_id: uuid.UUID, organization_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, organization_id):
        risk, project = await _risk_for_org(db, risk_id, organization_id)
        actions = list((await db.scalars(select(RiskAction).where(RiskAction.risk_id == risk.id))).all())
        comments = list((await db.scalars(select(RiskComment).where(RiskComment.risk_id == risk.id).order_by(desc(RiskComment.created_at)))).all())
        evidence = list((await db.scalars(select(RiskEvidence).where(RiskEvidence.risk_id == risk.id).order_by(desc(RiskEvidence.created_at)))).all())
        return {**_risk_dict(risk, project), "actions": [{"id": a.id, "description": a.action_description, "assigned_to": a.assigned_to, "due_date": a.due_date, "status": a.status} for a in actions], "comments": [{"id": c.id, "comment": c.comment, "created_by": c.created_by, "created_at": c.created_at} for c in comments], "evidence": [{"id": e.id, "asset_id": e.asset_id, "description": e.description, "created_at": e.created_at} for e in evidence]}


@router.post("/risks", status_code=201)
async def create_risk(body: RiskCreate, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        project = await db.scalar(select(Project).where(Project.id == body.project_id, Project.organization_id == body.organization_id))
        if project is None: raise _problem("NOT_FOUND", "Project not found.", 404)
        risk = Risk(project_id=project.id, title=body.title, description=body.description, severity=body.severity.upper(), probability=body.probability.upper(), category=body.category, impact=body.impact, owner_user_id=body.owner_user_id, due_date=body.due_date, mitigation_plan=body.mitigation_plan, status="IDENTIFIED", version=1)
        db.add(risk); await db.flush()
        _audit(db, actor, body.organization_id, "operational_risk", risk.id, "RISK_CREATED", body.reason)
        await db.commit(); return _risk_dict(risk, project)


@router.patch("/risks/{risk_id}")
async def patch_risk(risk_id: uuid.UUID, body: RiskPatch, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        risk, project = await _risk_for_org(db, risk_id, body.organization_id)
        if risk.version != body.version: raise _problem("VERSION_CONFLICT", "Risk was changed by another user.")
        for field in ("title", "description", "severity", "probability", "category", "impact", "owner_user_id", "due_date", "mitigation_plan", "status"):
            value = getattr(body, field)
            if value is not None: setattr(risk, field, value.upper() if field in {"severity", "probability", "status"} else value)
        risk.version += 1
        _audit(db, actor, body.organization_id, "operational_risk", risk.id, "RISK_UPDATED", body.reason, {"version": risk.version})
        await db.commit(); return _risk_dict(risk, project)


@router.post("/risks/{risk_id}/actions", status_code=201)
async def add_risk_action(risk_id: uuid.UUID, body: RiskActionIn, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        risk, _ = await _risk_for_org(db, risk_id, body.organization_id)
        action = RiskAction(risk_id=risk.id, action_description=body.action_description, assigned_to=body.assigned_to, due_date=body.due_date, status="PENDING")
        db.add(action); await db.flush(); _audit(db, actor, body.organization_id, "operational_risk", risk.id, "RISK_ACTION_ADDED", body.reason, {"action_id": str(action.id)})
        await db.commit(); return {"id": action.id, "status": action.status}


@router.post("/risks/{risk_id}/comments", status_code=201)
async def add_risk_comment(risk_id: uuid.UUID, body: RiskCommentIn, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        risk, _ = await _risk_for_org(db, risk_id, body.organization_id)
        comment = RiskComment(risk_id=risk.id, comment=body.comment, created_by=actor.id); db.add(comment); await db.commit(); await db.refresh(comment)
        return {"id": comment.id, "created_at": comment.created_at}


@router.post("/risks/{risk_id}/evidence", status_code=201)
async def add_risk_evidence(risk_id: uuid.UUID, body: RiskEvidenceIn, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        risk, _ = await _risk_for_org(db, risk_id, body.organization_id)
        asset = await db.scalar(select(Asset).where(Asset.id == body.asset_id, Asset.organization_id == body.organization_id, Asset.processing_status == "READY"))
        if asset is None: raise _problem("EVIDENCE_NOT_READY", "Evidence asset was not found or is not ready.", 422)
        evidence = RiskEvidence(organization_id=body.organization_id, risk_id=risk.id, asset_id=asset.id, description=body.description, created_by=actor.id)
        db.add(evidence); await db.flush(); _audit(db, actor, body.organization_id, "operational_risk", risk.id, "RISK_EVIDENCE_ADDED", body.reason, {"evidence_id": str(evidence.id)})
        await db.commit(); return {"id": evidence.id}


@router.post("/risks/{risk_id}/accept")
async def accept_risk(risk_id: uuid.UUID, body: RiskDecision, step_up: StepUpAuth, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    del step_up
    async with TenantContextGuard.scoped(db, body.organization_id):
        risk, project = await _risk_for_org(db, risk_id, body.organization_id)
        if risk.version != body.version: raise _problem("VERSION_CONFLICT", "Risk was changed by another user.")
        risk.status = "ACCEPTED"; risk.accepted_by = actor.id; risk.accepted_at = datetime.now(timezone.utc); risk.acceptance_reason = body.reason; risk.version += 1
        _audit(db, actor, body.organization_id, "operational_risk", risk.id, "RISK_ACCEPTED", body.reason, {"severity": risk.severity})
        await db.commit(); return _risk_dict(risk, project)


@router.post("/risks/{risk_id}/resolve")
async def resolve_risk(risk_id: uuid.UUID, body: RiskDecision, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        risk, project = await _risk_for_org(db, risk_id, body.organization_id)
        if risk.version != body.version: raise _problem("VERSION_CONFLICT", "Risk was changed by another user.")
        risk.status = "RESOLVED"; risk.resolved_at = datetime.now(timezone.utc); risk.version += 1
        _audit(db, actor, body.organization_id, "operational_risk", risk.id, "RISK_RESOLVED", body.reason)
        await db.commit(); return _risk_dict(risk, project)


@router.get("/venue/readiness")
async def venue_readiness(
    organization_id: Optional[uuid.UUID] = None,
    event_id: Optional[uuid.UUID] = None,
    source_type: Optional[Literal["cloud", "venue_server", "registration_server"]] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> dict[str, Any]:
    if event_id:
        event = await db.scalar(
            select(Event)
            .where(Event.id == event_id, Event.deleted_at.is_(None))
            .execution_options(skip_tenant_filter=True)
        )
        if event is None:
            raise _problem("NOT_FOUND", "Event not found.", 404)
        if organization_id and event.organization_id != organization_id:
            raise _problem("NOT_FOUND", "Event not found for this organization.", 404)
        organization_id = event.organization_id
    sync_stmt = select(VenueSyncJob).execution_options(skip_tenant_filter=True)
    if event_id:
        sync_stmt = sync_stmt.where(VenueSyncJob.event_id == event_id)
    sync_jobs = list((await db.scalars(sync_stmt.order_by(desc(VenueSyncJob.created_at)).limit(100))).all())
    key_stmt = select(SourceApiKey).execution_options(skip_tenant_filter=True)
    if organization_id:
        key_stmt = key_stmt.where(SourceApiKey.organization_id == organization_id)
    if event_id:
        key_stmt = key_stmt.where(SourceApiKey.event_id == event_id)
    if source_type in {"registration_server", "venue_server"}:
        key_stmt = key_stmt.where(SourceApiKey.source_type == source_type)
    source_keys = list((await db.scalars(key_stmt.order_by(desc(SourceApiKey.created_at)))).all())
    device_stmt = select(RoomDevice).execution_options(skip_tenant_filter=True)
    if organization_id:
        device_stmt = device_stmt.where(RoomDevice.organization_id == organization_id)
    if event_id:
        device_stmt = device_stmt.where(RoomDevice.event_id == event_id)
    devices = list((await db.scalars(device_stmt)).all())
    active_keys = [key for key in source_keys if key.revoked_at is None and (key.expires_at is None or key.expires_at > _now())]
    return {
        "freshness_at": _now(),
        "source_url": _source_url(),
        "deployment_profile": settings.DEPLOYMENT_PROFILE,
        "scope": {"organization_id": str(organization_id) if organization_id else None, "event_id": str(event_id) if event_id else None, "source_type": source_type},
        "server_sync": {
            "registration_server": {
                "active_keys": len([key for key in active_keys if key.source_type == "registration_server"]),
                "last_used_at": max((key.last_used_at for key in source_keys if key.source_type == "registration_server" and key.last_used_at), default=None),
            },
            "venue_server": {
                "active_keys": len([key for key in active_keys if key.source_type == "venue_server"]),
                "last_used_at": max((key.last_used_at for key in source_keys if key.source_type == "venue_server" and key.last_used_at), default=None),
            },
            "sync_jobs": {
                "total": len(sync_jobs),
                "pending": len([job for job in sync_jobs if job.status == "pending"]),
                "in_progress": len([job for job in sync_jobs if job.status == "in_progress"]),
                "completed": len([job for job in sync_jobs if job.status == "completed"]),
                "failed": len([job for job in sync_jobs if job.status == "failed"]),
                "last_completed_at": max((job.completed_at for job in sync_jobs if job.completed_at), default=None),
            },
            "devices": {
                "total": len(devices),
                "online": len([device for device in devices if device.status == "online"]),
                "latest_heartbeat_at": max(((device.last_heartbeat_at or device.last_heartbeat) for device in devices if (device.last_heartbeat_at or device.last_heartbeat)), default=None),
            },
        },
    }


@router.get("/source-access")
async def list_source_access(
    organization_id: Optional[uuid.UUID] = None,
    event_id: Optional[uuid.UUID] = None,
    source_type: Optional[Literal["registration_server", "venue_server"]] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> dict[str, Any]:
    if event_id:
        event = await db.scalar(
            select(Event)
            .where(Event.id == event_id, Event.deleted_at.is_(None))
            .execution_options(skip_tenant_filter=True)
        )
        if event is None:
            raise _problem("NOT_FOUND", "Event not found.", 404)
        if organization_id and event.organization_id != organization_id:
            raise _problem("NOT_FOUND", "Event not found for this organization.", 404)
        organization_id = event.organization_id
    stmt = (
        select(SourceApiKey, Organization, Event)
        .join(Event, Event.id == SourceApiKey.event_id)
        .join(Organization, Organization.id == SourceApiKey.organization_id)
        .order_by(desc(SourceApiKey.created_at))
        .execution_options(skip_tenant_filter=True)
    )
    if organization_id:
        stmt = stmt.where(SourceApiKey.organization_id == organization_id)
    if event_id:
        stmt = stmt.where(SourceApiKey.event_id == event_id)
    if source_type:
        stmt = stmt.where(SourceApiKey.source_type == source_type)
    rows = list((await db.execute(stmt)).all())
    items = [_source_key_dict(key, organization, event) for key, organization, event in rows]
    return {
        "source_url": _source_url(),
        "items": items,
        "freshness_at": _now(),
        "kpis": {
            "total": len(items),
            "active": len([item for item in items if item["status"] == "ACTIVE"]),
            "revoked": len([item for item in items if item["status"] == "REVOKED"]),
            "expired": len([item for item in items if item["status"] == "EXPIRED"]),
            "used": len([item for item in items if item["last_used_at"]]),
            "recoverable": len([item for item in items if item["api_key_recoverable"]]),
            "registration_server": len([item for item in items if item["source_type"] == "registration_server"]),
            "venue_server": len([item for item in items if item["source_type"] == "venue_server"]),
        },
    }


@router.post("/source-access", status_code=201)
async def create_source_access(
    body: SourceKeyCreate,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_super_admin),
) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        await _event_for_org(db, body.event_id, body.organization_id)
        raw_key = ("regsrc_" if body.source_type == "registration_server" else "vensrc_") + secrets.token_urlsafe(32)
        key = SourceApiKey(
            id=uuid.uuid4(),
            event_id=body.event_id,
            organization_id=body.organization_id,
            name=body.name.strip(),
            key_prefix=raw_key[:16],
            key_hash=hashlib.sha256(raw_key.encode("utf-8")).hexdigest(),
            api_key_encrypted=encrypt(raw_key),
            source_type=body.source_type,
            permissions=body.permissions or {"read": True, "push": True},
            expires_at=body.expires_at,
            created_by=actor.id,
        )
        db.add(key)
        await db.flush()
        _audit(db, actor, body.organization_id, "source_api_key", key.id, "SOURCE_API_KEY_CREATED", body.reason, {"event_id": str(body.event_id), "source_type": body.source_type, "idempotency_key": idempotency_key})
        await db.commit()
        await db.refresh(key)
        response = _source_key_dict(key)
        response["api_key"] = raw_key
        response["api_key_visible_once"] = False
        response["source_url"] = _source_url()
        return response


@router.post("/source-access/{key_id}/revoke")
async def revoke_source_access(
    key_id: uuid.UUID,
    body: SourceKeyRevoke,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_super_admin),
) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        key = await db.scalar(select(SourceApiKey).where(SourceApiKey.id == key_id, SourceApiKey.organization_id == body.organization_id))
        if key is None:
            raise _problem("NOT_FOUND", "Source API key not found.", 404)
        if key.revoked_at is None:
            key.revoked_at = _now()
            permissions = dict(key.permissions or {})
            permissions["revoked_reason"] = body.reason
            permissions["revoked_by"] = str(actor.id)
            key.permissions = permissions
            _audit(db, actor, body.organization_id, "source_api_key", key.id, "SOURCE_API_KEY_REVOKED", body.reason, {"event_id": str(key.event_id), "source_type": key.source_type})
        await db.commit()
        await db.refresh(key)
        return _source_key_dict(key)


async def _search_job_for_control(db: AsyncSession, source: str, job_id: str, org_id: uuid.UUID) -> SearchJob:
    if source != "search_index": raise _problem("JOB_ACTION_UNSUPPORTED", f"{source} does not declare a governed control adapter.")
    try: parsed = uuid.UUID(job_id)
    except ValueError: raise _problem("NOT_FOUND", "Job not found.", 404)
    job = await db.scalar(select(SearchJob).where(SearchJob.id == parsed, SearchJob.organization_id == org_id))
    if job is None: raise _problem("NOT_FOUND", "Job not found.", 404)
    return job


async def _job_control(db: AsyncSession, actor: User, source: str, job_id: str, body: ReasonedCommand, idempotency_key: str, operation: str) -> dict[str, Any]:
    fingerprint = _fingerprint({"source": source, "job_id": job_id, "organization_id": body.organization_id, "event_id": body.event_id, "reason": body.reason, "operation": operation})
    existing = await db.scalar(select(JobControlRequest).where(JobControlRequest.organization_id == body.organization_id, JobControlRequest.operation_type == operation, JobControlRequest.idempotency_key == idempotency_key))
    if existing:
        if existing.request_hash != fingerprint: raise _problem("IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different request.")
        return {"id": existing.id, "status": existing.status, "successor_job_id": existing.successor_job_id, "replayed": True}
    job = await _search_job_for_control(db, source, job_id, body.organization_id)
    control = JobControlRequest(organization_id=body.organization_id, event_id=body.event_id, source_type=source, source_job_id=job_id, operation_type=operation, idempotency_key=idempotency_key, request_hash=fingerprint, reason=body.reason, status="PENDING", requested_by=actor.id)
    db.add(control); await db.flush()
    now = datetime.now(timezone.utc)
    if operation == "CANCEL":
        if job.status not in {"pending", "queued"}: raise _problem("JOB_ACTION_UNSUPPORTED", "Only a queued search job can be cooperatively cancelled.")
        job.status = "cancelled"; job.finished_at = now; control.status = "SUCCEEDED"
    else:
        if job.status not in {"failed", "cancelled"}: raise _problem("JOB_ACTION_UNSUPPORTED", "Only failed or cancelled search jobs can be retried.")
        successor = SearchJob(organization_id=job.organization_id, status="pending", entity_types=job.entity_types, records_processed=0, requested_by=actor.id, request_reason=body.reason, predecessor_job_id=job.id, queued_at=now)
        db.add(successor); await db.flush(); control.successor_job_id = str(successor.id); control.status = "SUCCEEDED"
        try:
            from workers.tasks.search_tasks import reindex_organization
            reindex_organization.delay(str(job.organization_id), str(successor.id), successor.entity_types or [])
        except Exception as exc:
            successor.status = "failed"; successor.error_code = "QUEUE_UNAVAILABLE"; successor.error_detail = "Search worker dispatch failed."; successor.finished_at = now
            control.status = "FAILED"; control.failure_code = "QUEUE_UNAVAILABLE"; control.failure_detail = "Search worker dispatch failed."
    control.completed_at = now
    _audit(db, actor, body.organization_id, "background_job", control.id, f"JOB_{operation}_REQUESTED", body.reason, {"source": source, "source_job_id": job_id, "status": control.status})
    await db.commit()
    return {"id": control.id, "status": control.status, "successor_job_id": control.successor_job_id, "replayed": False}


@router.get("/jobs/{source}/{job_id}")
async def get_job_detail(source: str, job_id: str, organization_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, organization_id):
        job = await _search_job_for_control(db, source, job_id, organization_id)
        return {"id": job.id, "source": source, "organization_id": job.organization_id, "status": job.status, "entity_types": job.entity_types, "records_processed": job.records_processed, "error_code": job.error_code, "error_detail": job.error_detail, "created_at": job.created_at, "started_at": job.started_at, "finished_at": job.finished_at, "capabilities": {"retry": job.status in {"failed", "cancelled"}, "cancel": job.status in {"pending", "queued"}}}


@router.post("/jobs/{source}/{job_id}/retry", status_code=202)
async def retry_job(source: str, job_id: str, body: ReasonedCommand, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128), db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id): return await _job_control(db, actor, source, job_id, body, idempotency_key, "RETRY")


@router.post("/jobs/{source}/{job_id}/cancel", status_code=202)
async def cancel_job(source: str, job_id: str, body: ReasonedCommand, step_up: StepUpAuth, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128), db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    del step_up
    async with TenantContextGuard.scoped(db, body.organization_id): return await _job_control(db, actor, source, job_id, body, idempotency_key, "CANCEL")
