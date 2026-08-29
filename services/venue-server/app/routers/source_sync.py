from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import secrets
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_database
from app.models.event import Event
from app.models.organization import Organization
from app.models.registration_source_key import (
    RegistrationSourceApiKey,
    RegistrationSourceHeartbeat,
    RegistrationSourceKeyUsage,
)
from app.models.operational_control import RegistrationOperation
from app.models.sync_outbox import SyncOutbox
from app.routers.auth import require_admin, require_step_up
from app.routers.node_sync import _snapshot


router = APIRouter(prefix="/api/v1/sync", tags=["registration_source_sync"])
admin_router = APIRouter(prefix="/api/v1/venue/admin/events/{event_id}/registration-source-keys", tags=["registration_source_keys"])
global_admin_router = APIRouter(prefix="/api/v1/venue/admin/registration-api-keys", tags=["registration_source_keys"])

DEFAULT_SCOPES = [
    "registration:snapshot:read",
    "registration:delta:read",
    "registration:heartbeat:write",
    "registration:operations:write",
]


class RegistrationSourceKeyCreate(BaseModel):
    name: str = "Registration Server"
    expires_at: datetime | None = None
    permissions: dict = {"read": True, "push": True}
    scopes: list[str] = Field(default_factory=lambda: list(DEFAULT_SCOPES))
    allowed_cidrs: list[str] = Field(default_factory=list)


class RegistrationSourceKeyRevoke(BaseModel):
    reason: str | None = None


class RegistrationSourceKeyUpdate(BaseModel):
    name: str | None = None
    expires_at: datetime | None = None
    permissions: dict | None = None


class PushItemSchema(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    action: str
    payload: dict
    created_at: datetime
    source_sequence: int = Field(default=0, ge=0)
    entity_version: int = Field(default=1, ge=1)
    payload_schema_version: int = Field(default=1, ge=1)


class RegistrationHeartbeatSchema(BaseModel):
    server_name: str = Field(min_length=1, max_length=160)
    version: str | None = Field(default=None, max_length=80)
    queue_depth: int = Field(default=0, ge=0)
    last_applied_cursor: str | None = Field(default=None, max_length=120)
    metrics: dict = Field(default_factory=dict)


def _hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def _source_url() -> str:
    return f"{settings.PUBLIC_BASE_URL.rstrip('/')}/api/v1/sync"


def _key_response(key: RegistrationSourceApiKey) -> dict:
    return {
        "id": str(key.id),
        "event_id": str(key.event_id),
        "organization_id": str(key.organization_id),
        "name": key.name,
        "key_prefix": key.key_prefix,
        "api_key_recoverable": False,
        "source_url": _source_url(),
        "allowed_app": key.allowed_app,
        "permissions": key.permissions,
        "scopes": key.scopes or [],
        "allowed_cidrs": key.allowed_cidrs or [],
        "rotation_of_id": str(key.rotation_of_id) if key.rotation_of_id else None,
        "grace_until": key.grace_until.isoformat() if key.grace_until else None,
        "last_used_ip": key.last_used_ip,
        "usage_count": key.usage_count,
        "expires_at": key.expires_at.isoformat() if key.expires_at else None,
        "revoked_at": key.revoked_at.isoformat() if key.revoked_at else None,
        "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None,
        "created_by": str(key.created_by) if key.created_by else None,
        "created_at": key.created_at.isoformat() if key.created_at else None,
    }


def _event_response(event: Event) -> dict:
    return {
        "id": str(event.id),
        "organization_id": str(event.organization_id),
        "name": event.name,
        "short_code": event.short_code,
        "status": event.status,
        "timezone": event.timezone,
        "start_date": event.start_date.isoformat() if event.start_date else None,
        "end_date": event.end_date.isoformat() if event.end_date else None,
        "location": event.location,
        "venue_name": event.venue_name,
        "country": event.country,
        "state": event.state,
        "organizer_name": event.organizer_name,
        "organizer_details": event.organizer_details,
        "license_tier": event.license_tier,
        "feature_toggles": event.feature_toggles,
        "currency": event.currency,
        "speaker_settings": event.speaker_settings,
        "registration_settings": event.registration_settings,
        "branding_settings": event.branding_settings,
        "max_file_size_mb": event.max_file_size_mb,
        "allowed_formats": event.allowed_formats,
    }


def _required_raw_key(x_fetch_api_key: str | None, x_device_key: str | None) -> str:
    raw_key = x_fetch_api_key or x_device_key
    if not raw_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Fetch API key required. Add X-Fetch-Api-Key header.")
    return raw_key


async def _verify_fetch_api_key(
    db: AsyncSession,
    raw_key: str,
    event_id: uuid.UUID | None = None,
    required_permission: str = "read",
    required_scope: str | None = None,
    source_ip: str | None = None,
) -> RegistrationSourceApiKey | None:
    now = datetime.now(timezone.utc)
    key = await db.scalar(select(RegistrationSourceApiKey).where(RegistrationSourceApiKey.key_hash == _hash_api_key(raw_key)))
    if key is not None:
        if key.allowed_app != "registration":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid fetch API key.")
        if key.revoked_at is not None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fetch API key has been revoked.")
        if key.expires_at is not None and key.expires_at <= now:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fetch API key has expired.")
        if event_id is not None and key.event_id != event_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found for this fetch API key.")
        if not (key.permissions or {}).get(required_permission, False):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Fetch API key cannot perform {required_permission}.")
        if required_scope and required_scope not in (key.scopes or []):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Fetch API key is missing scope {required_scope}.")
        if source_ip and key.allowed_cidrs:
            try:
                address = ipaddress.ip_address(source_ip)
                allowed = any(address in ipaddress.ip_network(cidr, strict=False) for cidr in key.allowed_cidrs)
            except ValueError:
                allowed = False
            if not allowed:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fetch API key is not allowed from this network.")
        key.last_used_at = now
        key.last_used_ip = source_ip
        key.usage_count = (key.usage_count or 0) + 1
        await db.flush()
        return key

    if settings.CLOUD_DEVICE_KEY and hmac.compare_digest(raw_key, settings.CLOUD_DEVICE_KEY):
        return None

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid fetch API key.")


@admin_router.post("")
async def create_registration_source_key(
    event_id: uuid.UUID,
    payload: RegistrationSourceKeyCreate,
    db: AsyncSession = Depends(get_database),
    _=Depends(require_step_up),
) -> dict:
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    raw_key = "regsrc_" + secrets.token_urlsafe(32)
    key = RegistrationSourceApiKey(
        id=uuid.uuid4(),
        event_id=event.id,
        organization_id=event.organization_id,
        name=payload.name.strip() or "Registration Server",
        key_prefix=raw_key[:16],
        key_hash=_hash_api_key(raw_key),
        allowed_app="registration",
        permissions=payload.permissions or {"read": True, "push": True},
        scopes=payload.scopes or list(DEFAULT_SCOPES),
        allowed_cidrs=payload.allowed_cidrs,
        expires_at=payload.expires_at,
    )
    db.add(key)
    await db.commit()
    await db.refresh(key)
    response = _key_response(key)
    response["api_key"] = raw_key
    response["api_key_visible_once"] = True
    return response


@admin_router.get("")
async def list_registration_source_keys(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_database),
    _=Depends(require_admin),
) -> dict:
    keys = list(
        (
            await db.execute(
                select(RegistrationSourceApiKey)
                .where(RegistrationSourceApiKey.event_id == event_id)
                .order_by(RegistrationSourceApiKey.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return {"event_id": str(event_id), "items": [_key_response(key) for key in keys]}


@admin_router.patch("/{key_id}")
async def update_registration_source_key(
    event_id: uuid.UUID,
    key_id: uuid.UUID,
    payload: RegistrationSourceKeyUpdate,
    db: AsyncSession = Depends(get_database),
    _=Depends(require_step_up),
) -> dict:
    key = await db.scalar(
        select(RegistrationSourceApiKey).where(
            RegistrationSourceApiKey.id == key_id,
            RegistrationSourceApiKey.event_id == event_id,
        )
    )
    if key is None:
        raise HTTPException(status_code=404, detail="Registration fetch API key not found.")
    if payload.name is not None:
        key.name = payload.name.strip() or key.name
    if payload.expires_at is not None:
        key.expires_at = payload.expires_at
    if payload.permissions is not None:
        key.permissions = payload.permissions
    await db.commit()
    await db.refresh(key)
    return _key_response(key)


@admin_router.post("/{key_id}/revoke")
async def revoke_registration_source_key(
    event_id: uuid.UUID,
    key_id: uuid.UUID,
    payload: RegistrationSourceKeyRevoke,
    db: AsyncSession = Depends(get_database),
    _=Depends(require_step_up),
) -> dict:
    key = await db.scalar(
        select(RegistrationSourceApiKey).where(
            RegistrationSourceApiKey.id == key_id,
            RegistrationSourceApiKey.event_id == event_id,
        )
    )
    if key is None:
        raise HTTPException(status_code=404, detail="Registration fetch API key not found.")
    if key.revoked_at is None:
        key.revoked_at = datetime.now(timezone.utc)
        permissions = dict(key.permissions or {})
        if payload.reason:
            permissions["revoked_reason"] = payload.reason
        key.permissions = permissions
    await db.commit()
    await db.refresh(key)
    return _key_response(key)


@router.get("/device/context")
async def source_context(
    request: Request,
    x_fetch_api_key: str | None = Header(default=None, alias="X-Fetch-Api-Key"),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_database),
):
    raw_key = _required_raw_key(x_fetch_api_key, x_device_key)
    key = await _verify_fetch_api_key(
        db, raw_key, required_scope="registration:snapshot:read", source_ip=request.client.host if request.client else None
    )
    if key is not None:
        event = await db.get(Event, key.event_id)
    else:
        event = (await db.execute(select(Event).order_by(Event.start_date.desc()).limit(1))).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="No event is available on this source server.")
    organization = await db.get(Organization, event.organization_id) if event.organization_id else None
    await db.commit()
    return {
        "source": "venue_server",
        "server_identity": str(uuid.uuid5(uuid.NAMESPACE_URL, settings.PUBLIC_BASE_URL)),
        "server_time": datetime.now(timezone.utc).isoformat(),
        "snapshot_version": 1,
        "schema_version": 1,
        "capabilities": ["snapshot", "changes", "heartbeat", "operations_batch", "tombstones"],
        "key": _key_response(key) if key is not None else {"legacy_configured_key": True},
        "organization": {
            "id": str(organization.id if organization else event.organization_id),
            "name": organization.name if organization else "Venue Server",
            "slug": organization.slug if organization else "venue-server",
        },
        "events": [_event_response(event)],
    }


@router.get("/events/{event_id}/queue")
async def source_event_queue(
    event_id: uuid.UUID,
    request: Request,
    x_fetch_api_key: str | None = Header(default=None, alias="X-Fetch-Api-Key"),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_database),
):
    raw_key = _required_raw_key(x_fetch_api_key, x_device_key)
    await _verify_fetch_api_key(
        db, raw_key, event_id=event_id, required_scope="registration:snapshot:read",
        source_ip=request.client.host if request.client else None,
    )
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found on this source server.")
    assignment = SimpleNamespace(
        id=uuid.uuid5(uuid.NAMESPACE_URL, f"eventos-source-sync:{event_id}"),
        mode="source_sync",
        station_id=None,
        capacity_rule_id=None,
        permissions={},
        snapshot_version=1,
    )
    payload = await _snapshot(db, event, assignment)
    await db.commit()
    payload["event_id"] = str(event.id)
    payload["source"] = "venue_server"
    return payload


@router.post("/events/{event_id}/push")
async def source_event_push(
    event_id: uuid.UUID,
    payload: list[PushItemSchema],
    request: Request,
    x_fetch_api_key: str | None = Header(default=None, alias="X-Fetch-Api-Key"),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_database),
) -> dict:
    raw_key = _required_raw_key(x_fetch_api_key, x_device_key)
    if len(payload) > 500:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="A batch may contain at most 500 operations.")
    key = await _verify_fetch_api_key(
        db, raw_key, event_id=event_id, required_permission="push",
        required_scope="registration:operations:write", source_ip=request.client.host if request.client else None,
    )
    processed_ids: list[str] = []
    duplicates: list[str] = []
    errors: list[dict] = []
    source_key_id = key.id if key else uuid.uuid5(uuid.NAMESPACE_URL, "registration-source-key:legacy")
    local_sequences: dict[str, int] = {}
    cloud_owned_entities = {"event", "registration_setting", "participant_role", "form", "capacity_rule", "template", "kit_catalogue"}

    for item in payload:
        operation_id = str(item.payload.get("operation_id") or item.id)
        existing = await db.scalar(select(RegistrationOperation).where(RegistrationOperation.operation_id == operation_id))
        if existing is not None:
            duplicates.append(str(item.id))
            local_sequences[str(item.id)] = existing.local_sequence
            continue
        try:
            conflict_reason = None
            operation_status = "accepted"
            if item.entity_type in cloud_owned_entities:
                conflict_reason = "Registration Server cannot mutate cloud-owned configuration."
                operation_status = "conflict"
            operation = RegistrationOperation(
                operation_id=operation_id,
                event_id=event_id,
                source_key_id=source_key_id,
                source_sequence=item.source_sequence,
                entity_type=item.entity_type,
                entity_id=item.entity_id,
                entity_version=item.entity_version,
                action=item.action,
                payload_schema_version=item.payload_schema_version,
                payload=item.payload,
                source_timestamp=item.created_at,
                status=operation_status,
                conflict_reason=conflict_reason,
            )
            db.add(operation)
            await db.flush()
            local_sequences[str(item.id)] = operation.local_sequence
            if conflict_reason:
                errors.append({"id": str(item.id), "error": conflict_reason, "local_sequence": operation.local_sequence})
                continue
            db.add(SyncOutbox(
                id=item.id,
                entity_type=item.entity_type,
                entity_id=item.entity_id,
                action=item.action,
                payload={
                    **item.payload,
                    "operation_id": operation_id,
                    "source_sequence": item.source_sequence,
                    "entity_version": item.entity_version,
                    "payload_schema_version": item.payload_schema_version,
                    "venue_local_sequence": operation.local_sequence,
                },
                status="pending",
                attempts=0,
                created_at=item.created_at,
            ))
            processed_ids.append(str(item.id))
        except Exception as exc:
            errors.append({"id": str(item.id), "error": str(exc)})

    await db.commit()
    return {"processed_ids": processed_ids, "duplicates": duplicates, "errors": errors, "local_sequences": local_sequences}


async def _single_event(db: AsyncSession) -> Event:
    events = list((await db.execute(select(Event).order_by(Event.start_date.desc()).limit(2))).scalars().all())
    if not events:
        raise HTTPException(status_code=409, detail="No event is provisioned on this Venue Server.")
    if len(events) > 1:
        raise HTTPException(status_code=409, detail="Venue Server must be reprovisioned to contain exactly one event.")
    return events[0]


async def _create_key_for_event(
    db: AsyncSession,
    event: Event,
    payload: RegistrationSourceKeyCreate,
    *,
    rotation_of_id: uuid.UUID | None = None,
) -> tuple[RegistrationSourceApiKey, str]:
    for cidr in payload.allowed_cidrs:
        try:
            ipaddress.ip_network(cidr, strict=False)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"Invalid allowed CIDR: {cidr}") from exc
    unknown_scopes = sorted(set(payload.scopes) - set(DEFAULT_SCOPES))
    if unknown_scopes:
        raise HTTPException(status_code=422, detail=f"Unsupported scopes: {', '.join(unknown_scopes)}")
    raw_key = "regsrc_" + secrets.token_urlsafe(32)
    key = RegistrationSourceApiKey(
        event_id=event.id,
        organization_id=event.organization_id,
        name=payload.name.strip() or "Registration Server",
        key_prefix=raw_key[:16],
        key_hash=_hash_api_key(raw_key),
        allowed_app="registration",
        permissions=payload.permissions or {"read": True, "push": True},
        scopes=payload.scopes or list(DEFAULT_SCOPES),
        allowed_cidrs=payload.allowed_cidrs,
        expires_at=payload.expires_at,
        rotation_of_id=rotation_of_id,
    )
    db.add(key)
    await db.flush()
    return key, raw_key


@global_admin_router.get("")
async def list_global_registration_keys(
    db: AsyncSession = Depends(get_database),
    _=Depends(require_admin),
) -> dict:
    events = list((await db.execute(select(Event).order_by(Event.start_date.desc()).limit(2))).scalars().all())
    if not events:
        return {"event_id": None, "source_url": _source_url(), "state": "not_configured", "items": []}
    if len(events) > 1:
        return {"event_id": None, "source_url": _source_url(), "state": "invalid_multiple_events", "items": []}
    event = events[0]
    keys = list((await db.execute(
        select(RegistrationSourceApiKey)
        .where(RegistrationSourceApiKey.event_id == event.id)
        .order_by(RegistrationSourceApiKey.created_at.desc())
    )).scalars().all())
    return {"event_id": str(event.id), "source_url": _source_url(), "state": "configured", "items": [_key_response(key) for key in keys]}


@global_admin_router.post("")
async def create_global_registration_key(
    payload: RegistrationSourceKeyCreate,
    db: AsyncSession = Depends(get_database),
    _=Depends(require_admin),
) -> dict:
    event = await _single_event(db)
    key, raw_key = await _create_key_for_event(db, event, payload)
    await db.commit()
    await db.refresh(key)
    return {**_key_response(key), "api_key": raw_key, "api_key_visible_once": True}


@global_admin_router.post("/{key_id}/rotate")
async def rotate_global_registration_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_database),
    _=Depends(require_admin),
) -> dict:
    current = await db.get(RegistrationSourceApiKey, key_id)
    if not current or current.revoked_at is not None:
        raise HTTPException(status_code=404, detail="Active Registration API key not found.")
    event = await db.get(Event, current.event_id)
    if not event:
        raise HTTPException(status_code=409, detail="The key event is no longer available.")
    current.grace_until = datetime.now(timezone.utc) + timedelta(minutes=15)
    replacement, raw_key = await _create_key_for_event(
        db,
        event,
        RegistrationSourceKeyCreate(
            name=current.name,
            expires_at=current.expires_at,
            permissions=current.permissions,
            scopes=current.scopes,
            allowed_cidrs=current.allowed_cidrs,
        ),
        rotation_of_id=current.id,
    )
    await db.commit()
    await db.refresh(replacement)
    return {**_key_response(replacement), "api_key": raw_key, "api_key_visible_once": True, "previous_key_grace_until": current.grace_until.isoformat()}


@global_admin_router.post("/{key_id}/revoke")
async def revoke_global_registration_key(
    key_id: uuid.UUID,
    payload: RegistrationSourceKeyRevoke,
    db: AsyncSession = Depends(get_database),
    _=Depends(require_admin),
) -> dict:
    key = await db.get(RegistrationSourceApiKey, key_id)
    if not key:
        raise HTTPException(status_code=404, detail="Registration API key not found.")
    key.revoked_at = key.revoked_at or datetime.now(timezone.utc)
    permissions = dict(key.permissions or {})
    if payload.reason:
        permissions["revoked_reason"] = payload.reason
    key.permissions = permissions
    await db.commit()
    await db.refresh(key)
    return _key_response(key)


@global_admin_router.get("/{key_id}/usage")
async def registration_key_usage(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_database),
    _=Depends(require_admin),
) -> dict:
    key = await db.get(RegistrationSourceApiKey, key_id)
    if not key:
        raise HTTPException(status_code=404, detail="Registration API key not found.")
    rows = list((await db.execute(
        select(RegistrationSourceKeyUsage)
        .where(RegistrationSourceKeyUsage.key_id == key_id)
        .order_by(RegistrationSourceKeyUsage.created_at.desc()).limit(200)
    )).scalars().all())
    return {"key": _key_response(key), "items": [{
        "id": str(row.id), "endpoint": row.endpoint, "source_ip": row.source_ip,
        "result": row.result, "cursor": row.cursor, "created_at": row.created_at.isoformat(),
    } for row in rows]}


@global_admin_router.post("/{key_id}/test")
async def test_registration_key_configuration(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_database),
    _=Depends(require_admin),
) -> dict:
    key = await db.get(RegistrationSourceApiKey, key_id)
    if not key:
        raise HTTPException(status_code=404, detail="Registration API key not found.")
    event = await db.get(Event, key.event_id)
    now = datetime.now(timezone.utc)
    checks = {
        "event_available": event is not None,
        "not_revoked": key.revoked_at is None,
        "not_expired": key.expires_at is None or key.expires_at > now,
        "required_scopes": set(DEFAULT_SCOPES).issubset(set(key.scopes or [])),
        "source_url_available": True,
    }
    return {"ready": all(checks.values()), "checks": checks, "source_url": _source_url(), "event_id": str(key.event_id)}


@global_admin_router.get("/connection-package")
async def registration_connection_package(
    db: AsyncSession = Depends(get_database),
    _=Depends(require_admin),
) -> dict:
    event = await _single_event(db)
    certificate_path = Path(settings.VENUE_CA_CERT_PATH) if settings.VENUE_CA_CERT_PATH else None
    certificate = certificate_path.read_text(encoding="ascii") if certificate_path and certificate_path.is_file() else None
    return {
        "schema_version": 1,
        "source_type": "venue_server",
        "source_url": _source_url(),
        "event_id": str(event.id),
        "organization_id": str(event.organization_id),
        "api_key": None,
        "api_key_instruction": "Paste the one-time secret issued for this Registration Server.",
        "ca_certificate": certificate,
        "ca_certificate_status": "available" if certificate else "not_configured",
    }


@router.get("/events/{event_id}/snapshot")
async def source_event_snapshot(
    event_id: uuid.UUID,
    request: Request,
    response: Response,
    x_fetch_api_key: str | None = Header(default=None, alias="X-Fetch-Api-Key"),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_database),
):
    payload = await source_event_queue(event_id, request, x_fetch_api_key, x_device_key, db)
    latest_sequence = await db.scalar(
        select(func.max(RegistrationOperation.local_sequence)).where(RegistrationOperation.event_id == event_id)
    )
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    checksum = hashlib.sha256(canonical).hexdigest()
    cursor = str(latest_sequence or 0)
    response.headers["ETag"] = f'"{checksum}"'
    response.headers["X-Content-SHA256"] = checksum
    response.headers["X-Snapshot-Cursor"] = cursor
    return {
        **payload,
        "schema_version": 1,
        "snapshot_version": payload.get("snapshot_version", 1),
        "checksum": checksum,
        "cursor": cursor,
    }


@router.get("/events/{event_id}/changes")
async def source_event_changes(
    event_id: uuid.UUID,
    request: Request,
    after: str | None = None,
    x_fetch_api_key: str | None = Header(default=None, alias="X-Fetch-Api-Key"),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_database),
) -> dict:
    raw_key = _required_raw_key(x_fetch_api_key, x_device_key)
    key = await _verify_fetch_api_key(
        db, raw_key, event_id=event_id, required_scope="registration:delta:read",
        source_ip=request.client.host if request.client else None,
    )
    query = select(RegistrationOperation).where(RegistrationOperation.event_id == event_id).order_by(RegistrationOperation.local_sequence.asc()).limit(1000)
    if after:
        try:
            query = query.where(RegistrationOperation.local_sequence > int(after))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Cursor must be a local sequence number.") from exc
    rows = list((await db.execute(query)).scalars().all())
    cursor = str(rows[-1].local_sequence) if rows else after
    if key:
        db.add(RegistrationSourceKeyUsage(key_id=key.id, endpoint="changes", source_ip=request.client.host if request.client else None, result="success", cursor=cursor))
    await db.commit()
    return {"event_id": str(event_id), "schema_version": 1, "items": [{
        "operation_id": row.operation_id, "action": f"{row.entity_type}:{row.action}", "payload": row.payload,
        "source_timestamp": row.source_timestamp.isoformat(), "local_sequence": row.local_sequence,
        "status": row.status, "conflict_reason": row.conflict_reason,
    } for row in rows], "tombstones": [], "cursor": cursor, "has_more": len(rows) == 1000}


@router.post("/events/{event_id}/operations:batch")
async def source_operations_batch(
    event_id: uuid.UUID,
    payload: list[PushItemSchema],
    request: Request,
    x_fetch_api_key: str | None = Header(default=None, alias="X-Fetch-Api-Key"),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_database),
) -> dict:
    return await source_event_push(event_id, payload, request, x_fetch_api_key, x_device_key, db)


@router.post("/events/{event_id}/heartbeat")
async def source_registration_heartbeat(
    event_id: uuid.UUID,
    payload: RegistrationHeartbeatSchema,
    request: Request,
    x_fetch_api_key: str | None = Header(default=None, alias="X-Fetch-Api-Key"),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_database),
) -> dict:
    raw_key = _required_raw_key(x_fetch_api_key, x_device_key)
    source_ip = request.client.host if request.client else None
    key = await _verify_fetch_api_key(
        db, raw_key, event_id=event_id, required_permission="push",
        required_scope="registration:heartbeat:write", source_ip=source_ip,
    )
    if key is None:
        raise HTTPException(status_code=403, detail="A named Registration API key is required for heartbeats.")
    heartbeat = await db.scalar(select(RegistrationSourceHeartbeat).where(RegistrationSourceHeartbeat.key_id == key.id))
    if heartbeat is None:
        heartbeat = RegistrationSourceHeartbeat(key_id=key.id, event_id=event_id, server_name=payload.server_name)
        db.add(heartbeat)
    heartbeat.server_name = payload.server_name
    heartbeat.version = payload.version
    heartbeat.queue_depth = payload.queue_depth
    heartbeat.last_applied_cursor = payload.last_applied_cursor
    heartbeat.metrics = payload.metrics
    heartbeat.source_ip = source_ip
    heartbeat.received_at = datetime.now(timezone.utc)
    db.add(RegistrationSourceKeyUsage(key_id=key.id, endpoint="heartbeat", source_ip=source_ip, result="success", cursor=payload.last_applied_cursor))
    await db.commit()
    return {"accepted": True, "server_time": datetime.now(timezone.utc).isoformat()}
