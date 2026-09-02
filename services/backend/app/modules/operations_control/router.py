from __future__ import annotations

import hashlib
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
from app.modules.events.models.event import Event
from app.modules.files.models.file import Asset
from app.modules.identity.models.user import User
from app.modules.operations_control.models import SourceApiKey, TaskFailure
from app.modules.operations_control.application.commands import OperationsControlCommandService
from app.modules.operations_control.application.queries import OperationsControlQueryService, TaskFailureQueryService
from app.modules.technology_services.models import ServiceRequest
from app.modules.platform.models.organization import Organization
from app.modules.superadmin.dependencies import require_super_admin
from app.modules.venue.models.room_device import RoomDevice
from app.modules.venue.models.venue_sync_job import VenueSyncJob


router = APIRouter(prefix="/platform/operations", tags=["platform-operations-control"])


@router.get("/task-failures")
async def list_task_failures(
    organization_id: Optional[uuid.UUID] = None,
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> list[dict[str, Any]]:
    """Return bounded terminal-task metadata for operational recovery."""
    return await TaskFailureQueryService(db).list_page(
        organization_id=organization_id,
        limit=limit,
    )


@router.post("/task-failures/{failure_id}/replay", status_code=202)
async def replay_task_failure(
    failure_id: uuid.UUID,
    body: ReasonedCommand,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_super_admin),
) -> dict[str, Any]:
    """Replay only sanitized, allow-listed dead-letter tasks."""
    async with TenantContextGuard.scoped(db, body.organization_id):
        return await OperationsControlCommandService(db).replay_task_failure(
            actor=actor,
            failure_id=failure_id,
            organization_id=body.organization_id,
            reason=body.reason,
            idempotency_key=idempotency_key,
        )


def _problem(code: str, message: str, status_code: int = 409) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


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


class RequestTransition(BaseModel):
    organization_id: uuid.UUID
    version: int = Field(ge=1)
    target_status: str = Field(min_length=2, max_length=40)
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
    event = await OperationsControlQueryService(db).event_for_scope(
        event_id=event_id,
        organization_id=org_id,
    )
    if event is None:
        raise _problem("NOT_FOUND", "Event not found.", 404)
    return event


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
        event = await OperationsControlQueryService(db).event_for_scope(
            event_id=event_id,
            organization_id=organization_id,
        )
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

    overview = await OperationsControlQueryService(db).overview_rows(
        organization_id=organization_id,
        event_id=event_id,
        source_type=source_type,
    )
    try:
        db_row = overview["db"]
        if db_row is None:
            raise RuntimeError("Database telemetry query failed.")
        db_status = "DEGRADED" if db_row.waiting else "HEALTHY"
        sources.append({"key": "cloud_db", "status": db_status, "freshness_at": checked_at.isoformat(), "detail": f"{db_row.active}/{db_row.total} active database connections; {db_row.waiting} waiting on locks."})
    except Exception:
        sources.append({"key": "cloud_db", "status": "DOWN", "freshness_at": None, "detail": "Database telemetry query failed."})

    try:
        asset_row = overview["assets"]
        if asset_row is None:
            raise RuntimeError("Storage metadata query failed.")
        object_count, total_bytes = asset_row
        storage_status = "UNAVAILABLE" if object_count == 0 else "HEALTHY"
        provider_note = "local metadata" if settings.STORAGE_MODE == "local" else f"{settings.STORAGE_MODE} metadata"
        sources.append({"key": "storage", "status": storage_status, "freshness_at": checked_at.isoformat(), "detail": f"{object_count} tracked objects / {int(total_bytes)} bytes from {provider_note}."})
    except Exception:
        sources.append({"key": "storage", "status": "DOWN", "freshness_at": None, "detail": "Storage metadata query failed."})

    try:
        rows = overview["sync_jobs"]
        if rows is None:
            raise RuntimeError("Venue sync job query failed.")
        status_counts = {str(row[0]): int(row[1]) for row in rows}
        newest = max((row[2] for row in rows if row[2]), default=None)
        total = sum(status_counts.values())
        sources.append({"key": "venue_sync", "status": _status_by_counts(failed=status_counts.get("failed", 0), active=status_counts.get("in_progress", 0) + status_counts.get("pending", 0), total=total), "freshness_at": newest.isoformat() if newest else None, "detail": f"{status_counts.get('completed', 0)} completed, {status_counts.get('pending', 0)} pending, {status_counts.get('failed', 0)} failed sync jobs."})
    except Exception:
        sources.append({"key": "venue_sync", "status": "DOWN", "freshness_at": None, "detail": "Venue sync job query failed."})

    try:
        keys = overview["source_keys"]
        if keys is None:
            raise RuntimeError("Source API key query failed.")
        active_keys = [key for key in keys if key.revoked_at is None and (key.expires_at is None or key.expires_at > checked_at)]
        stale_keys = [key for key in active_keys if key.last_used_at and key.last_used_at < checked_at - timedelta(hours=2)]
        latest_used = max((key.last_used_at for key in keys if key.last_used_at), default=None)
        sources.append({"key": "source_api_keys", "status": _status_by_counts(stale=len(stale_keys), active=len(active_keys), total=len(keys)), "freshness_at": latest_used.isoformat() if latest_used else None, "detail": f"{len(active_keys)} active / {len(keys)} total source keys. Source URL: {_source_url()}"})
    except Exception:
        sources.append({"key": "source_api_keys", "status": "DOWN", "freshness_at": None, "detail": "Source API key query failed."})

    try:
        devices = overview["devices"]
        if devices is None:
            raise RuntimeError("Device heartbeat query failed.")
        online = [device for device in devices if device.status == "online"]
        stale = [device for device in online if (device.last_heartbeat_at or device.last_heartbeat or checked_at) < checked_at - timedelta(minutes=2)]
        latest_heartbeat = max(((device.last_heartbeat_at or device.last_heartbeat) for device in devices if (device.last_heartbeat_at or device.last_heartbeat)), default=None)
        sources.append({"key": "devices", "status": _status_by_counts(stale=len(stale), active=len(online), total=len(devices)), "freshness_at": latest_heartbeat.isoformat() if latest_heartbeat else None, "detail": f"{len(online)}/{len(devices)} devices online; {len(stale)} stale heartbeats."})
    except Exception:
        sources.append({"key": "devices", "status": "DOWN", "freshness_at": None, "detail": "Device heartbeat query failed."})

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

@router.get("/requests")
async def service_request_projection(
    organization_id: Optional[uuid.UUID] = None,
    event_id: Optional[uuid.UUID] = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> dict[str, Any]:
    rows = await OperationsControlQueryService(db).list_requests(
        organization_id=organization_id, event_id=event_id, limit=limit
    )
    return {"items": [{"id": str(row.id), "organization_id": str(row.organization_id), "event_id": str(row.event_id) if row.event_id else None, "status": row.status, "priority": row.priority, "title": row.title, "version": row.version, "created_at": row.created_at} for row in rows], "count": len(rows)}


@router.get("/risks")
async def operations_risks(
    organization_id: Optional[uuid.UUID] = None,
    event_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> dict[str, Any]:
    rows = await OperationsControlQueryService(db).list_risks(
        organization_id=organization_id, event_id=event_id
    )
    return {"items": [{"id": str(row.id), "status": row.status, "priority": row.priority, "title": row.title, "event_id": str(row.event_id) if row.event_id else None} for row in rows], "count": len(rows)}


@router.get("/storage")
async def storage_telemetry(
    organization_id: Optional[uuid.UUID] = None,
    event_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> dict[str, Any]:
    if event_id:
        event = await OperationsControlQueryService(db).event_for_scope(
            event_id=event_id,
            organization_id=organization_id,
        )
        if event is None:
            raise _problem("NOT_FOUND", "Event not found.", 404)
        organization_id = event.organization_id
    total, size, statuses = await OperationsControlQueryService(db).storage_totals(
        organization_id=organization_id
    )
    return {
        "provider_status": "HEALTHY" if settings.STORAGE_MODE == "local" else "UNVERIFIED",
        "provider_detail": "Local storage metadata is authoritative in local profile." if settings.STORAGE_MODE == "local" else "Database metadata is authoritative; object-provider quota and reachability are not configured for this request path.",
        "total_objects": total,
        "total_bytes": int(size),
        "capacity_bytes": None,
         "by_status": [{"status": row[0], "count": row[1], "bytes": row[2]} for row in statuses],
        "freshness_at": _now(),
        "scope": {"organization_id": str(organization_id) if organization_id else None, "event_id": str(event_id) if event_id else None},
    }


@router.get("/venue/readiness")
async def venue_readiness(
    organization_id: Optional[uuid.UUID] = None,
    event_id: Optional[uuid.UUID] = None,
    source_type: Optional[Literal["cloud", "venue_server", "registration_server"]] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> dict[str, Any]:
    if event_id:
        event = await OperationsControlQueryService(db).event_for_scope(
            event_id=event_id,
            organization_id=organization_id,
        )
        if event is None:
            raise _problem("NOT_FOUND", "Event not found.", 404)
        if organization_id and event.organization_id != organization_id:
            raise _problem("NOT_FOUND", "Event not found for this organization.", 404)
        organization_id = event.organization_id
    sync_jobs, source_keys, devices = await OperationsControlQueryService(db).venue_readiness_rows(
        organization_id=organization_id,
        event_id=event_id,
        source_type=source_type,
    )
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
        event = await OperationsControlQueryService(db).event_for_scope(
            event_id=event_id,
            organization_id=organization_id,
        )
        if event is None:
            raise _problem("NOT_FOUND", "Event not found.", 404)
        if organization_id and event.organization_id != organization_id:
            raise _problem("NOT_FOUND", "Event not found for this organization.", 404)
        organization_id = event.organization_id
    rows = await OperationsControlQueryService(db).list_source_access(
        organization_id=organization_id,
        event_id=event_id,
        source_type=source_type,
    )
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
        key, raw_key = await OperationsControlCommandService(db).create_source_access(
            actor=actor,
            organization_id=body.organization_id,
            event_id=body.event_id,
            source_type=body.source_type,
            name=body.name,
            permissions=body.permissions,
            expires_at=body.expires_at,
            reason=body.reason,
            idempotency_key=idempotency_key,
        )
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
        key = await OperationsControlCommandService(db).revoke_source_access(
            actor=actor,
            organization_id=body.organization_id,
            key_id=key_id,
            reason=body.reason,
        )
        return _source_key_dict(key)


@router.post("/requests/{request_id}/transition")
async def transition_service_request(
    request_id: uuid.UUID,
    body: RequestTransition,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_super_admin),
) -> dict[str, Any]:
    request = await OperationsControlCommandService(db).transition_service_request(
        actor=actor,
        organization_id=body.organization_id,
        request_id=request_id,
        expected_version=body.version,
        target_status=body.target_status,
        reason=body.reason,
    )
    return {"id": str(request.id), "status": request.status, "version": request.version}


@router.post("/jobs/{source}/{job_id}/retry", status_code=202)
async def retry_job(source: str, job_id: str, body: ReasonedCommand, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128), db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        return await OperationsControlCommandService(db).control_job(actor=actor, source=source, job_id=job_id, organization_id=body.organization_id, reason=body.reason, idempotency_key=idempotency_key, operation="RETRY")


@router.post("/jobs/{source}/{job_id}/cancel", status_code=202)
async def cancel_job(source: str, job_id: str, body: ReasonedCommand, step_up: StepUpAuth, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128), db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    del step_up
    async with TenantContextGuard.scoped(db, body.organization_id):
        return await OperationsControlCommandService(db).control_job(actor=actor, source=source, job_id=job_id, organization_id=body.organization_id, reason=body.reason, idempotency_key=idempotency_key, operation="CANCEL")
