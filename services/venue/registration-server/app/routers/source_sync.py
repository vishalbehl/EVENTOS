from __future__ import annotations

import hashlib
import hmac
import base64
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_database
from app.models.event import Event
from app.models.organization import Organization
from app.models.registration_source_key import RegistrationSourceApiKey
from app.models.venue_node import VenueNodeOperation
from app.routers.node_sync import _snapshot


router = APIRouter(prefix="/api/v1/sync", tags=["registration_source_sync"])


class PushItemSchema(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    action: str
    payload: dict
    created_at: datetime


def _hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def _secret_stream(length: int) -> bytes:
    seed = settings.VENUE_AUTH_SECRET.encode("utf-8")
    output = b""
    counter = 0
    while len(output) < length:
        output += hmac.new(seed, f"registration-source-key:{counter}".encode("utf-8"), hashlib.sha256).digest()
        counter += 1
    return output[:length]


def _encrypt_api_key(raw_key: str) -> str:
    data = raw_key.encode("utf-8")
    stream = _secret_stream(len(data))
    encrypted = bytes(a ^ b for a, b in zip(data, stream))
    return "v1:" + base64.urlsafe_b64encode(encrypted).decode("ascii")


def _decrypt_api_key(value: str | None) -> str | None:
    if not value or not value.startswith("v1:"):
        return None
    encrypted = base64.urlsafe_b64decode(value[3:].encode("ascii"))
    stream = _secret_stream(len(encrypted))
    return bytes(a ^ b for a, b in zip(encrypted, stream)).decode("utf-8")


def _source_url() -> str:
    return f"{settings.HOST if settings.HOST.startswith(('http://', 'https://')) else 'http://127.0.0.1'}:{settings.PORT}/api/v1/sync"


def _key_response(key: RegistrationSourceApiKey) -> dict:
    raw_key = _decrypt_api_key(getattr(key, "api_key_encrypted", None))
    return {
        "id": str(key.id),
        "event_id": str(key.event_id),
        "organization_id": str(key.organization_id),
        "name": key.name,
        "key_prefix": key.key_prefix,
        "api_key": raw_key,
        "api_key_recoverable": raw_key is not None,
        "source_url": _source_url(),
        "allowed_app": key.allowed_app,
        "permissions": key.permissions,
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
        key.last_used_at = now
        await db.flush()
        return key

    if settings.CLOUD_DEVICE_KEY and hmac.compare_digest(raw_key, settings.CLOUD_DEVICE_KEY):
        return None

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid fetch API key.")


@router.get("/device/context")
async def source_context(
    x_fetch_api_key: str | None = Header(default=None, alias="X-Fetch-Api-Key"),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_database),
):
    raw_key = _required_raw_key(x_fetch_api_key, x_device_key)
    key = await _verify_fetch_api_key(db, raw_key)
    if key is not None:
        event = await db.get(Event, key.event_id)
    else:
        event = (await db.execute(select(Event).order_by(Event.start_date.desc()).limit(1))).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="No event is available on this source server.")
    organization = await db.get(Organization, event.organization_id) if event.organization_id else None
    await db.commit()
    return {
        "source": "registration_server",
        "key": _key_response(key) if key is not None else {"legacy_configured_key": True},
        "organization": {
            "id": str(organization.id if organization else event.organization_id),
            "name": organization.name if organization else "Registration Server",
            "slug": organization.slug if organization else "registration-server",
        },
        "events": [_event_response(event)],
    }


@router.get("/events/{event_id}/queue")
async def source_event_queue(
    event_id: uuid.UUID,
    x_fetch_api_key: str | None = Header(default=None, alias="X-Fetch-Api-Key"),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_database),
):
    raw_key = _required_raw_key(x_fetch_api_key, x_device_key)
    await _verify_fetch_api_key(db, raw_key, event_id=event_id)
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
    payload["source"] = "registration_server"
    return payload


@router.post("/events/{event_id}/push")
async def source_event_push(
    event_id: uuid.UUID,
    payload: list[PushItemSchema],
    x_fetch_api_key: str | None = Header(default=None, alias="X-Fetch-Api-Key"),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_database),
) -> dict:
    raw_key = _required_raw_key(x_fetch_api_key, x_device_key)
    key = await _verify_fetch_api_key(db, raw_key, event_id=event_id, required_permission="push")
    processed_ids: list[str] = []
    duplicates: list[str] = []
    errors: list[dict] = []
    assignment_id = uuid.uuid5(uuid.NAMESPACE_URL, f"registration-source-key:{key.id if key else 'legacy'}")

    for item in payload:
        operation_id = str(item.payload.get("operation_id") or item.id)
        existing = await db.scalar(select(VenueNodeOperation).where(VenueNodeOperation.operation_id == operation_id))
        if existing is not None:
            duplicates.append(str(item.id))
            continue
        try:
            db.add(
                VenueNodeOperation(
                    id=uuid.uuid4(),
                    operation_id=operation_id,
                    assignment_id=assignment_id,
                    event_id=event_id,
                    action=f"{item.entity_type}:{item.action}",
                    payload=item.payload,
                    occurred_at=item.created_at,
                    status="received",
                )
            )
            processed_ids.append(str(item.id))
        except Exception as exc:
            errors.append({"id": str(item.id), "error": str(exc)})

    await db.commit()
    return {"processed_ids": processed_ids, "duplicates": duplicates, "errors": errors}
