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
from app.modules.events.models.event import Event
from app.modules.files.models.file import Asset
from app.modules.identity.models.user import User
from app.modules.operations_control.models import SourceApiKey
from app.modules.platform.models.organization import Organization
from app.modules.superadmin.dependencies import require_super_admin
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


async def _job_control(db: AsyncSession, actor: User, source: str, job_id: str, body: ReasonedCommand, idempotency_key: str, operation: str) -> dict[str, Any]:
    del db, actor, source, job_id, body, idempotency_key, operation
    raise _problem(
        "JOB_CONTROL_RETIRED",
        "Legacy job-control requests were removed from the revised schema.",
        410,
    )


@router.post("/jobs/{source}/{job_id}/retry", status_code=202)
async def retry_job(source: str, job_id: str, body: ReasonedCommand, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128), db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id): return await _job_control(db, actor, source, job_id, body, idempotency_key, "RETRY")


@router.post("/jobs/{source}/{job_id}/cancel", status_code=202)
async def cancel_job(source: str, job_id: str, body: ReasonedCommand, step_up: StepUpAuth, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128), db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    del step_up
    async with TenantContextGuard.scoped(db, body.organization_id): return await _job_control(db, actor, source, job_id, body, idempotency_key, "CANCEL")
