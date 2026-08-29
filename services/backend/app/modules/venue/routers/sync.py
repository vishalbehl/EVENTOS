# backend/app/routers/sync.py
from __future__ import annotations

import hashlib
import secrets
import uuid
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import ActiveUser, CurrentEvent, DeviceAuth, get_db
from app.core.dependencies.feature_gate import enforce_event_operation
from app.core.encryption import decrypt, encrypt
from app.modules.agenda.models import Session
from app.modules.events.models.event import Event
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.badge_models import Badge, BadgeScan, BadgePrintJob
from app.modules.registration.models.print_template import PrintTemplate
from app.modules.agenda.models import Room
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.analytics.models.attendance_log import AttendanceLog
from app.modules.registration.models.check_in import CheckIn
from app.modules.venue.models.room_device import RoomDevice
from app.modules.venue.models.printer import Printer
from app.modules.venue.models.venue_sync_job import VenueSyncJob
from app.modules.platform.models.organization import Organization
from app.modules.operations_control.models import SourceApiKey
from app.modules.venue.models.registration_execution import (
    RegistrationCompanion,
    RegistrationParticipantExtension,
    VenueCheckInGate,
    VenueCheckIn,
    VenueScanEvent,
    VenueExecutionBadge,
    VenueExecutionBadgeHistory,
    VenueExecutionBadgePrintJob,
    VenueKit,
    VenueParticipantKit,
    VenueParticipantActionLog,
    VenueNodeOperation,
    VenueNodeAssignment,
)
from pydantic import BaseModel, field_validator

router = APIRouter(prefix="/sync", tags=["sync"])
organizer_router = APIRouter(
    prefix="/events/{event_id}/venue-sync",
    tags=["venue-sync"],
)
source_router = APIRouter(prefix="/registration-source", tags=["registration-source"])


class RegistrationSourceKeyCreate(BaseModel):
    name: str = "Registration Server"
    expires_at: Optional[datetime] = None
    permissions: dict = {"read": True, "push": True}

    @field_validator("expires_at")
    @classmethod
    def expires_at_must_be_future(cls, value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return value
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        if value <= datetime.now(timezone.utc):
            raise ValueError("Expiration date and time must be in the future.")
        return value


class RegistrationSourceKeyRevoke(BaseModel):
    reason: Optional[str] = None


class PushItemSchema(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    action: str
    payload: dict
    created_at: datetime


def _hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def _source_key_response(key: SourceApiKey) -> dict:
    raw_key = None
    if getattr(key, "api_key_encrypted", None):
        try:
            raw_key = decrypt(key.api_key_encrypted)
        except Exception:
            raw_key = None
    return {
        "id": str(key.id),
        "event_id": str(key.event_id),
        "organization_id": str(key.organization_id),
        "name": key.name,
        "key_prefix": key.key_prefix,
        "api_key": raw_key,
        "api_key_recoverable": raw_key is not None,
        "source_type": key.source_type,
        "permissions": key.permissions,
        "expires_at": key.expires_at.isoformat() if key.expires_at else None,
        "revoked_at": key.revoked_at.isoformat() if key.revoked_at else None,
        "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None,
        "created_by": str(key.created_by) if key.created_by else None,
        "created_at": key.created_at.isoformat() if key.created_at else None,
    }


def _require_registration_key_header(
    x_fetch_api_key: str | None,
    x_device_key: str | None,
) -> str:
    raw_key = x_fetch_api_key or x_device_key
    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Fetch API key required. Add X-Fetch-Api-Key header.",
        )
    return raw_key


async def _verify_registration_source_key(
    db: AsyncSession,
    raw_key: str,
    event_id: uuid.UUID | None = None,
    required_permission: str = "read",
) -> SourceApiKey:
    now = datetime.now(timezone.utc)
    key = await db.scalar(
        select(SourceApiKey)
        .where(SourceApiKey.key_hash == _hash_api_key(raw_key))
        .execution_options(skip_tenant_filter=True)
    )
    if key is None or key.source_type not in {"registration", "registration_server", "venue_server"}:
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


@organizer_router.post("/registration-api-keys")
async def create_source_api_key(
    payload: RegistrationSourceKeyCreate,
    event: CurrentEvent,
    user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    if user.role not in ("super_admin", "organiser", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can create registration fetch API keys.")
    await enforce_event_operation(db, event.organization_id, event.id, "venue.sync")
    raw_key = "regsrc_" + secrets.token_urlsafe(32)
    key = SourceApiKey(
        id=uuid.uuid4(),
        event_id=event.id,
        organization_id=event.organization_id,
        name=payload.name.strip() or "Registration Server",
        key_prefix=raw_key[:16],
        key_hash=_hash_api_key(raw_key),
        api_key_encrypted=encrypt(raw_key),
        source_type="registration_server",
        permissions=payload.permissions or {"read": True, "push": True},
        expires_at=payload.expires_at,
        created_by=user.id,
    )
    db.add(key)
    await db.commit()
    await db.refresh(key)
    response = _source_key_response(key)
    response["api_key"] = raw_key
    response["api_key_visible_once"] = False
    return response


@organizer_router.get("/registration-api-keys")
async def list_source_api_keys(
    event: CurrentEvent,
    user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    await enforce_event_operation(db, event.organization_id, event.id, "venue.sync", user_id=user.id)
    keys = list(
        (
            await db.execute(
                select(SourceApiKey)
                .where(SourceApiKey.event_id == event.id)
                .order_by(SourceApiKey.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return {"event_id": str(event.id), "items": [_source_key_response(key) for key in keys]}


@organizer_router.post("/registration-api-keys/{key_id}/revoke")
async def revoke_source_api_key(
    key_id: uuid.UUID,
    payload: RegistrationSourceKeyRevoke,
    event: CurrentEvent,
    user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    if user.role not in ("super_admin", "organiser", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can revoke registration fetch API keys.")
    await enforce_event_operation(db, event.organization_id, event.id, "venue.sync")
    key = await db.scalar(
        select(SourceApiKey).where(
            SourceApiKey.id == key_id,
            SourceApiKey.event_id == event.id,
        )
    )
    if key is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration fetch API key not found.")
    if key.revoked_at is None:
        key.revoked_at = datetime.now(timezone.utc)
        permissions = dict(key.permissions or {})
        if payload.reason:
            permissions["revoked_reason"] = payload.reason
        permissions["revoked_by"] = str(user.id)
        key.permissions = permissions
    await db.commit()
    await db.refresh(key)
    return _source_key_response(key)


@organizer_router.get("/status")
async def get_organizer_sync_status(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return authoritative event-scoped venue device and sync-job status."""
    device_rows = (await db.execute(
        select(RoomDevice.status, func.count(RoomDevice.id))
        .where(
            RoomDevice.event_id == event.id,
            RoomDevice.organization_id == event.organization_id,
        )
        .group_by(RoomDevice.status)
    )).all()
    jobs = list((await db.execute(
        select(VenueSyncJob)
        .where(VenueSyncJob.event_id == event.id)
        .order_by(VenueSyncJob.created_at.desc())
        .limit(25)
    )).scalars().all())
    return {
        "event_id": str(event.id),
        "devices_by_status": {str(status): int(count) for status, count in device_rows},
        "latest_jobs": [
            {
                "id": str(job.id),
                "sync_type": job.sync_type,
                "status": job.status,
                "retry_count": job.retry_count,
                "bytes_transferred": job.bytes_transferred,
                "checksum_verified": job.checksum_verified,
                "error_message": job.error_message,
                "created_at": job.created_at.isoformat() if job.created_at else None,
                "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            }
            for job in jobs
        ],
        "freshness_at": datetime.utcnow().isoformat() + "Z",
        "source": "venue.room_devices,venue.sync_jobs",
    }

@router.get("/events/{event_id}/queue")
async def get_sync_payload(
    event_id: uuid.UUID,
    device_auth: DeviceAuth,
    db: AsyncSession = Depends(get_db)
):
    """
    Consolidated endpoint for Venue Server to pull latest configurations, schedule,
    approved participants, badges, templates, capacity rules, and roles.
    """
    _require_device_event(device_auth, event_id)
    return await _fetch_sync_queue(db, event_id)


@router.get("/device/context")
async def get_device_sync_context(
    device_auth: DeviceAuth,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the event/org visible to the supplied venue device API key."""
    event = await db.get(Event, device_auth["event_id"])
    organization = await db.get(Organization, device_auth["organization_id"])
    if event is None or organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device event context was not found.")
    return {
        "organization": {
            "id": str(organization.id),
            "name": organization.name,
            "slug": organization.slug,
        },
        "events": [
            {
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
        ],
    }


@source_router.get("/context")
async def get_registration_source_context(
    x_fetch_api_key: str | None = Header(default=None, alias="X-Fetch-Api-Key"),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Validate an event-scoped Registration Software fetch key."""
    raw_key = _require_registration_key_header(x_fetch_api_key, x_device_key)
    key = await _verify_registration_source_key(db, raw_key, required_permission="read")
    event = await db.get(Event, key.event_id)
    organization = await db.get(Organization, key.organization_id)
    if event is None or organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source event context was not found.")
    await db.commit()
    return {
        "source": "cloud_backend",
        "key": _source_key_response(key),
        "organization": {
            "id": str(organization.id),
            "name": organization.name,
            "slug": organization.slug,
        },
        "events": [
            {
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
        ],
    }


@source_router.get("/events/{event_id}/queue")
async def get_registration_source_event_queue(
    event_id: uuid.UUID,
    x_fetch_api_key: str | None = Header(default=None, alias="X-Fetch-Api-Key"),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    raw_key = _require_registration_key_header(x_fetch_api_key, x_device_key)
    await _verify_registration_source_key(db, raw_key, event_id=event_id, required_permission="read")
    payload = await _fetch_sync_queue(db, event_id)
    await db.commit()
    payload["event_id"] = str(event_id)
    payload["source"] = "cloud_backend"
    return payload


@source_router.post("/events/{event_id}/push")
async def push_registration_source_operations(
    event_id: uuid.UUID,
    payload: List[PushItemSchema],
    x_fetch_api_key: str | None = Header(default=None, alias="X-Fetch-Api-Key"),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    raw_key = _require_registration_key_header(x_fetch_api_key, x_device_key)
    key = await _verify_registration_source_key(db, raw_key, event_id=event_id, required_permission="push")
    processed_ids: list[str] = []
    duplicates: list[str] = []
    errors: list[dict] = []

    for item in payload:
        operation_id = str(item.payload.get("operation_id") or item.id)
        existing_operation = await db.scalar(
            select(VenueNodeOperation).where(VenueNodeOperation.operation_id == operation_id)
        )
        if existing_operation is not None:
            duplicates.append(str(item.id))
            continue

        try:
            db.add(
                VenueNodeOperation(
                    id=uuid.uuid4(),
                    operation_id=operation_id,
                    assignment_id=uuid.uuid5(uuid.NAMESPACE_URL, f"registration-source-key:{key.id}"),
                    event_id=event_id,
                    action=f"{item.entity_type}:{item.action}",
                    payload=item.payload,
                    occurred_at=item.created_at,
                    status="received",
                )
            )

            if item.entity_type in {"venue_scan_event", "badge_scan"} and item.action == "create":
                existing_scan = await db.get(VenueScanEvent, item.entity_id)
                if existing_scan is None:
                    scan_payload = item.payload
                    db.add(
                        VenueScanEvent(
                            id=item.entity_id,
                            event_id=event_id,
                            participant_id=uuid.UUID(scan_payload["participant_id"]) if scan_payload.get("participant_id") else None,
                            companion_id=uuid.UUID(scan_payload["companion_id"]) if scan_payload.get("companion_id") else None,
                            checkin_gate_id=uuid.UUID(scan_payload["checkin_gate_id"]) if scan_payload.get("checkin_gate_id") else None,
                            badge_id=uuid.UUID(scan_payload["badge_id"]) if scan_payload.get("badge_id") else None,
                            station_name=scan_payload.get("station_name") or scan_payload.get("gate_name") or "Check-In Gate",
                            station_type=scan_payload.get("station_type") or scan_payload.get("gate_type") or "registration",
                            location=scan_payload.get("location"),
                            badge_code=scan_payload.get("badge_code") or "",
                            scan_type=scan_payload.get("scan_type") or "check_in",
                            status=scan_payload.get("status") or "success",
                            rejection_reason=scan_payload.get("rejection_reason"),
                            admin_overridden_by=scan_payload.get("admin_overridden_by"),
                            created_at=datetime.fromisoformat(scan_payload["created_at"].replace("Z", "+00:00")) if scan_payload.get("created_at") else item.created_at,
                        )
                    )

            if item.entity_type == "venue_checkin" and item.action == "create":
                existing_checkin = await db.get(VenueCheckIn, item.entity_id)
                if existing_checkin is None:
                    checkin_payload = item.payload
                    db.add(
                        VenueCheckIn(
                            id=item.entity_id,
                            event_id=event_id,
                            participant_id=uuid.UUID(checkin_payload["participant_id"]) if checkin_payload.get("participant_id") else None,
                            companion_id=uuid.UUID(checkin_payload["companion_id"]) if checkin_payload.get("companion_id") else None,
                            checkin_gate_id=uuid.UUID(checkin_payload["checkin_gate_id"]) if checkin_payload.get("checkin_gate_id") else None,
                            gate_name=checkin_payload.get("gate_name") or checkin_payload.get("station_name") or "Check-In Gate",
                            gate_type=checkin_payload.get("gate_type") or checkin_payload.get("station_type") or "registration",
                            gate_capacity=int(checkin_payload.get("gate_capacity") or 0),
                            badge_code=checkin_payload.get("badge_code") or "",
                            scan_type=checkin_payload.get("scan_type") or "check_in",
                            status=checkin_payload.get("status") or "success",
                            rejection_reason=checkin_payload.get("rejection_reason"),
                            admin_overridden_by=checkin_payload.get("admin_overridden_by"),
                            checkin_time=datetime.fromisoformat(checkin_payload["checkin_time"].replace("Z", "+00:00")) if checkin_payload.get("checkin_time") else item.created_at,
                            checkout_time=datetime.fromisoformat(checkin_payload["checkout_time"].replace("Z", "+00:00")) if checkin_payload.get("checkout_time") else None,
                            duration=checkin_payload.get("duration"),
                            session_id=uuid.UUID(checkin_payload["session_id"]) if checkin_payload.get("session_id") else None,
                            method=checkin_payload.get("method") or "qr",
                            device_id=checkin_payload.get("device_id") or "registration-server",
                            operation_id=operation_id,
                            created_at=item.created_at,
                        )
                    )

            processed_ids.append(str(item.id))
        except Exception as exc:
            errors.append({"id": str(item.id), "error": str(exc)})

    await db.commit()
    return {"processed_ids": processed_ids, "duplicates": duplicates, "errors": errors}


@organizer_router.get("/queue")
async def get_organizer_sync_payload(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db)
):
    """
    Pull latest configurations, schedule, approved participants, etc for the venue server.
    This route uses the CurrentEvent dependency which relies on the Authorization Bearer token.
    """
    return await _fetch_sync_queue(db, event.id)

async def _fetch_sync_queue(db: AsyncSession, event_id: uuid.UUID) -> dict:
    # 1. Fetch schedule shell only. Registration Server must not fetch speaker,
    # presentation-file, poster, SRR, or playback payloads.
    sessions_result = await db.execute(
        select(Session)
        .where(
            Session.event_id == event_id,
            Session.is_published.is_(True),
            Session.deleted_at.is_(None),
        )
    )
    sessions = sessions_result.scalars().all()
    
    sessions_list = []
    for s in sessions:
        sessions_list.append({
            "id": str(s.id),
            "session_code": s.session_code,
            "name": s.name,
            "room_id": str(s.room_id) if s.room_id else None,
            "start_time": s.start_time.isoformat() if s.start_time else None,
            "end_time": s.end_time.isoformat() if s.end_time else None,
            "status": s.status,
        })

    # 2. Fetch all participants for this event
    part_result = await db.execute(
        select(Participant).where(Participant.event_id == event_id)
    )
    participants = part_result.scalars().all()
    participants_list = [{
        "id": str(p.id),
        "regno": p.regno,
        "name": p.name,
        "first_name": p.first_name,
        "last_name": p.last_name,
        "email": p.email,
        "phone": p.phone,
        "role": p.role,
        "company": p.company,
        "designation": p.designation,
        "country": p.country,
        "paid_status": p.paid_status,
        "source": p.source,
        "custom_fields": p.custom_fields,
        "registered_at": p.registered_at.isoformat() if p.registered_at else None
    } for p in participants]

    # 3. Fetch badges for the participants of this event. Prefer the final
    # registration execution table (venue.badges), then fall back to the
    # existing organizer registration table while old cloud data is migrated.
    participant_ids = [p.id for p in participants]
    venue_badges = list((await db.execute(
        select(VenueExecutionBadge).where(VenueExecutionBadge.participant_id.in_(participant_ids))
    )).scalars().all()) if participant_ids else []
    if venue_badges:
        badges = venue_badges
    else:
        badge_result = await db.execute(
            select(Badge)
            .join(Participant)
            .where(Participant.event_id == event_id)
        )
        badges = badge_result.scalars().all()
    badges_list = [{
        "id": str(b.id),
        "participant_id": str(b.participant_id),
        "badge_code": b.badge_code,
        "qr_token": b.qr_token,
        "barcode": b.barcode,
        "nfc_uid": b.nfc_uid,
        "template_id": str(b.template_id) if b.template_id else None,
        "status": b.status,
        "issued_at": b.issued_at.isoformat() if b.issued_at else None,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None
    } for b in badges]

    companion_rows = list((await db.execute(
        select(RegistrationCompanion).where(
            (RegistrationCompanion.event_id == event_id)
            | (RegistrationCompanion.primary_participant_id.in_(participant_ids))
        )
    )).scalars().all()) if participant_ids else []
    companions_list = [{
        "id": str(c.id),
        "event_id": str(c.event_id) if c.event_id else str(event_id),
        "primary_participant_id": str(c.primary_participant_id),
        "first_name": c.first_name,
        "last_name": c.last_name,
        "relationship": c.relationship,
        "email": c.email,
        "phone": c.phone,
        "badge_code": c.badge_code,
        "badge_status": c.badge_status,
        "checked_in": c.checked_in,
        "checked_in_at": c.checked_in_at.isoformat() if c.checked_in_at else None,
        "dietary_preference": c.dietary_preference,
        "special_assistance": c.special_assistance,
        "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    } for c in companion_rows]

    # 4. Fetch print templates for this event
    tmpl_result = await db.execute(
        select(PrintTemplate).where(PrintTemplate.event_id == event_id)
    )
    templates = tmpl_result.scalars().all()
    templates_list = [{
        "id": str(t.id),
        "template_name": t.template_name,
        "template_type": t.template_type,
        "template_data": t.template_data,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None
    } for t in templates]

    # 5. Fetch check-in gates. The payload key stays "capacity_rules" for
    # backward compatibility with existing registration-server pull code.
    gate_rows = list((await db.execute(select(VenueCheckInGate).order_by(VenueCheckInGate.gate_name))).scalars().all())
    if gate_rows:
        rules_list = [{
            "id": str(r.id),
            "station_name": r.station_name,
            "station_type": r.station_type,
            "allowed_roles": r.allowed_roles or [],
            "max_checkins_per_delegate": r.max_checkins_per_delegate,
            "station_capacity": r.station_capacity,
        } for r in gate_rows]
    else:
        cap_result = await db.execute(
            select(CapacityRule).where(CapacityRule.event_id == event_id)
        )
        rules = cap_result.scalars().all()
        rules_list = [{
            "id": str(r.id),
            "session_id": str(r.session_id) if r.session_id else None,
            "room_id": str(r.room_id) if r.room_id else None,
            "capacity": r.capacity,
            "waitlist_enabled": r.waitlist_enabled,
            "auto_promote": r.auto_promote,
            "priority_enabled": r.priority_enabled
        } for r in rules]

    # 6. Fetch participant roles for this event
    role_result = await db.execute(
        select(ParticipantRole).where(ParticipantRole.event_id == event_id)
    )
    roles = role_result.scalars().all()
    roles_list = [{
        "id": str(rl.id),
        "category": rl.category,
        "name": rl.name,
        "role_code": rl.role_code,
        "is_active": rl.is_active,
        "is_default": rl.is_default,
        "sort_order": rl.sort_order
    } for rl in roles]

    # 7. Fetch rooms for this event
    room_result = await db.execute(
        select(Room).where(Room.event_id == event_id)
    )
    rooms = room_result.scalars().all()
    rooms_list = [{
        "id": str(rm.id),
        "name": rm.name,
        "capacity": rm.capacity,
        "screen_count": rm.screen_count,
        "room_type": rm.room_type,
        "room_coordinator": rm.room_coordinator,
        "av_technician": rm.room_coordinator,
        "location_notes": rm.location_notes,
        "is_active": rm.is_active
    } for rm in rooms]

    # 8. Fetch registrations for this event
    reg_result = await db.execute(
        select(ParticipantRegistration).where(ParticipantRegistration.event_id == event_id)
    )
    registrations = reg_result.scalars().all()
    registrations_list = [{
        "id": str(rg.id),
        "participant_id": str(rg.participant_id) if rg.participant_id else None,
        "registration_status": rg.registration_status,
        "registration_data": rg.registration_data,
        "submitted_at": rg.submitted_at.isoformat() if rg.submitted_at else None,
        "reviewed_by": str(rg.reviewed_by) if rg.reviewed_by else None,
        "reviewed_at": rg.reviewed_at.isoformat() if rg.reviewed_at else None,
        "review_notes": rg.review_notes,
        "waitlist_position": getattr(rg, "waitlist_position", None),
        "rejection_reason": getattr(rg, "rejection_reason", None)
    } for rg in registrations]

    # 9. Fetch registration execution details for this event.
    extensions = list((await db.execute(
        select(RegistrationParticipantExtension).where(RegistrationParticipantExtension.participant_id.in_(participant_ids))
    )).scalars().all()) if participant_ids else []
    extensions_list = [{
        "id": str(ext.id),
        "participant_id": str(ext.participant_id),
        "department": ext.department,
        "city": ext.city,
        "dietary_preference": ext.dietary_preference,
        "emergency_contact": ext.emergency_contact,
        "notes": ext.notes,
        "custom_attributes": ext.custom_attributes or {},
        "created_at": ext.created_at.isoformat() if ext.created_at else None,
        "updated_at": ext.updated_at.isoformat() if ext.updated_at else None,
    } for ext in extensions]

    badge_ids = [b.id for b in badges]
    badge_history = list((await db.execute(
        select(VenueExecutionBadgeHistory).where(VenueExecutionBadgeHistory.badge_id.in_(badge_ids))
    )).scalars().all()) if badge_ids else []
    badge_history_list = [{
        "id": str(row.id),
        "badge_id": str(row.badge_id),
        "action": row.action,
        "performed_by": str(row.performed_by) if row.performed_by else None,
        "metadata": row.action_metadata or {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
    } for row in badge_history]

    print_jobs = list((await db.execute(
        select(VenueExecutionBadgePrintJob).where(VenueExecutionBadgePrintJob.badge_id.in_(badge_ids))
    )).scalars().all()) if badge_ids else []
    print_jobs_list = [{
        "id": str(row.id),
        "badge_id": str(row.badge_id),
        "printer_id": str(row.printer_id) if row.printer_id else None,
        "status": row.status,
        "queued_at": row.queued_at.isoformat() if row.queued_at else None,
        "printed_at": row.printed_at.isoformat() if row.printed_at else None,
    } for row in print_jobs]

    printer_ids = [row.printer_id for row in print_jobs if row.printer_id]
    printer_rows = list((await db.execute(
        select(Printer).where((Printer.event_id == event_id) | (Printer.id.in_(printer_ids)))
    )).scalars().all()) if printer_ids else list((await db.execute(select(Printer).where(Printer.event_id == event_id))).scalars().all())
    printers_list = [{
        "id": str(row.id),
        "name": row.name,
        "ip_address": row.ip_address,
        "location": row.location,
        "status": row.status,
    } for row in printer_rows]

    checkins = list((await db.execute(
        select(VenueCheckIn).where(VenueCheckIn.event_id == event_id)
    )).scalars().all())
    venue_checkins_list = [{
        "id": str(row.id),
        "event_id": str(row.event_id) if row.event_id else str(event_id),
        "participant_id": str(row.participant_id) if row.participant_id else None,
        "companion_id": str(row.companion_id) if row.companion_id else None,
        "checkin_gate_id": str(row.checkin_gate_id) if row.checkin_gate_id else None,
        "gate_name": row.gate_name,
        "gate_type": row.gate_type,
        "gate_capacity": row.gate_capacity,
        "badge_code": row.badge_code,
        "scan_type": row.scan_type,
        "status": row.status,
        "rejection_reason": row.rejection_reason,
        "admin_overridden_by": row.admin_overridden_by,
        "checkin_time": row.checkin_time.isoformat() if row.checkin_time else None,
        "checkout_time": row.checkout_time.isoformat() if row.checkout_time else None,
        "duration": row.duration,
        "session_id": str(row.session_id) if row.session_id else None,
        "method": row.method,
        "device_id": row.device_id,
        "operation_id": row.operation_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    } for row in checkins]

    scan_events = list((await db.execute(
        select(VenueScanEvent).where(VenueScanEvent.event_id == event_id)
    )).scalars().all())
    scan_events_list = [{
        "id": str(row.id),
        "event_id": str(row.event_id) if row.event_id else str(event_id),
        "participant_id": str(row.participant_id) if row.participant_id else None,
        "companion_id": str(row.companion_id) if row.companion_id else None,
        "checkin_gate_id": str(row.checkin_gate_id) if row.checkin_gate_id else None,
        "badge_id": str(row.badge_id) if row.badge_id else None,
        "station_name": row.station_name,
        "station_type": row.station_type,
        "location": row.location,
        "badge_code": row.badge_code,
        "scan_type": row.scan_type,
        "status": row.status,
        "rejection_reason": row.rejection_reason,
        "admin_overridden_by": row.admin_overridden_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    } for row in scan_events]

    kits = list((await db.execute(select(VenueKit).order_by(VenueKit.kit_name))).scalars().all())
    kits_list = [{
        "id": str(row.id),
        "kit_name": row.kit_name,
        "category": row.category,
        "total_quantity": row.total_quantity,
        "distributed_quantity": row.distributed_quantity,
        "max_per_participant": row.max_per_participant,
        "description": row.description,
        "target_roles": row.target_roles or ["All"],
        "created_at": row.created_at.isoformat() if row.created_at else None,
    } for row in kits]
    participant_kits = list((await db.execute(
        select(VenueParticipantKit).where(VenueParticipantKit.participant_id.in_(participant_ids))
    )).scalars().all()) if participant_ids else []
    participant_kits_list = [{
        "id": str(row.id),
        "participant_id": str(row.participant_id),
        "kit_id": str(row.kit_id),
        "status": row.status,
        "issued_by": row.issued_by,
        "issued_at": row.issued_at.isoformat() if row.issued_at else None,
    } for row in participant_kits]

    actions = list((await db.execute(
        select(VenueParticipantActionLog).where(VenueParticipantActionLog.participant_id.in_(participant_ids))
    )).scalars().all()) if participant_ids else []
    action_logs_list = [{
        "id": str(row.id),
        "participant_id": str(row.participant_id),
        "action_type": row.action_type,
        "performed_by": row.performed_by,
        "details": row.details,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    } for row in actions]

    device_rows = list((await db.execute(select(RoomDevice).where(RoomDevice.event_id == event_id))).scalars().all())
    devices_list = [{
        "id": str(row.id),
        "event_id": str(row.event_id),
        "room_id": str(row.room_id) if row.room_id else None,
        "device_type": row.device_type,
        "device_name": row.device_name,
        "hostname": row.hostname,
        "ip_address": str(row.local_ip) if getattr(row, "local_ip", None) else None,
        "mac_address": row.mac_address,
        "os_version": row.os_version,
        "app_version": row.app_version,
        "status": row.status,
        "last_heartbeat_at": row.last_heartbeat_at.isoformat() if row.last_heartbeat_at else None,
        "registered_at": row.registered_at.isoformat() if row.registered_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    } for row in device_rows]

    assignments = list((await db.execute(select(VenueNodeAssignment).where(VenueNodeAssignment.event_id == event_id))).scalars().all())
    assignments_list = [{
        "id": str(row.id),
        "event_id": str(row.event_id),
        "device_id": str(row.device_id),
        "mode": row.mode,
        "station_id": row.station_id,
        "checkin_gate_id": str(row.checkin_gate_id) if row.checkin_gate_id else None,
        "permissions": row.permissions or {},
        "status": row.status,
        "snapshot_version": row.snapshot_version,
        "last_sync_at": row.last_sync_at.isoformat() if row.last_sync_at else None,
        "last_heartbeat_at": row.last_heartbeat_at.isoformat() if row.last_heartbeat_at else None,
        "revoked_at": row.revoked_at.isoformat() if row.revoked_at else None,
        "revoked_reason": row.revoked_reason,
        "created_by": str(row.created_by) if row.created_by else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    } for row in assignments]

    return {
        "event_id": str(event_id),
        "rooms": rooms_list,
        "sessions": sessions_list,
        "participants": participants_list,
        "participant_extensions": extensions_list,
        "registrations": registrations_list,
        "companions": companions_list,
        "badges": badges_list,
        "badge_history": badge_history_list,
        "badge_print_jobs": print_jobs_list,
        "printers": printers_list,
        "print_templates": templates_list,
        "capacity_rules": rules_list,
        "participant_roles": roles_list,
        "venue_checkins": venue_checkins_list,
        "venue_scan_events": scan_events_list,
        "kits": kits_list,
        "participant_kits": participant_kits_list,
        "participant_action_logs": action_logs_list,
        "room_devices": devices_list,
        "node_assignments": assignments_list,
    }


@organizer_router.get("/queue")
async def get_organizer_sync_payload(event: CurrentEvent, db: AsyncSession = Depends(get_db)):
    return await _fetch_sync_queue(db, event.id)

@router.post("/events/{event_id}/push")
async def push_sync_payload(
    event_id: uuid.UUID,
    payload: List[PushItemSchema],
    device_auth: DeviceAuth,
    db: AsyncSession = Depends(get_db)
):
    _require_device_event(device_auth, event_id)
    await enforce_event_operation(
        db,
        device_auth["organization_id"],
        event_id,
        "venue.sync",
    )
    processed_ids = []
    errors = []
    
    for item in payload:
        try:
            if item.entity_type == "attendance_log":
                if item.action == "create":
                    p_id = uuid.UUID(item.payload["participant_id"])
                    s_id = uuid.UUID(item.payload["session_id"])
                    await _require_participant_and_session(db, event_id, p_id, s_id)
                    existing_log = await db.get(AttendanceLog, item.entity_id)
                    if not existing_log:
                        checkin_time = datetime.fromisoformat(item.payload["checkin_time"])
                        
                        log = AttendanceLog(
                            id=item.entity_id,
                            participant_id=p_id,
                            session_id=s_id,
                            method=item.payload.get("method", "qr"),
                            device_id=item.payload.get("device_id", "unknown"),
                            checkin_time=checkin_time,
                            created_at=item.created_at
                        )
                        db.add(log)
                        
                        # Dual write to legacy CheckIn
                        q_checkin = select(CheckIn).where(
                            CheckIn.event_id == event_id,
                            CheckIn.participant_id == p_id,
                            CheckIn.session_id == s_id
                        )
                        existing_checkin = (await db.execute(q_checkin)).scalar_one_or_none()
                        if not existing_checkin:
                            checkin = CheckIn(
                                event_id=event_id,
                                participant_id=p_id,
                                session_id=s_id,
                                check_in_time=checkin_time
                            )
                            db.add(checkin)
                            
                elif item.action == "update":
                    log = await _get_event_attendance_log(db, event_id, item.entity_id)
                    if log:
                        if "checkout_time" in item.payload and item.payload["checkout_time"]:
                            log.checkout_time = datetime.fromisoformat(item.payload["checkout_time"])
                        if "duration" in item.payload:
                            log.duration = item.payload["duration"]
                            
            elif item.entity_type == "badge_scan":
                if item.action == "create":
                    b_id = uuid.UUID(item.payload["badge_id"])
                    await _require_event_badge(db, event_id, b_id)
                    existing_scan = await db.get(BadgeScan, item.entity_id)
                    if not existing_scan:
                        scan = BadgeScan(
                            id=item.entity_id,
                            badge_id=b_id,
                            location=item.payload["location"],
                            scan_type=item.payload.get("scan_type", "entry"),
                            created_at=datetime.fromisoformat(item.payload["created_at"])
                        )
                        db.add(scan)
                        
            elif item.entity_type == "badge_print_job":
                if item.action == "create":
                    b_id = uuid.UUID(item.payload["badge_id"])
                    await _require_event_badge(db, event_id, b_id)
                    existing_job = await db.get(BadgePrintJob, item.entity_id)
                    if not existing_job:
                        pr_id = uuid.UUID(item.payload["printer_id"])
                        job = BadgePrintJob(
                            id=item.entity_id,
                            badge_id=b_id,
                            printer_id=pr_id,
                            status=item.payload.get("status", "queued"),
                            queued_at=datetime.fromisoformat(item.payload["queued_at"]),
                            printed_at=datetime.fromisoformat(item.payload["printed_at"]) if item.payload.get("printed_at") else None
                        )
                        db.add(job)
                        
                        # Update badge status to printed if it's completed
                        if job.status == "completed":
                            badge = await db.get(Badge, b_id)
                            if badge:
                                badge.status = "printed"
            else:
                raise ValueError("UNSUPPORTED_SYNC_ENTITY")
            
            processed_ids.append(item.id)
        except Exception as e:
            errors.append({"id": str(item.id), "error": str(e)})
            
    await db.commit()
    return {"processed_ids": processed_ids, "errors": errors}


def _require_device_event(device_auth: dict, event_id: uuid.UUID) -> None:
    if device_auth["event_id"] != event_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")


async def _require_participant_and_session(
    db: AsyncSession,
    event_id: uuid.UUID,
    participant_id: uuid.UUID,
    session_id: uuid.UUID,
) -> None:
    participant_exists = await db.scalar(
        select(Participant.id).where(
            Participant.id == participant_id,
            Participant.event_id == event_id,
        )
    )
    session_exists = await db.scalar(
        select(Session.id).where(Session.id == session_id, Session.event_id == event_id)
    )
    if participant_exists is None or session_exists is None:
        raise ValueError("SYNC_ENTITY_OUTSIDE_DEVICE_EVENT")


async def _require_event_badge(
    db: AsyncSession, event_id: uuid.UUID, badge_id: uuid.UUID
) -> None:
    badge_exists = await db.scalar(
        select(Badge.id)
        .join(Participant, Participant.id == Badge.participant_id)
        .where(Badge.id == badge_id, Participant.event_id == event_id)
    )
    if badge_exists is None:
        raise ValueError("SYNC_ENTITY_OUTSIDE_DEVICE_EVENT")


async def _get_event_attendance_log(
    db: AsyncSession, event_id: uuid.UUID, log_id: uuid.UUID
) -> AttendanceLog | None:
    return await db.scalar(
        select(AttendanceLog)
        .join(Participant, Participant.id == AttendanceLog.participant_id)
        .where(AttendanceLog.id == log_id, Participant.event_id == event_id)
    )

