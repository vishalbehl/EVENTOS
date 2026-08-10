"""Event-scoped workstation enrollment, snapshots, heartbeats and offline uploads."""
import base64, hashlib, hmac, json, secrets, uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_database
from app.models.event import Event
from app.models.room import Room
from app.models.session import Session
from app.models.print_template import PrintTemplate
from app.models.participant_role import ParticipantRole
from app.models.participant import Participant
from app.models.companion import Companion
from app.models.participant_registration import ParticipantRegistration
from app.models.participant_extension import ParticipantExtension
from app.models.room_device import RoomDevice
from app.models.venue_capacity_rule import VenueCapacityRule
from app.models.venue_node import VenueNodeAssignment, VenueNodeOperation
from app.models.venue_user import VenueUser
from app.models.badge_models import Badge, BadgeHistory, BadgePrintJob, BadgeScan, Printer
from app.models.venue_checkin import VenueCheckIn
from app.models.kit_models import Kit, ParticipantKit
from app.models.action_log import ParticipantActionLog
from app.routers.auth import require_admin

admin_router = APIRouter(prefix="/api/v1/venue/admin/events", tags=["venue-node-admin"])
node_router = APIRouter(prefix="/api/v1/venue/nodes", tags=["venue-nodes"])


class AssignNodeRequest(BaseModel):
    device_id: uuid.UUID
    mode: str = Field(pattern="^(registration|scanning|self_checkin)$")
    station_id: Optional[str] = Field(default=None, max_length=120)
    capacity_rule_id: Optional[uuid.UUID] = None
    permissions: dict[str, Any] = Field(default_factory=dict)


class Operation(BaseModel):
    operation_id: str = Field(min_length=8, max_length=120)
    action: str = Field(min_length=2, max_length=60)
    payload: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime


class OperationBatch(BaseModel):
    operations: list[Operation] = Field(default_factory=list, max_length=500)


class RevokeRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _node_token(assignment_id: uuid.UUID, event_id: uuid.UUID) -> str:
    now = datetime.now(timezone.utc)
    body = {"typ": "venue-node", "assignment_id": str(assignment_id), "event_id": str(event_id), "iat": int(now.timestamp()), "exp": int((now + timedelta(days=30)).timestamp()), "nonce": secrets.token_urlsafe(8)}
    raw = _encode(json.dumps(body, separators=(",", ":")).encode())
    sig = _encode(hmac.new(settings.VENUE_AUTH_SECRET.encode(), raw.encode(), hashlib.sha256).digest())
    return f"{raw}.{sig}"


async def _authorize_node(token: str | None, db: AsyncSession) -> VenueNodeAssignment:
    if not token:
        raise HTTPException(status_code=401, detail="Node credential required")
    payload: dict[str, Any] = {}
    try:
        raw, signature = token.split(".", 1)
        expected = hmac.new(settings.VENUE_AUTH_SECRET.encode(), raw.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))):
            raise ValueError("signature")
        payload = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
        if payload.get("typ") != "venue-node" or int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("expired")
        assignment = await db.get(VenueNodeAssignment, uuid.UUID(payload["assignment_id"]))
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        assignment = None
    try:
        token_event_id = uuid.UUID(str(payload.get("event_id")))
    except (TypeError, ValueError):
        token_event_id = None
    if not assignment or assignment.status != "active" or assignment.event_id != token_event_id:
        raise HTTPException(status_code=403, detail="Node credential is invalid, revoked, or assigned to another event")
    return assignment


def _iso(value: Any) -> Any:
    return value.isoformat() if hasattr(value, "isoformat") else value


async def _snapshot(db: AsyncSession, event: Event, assignment: VenueNodeAssignment) -> dict[str, Any]:
    rooms = (await db.execute(select(Room).where(Room.event_id == event.id).order_by(Room.name, Room.id))).scalars().all()
    sessions = (await db.execute(select(Session).where(Session.event_id == event.id).order_by(Session.start_time, Session.id))).scalars().all()
    templates = (await db.execute(select(PrintTemplate).where(PrintTemplate.event_id == event.id).order_by(PrintTemplate.template_name, PrintTemplate.id))).scalars().all()
    roles = (await db.execute(select(ParticipantRole).where(ParticipantRole.event_id == event.id).order_by(ParticipantRole.sort_order, ParticipantRole.name, ParticipantRole.id))).scalars().all()
    participants = (await db.execute(select(Participant).where(Participant.event_id == event.id).order_by(Participant.regno, Participant.id))).scalars().all()
    registrations = (await db.execute(select(ParticipantRegistration).where(ParticipantRegistration.event_id == event.id))).scalars().all()
    participant_ids = [p.id for p in participants]
    extensions = (await db.execute(select(ParticipantExtension).where(ParticipantExtension.participant_id.in_(participant_ids)))).scalars().all() if participant_ids else []
    companions = (await db.execute(select(Companion).where(Companion.primary_participant_id.in_(participant_ids)).order_by(Companion.created_at, Companion.id))).scalars().all() if participant_ids else []
    badges = (await db.execute(select(Badge).where(Badge.participant_id.in_(participant_ids)).order_by(Badge.created_at, Badge.id))).scalars().all() if participant_ids else []
    badge_ids = [b.id for b in badges]
    badge_history = (await db.execute(select(BadgeHistory).where(BadgeHistory.badge_id.in_(badge_ids)).order_by(BadgeHistory.created_at, BadgeHistory.id))).scalars().all() if badge_ids else []
    print_jobs = (await db.execute(select(BadgePrintJob).where(BadgePrintJob.badge_id.in_(badge_ids)).order_by(BadgePrintJob.queued_at, BadgePrintJob.id))).scalars().all() if badge_ids else []
    printer_ids = [job.printer_id for job in print_jobs if job.printer_id]
    printers = (await db.execute(select(Printer).where(Printer.id.in_(printer_ids)).order_by(Printer.name, Printer.id))).scalars().all() if printer_ids else []
    kits = (await db.execute(select(Kit).order_by(Kit.kit_name))).scalars().all()
    participant_kits = (await db.execute(select(ParticipantKit).where(ParticipantKit.participant_id.in_(participant_ids)).order_by(ParticipantKit.issued_at, ParticipantKit.id))).scalars().all() if participant_ids else []
    action_logs = (await db.execute(select(ParticipantActionLog).where(ParticipantActionLog.participant_id.in_(participant_ids)).order_by(ParticipantActionLog.created_at, ParticipantActionLog.id))).scalars().all() if participant_ids else []
    scan_events = (await db.execute(select(BadgeScan).where(BadgeScan.event_id == event.id).order_by(BadgeScan.created_at, BadgeScan.id))).scalars().all()
    checkins = (await db.execute(select(VenueCheckIn).where(VenueCheckIn.event_id == event.id).order_by(VenueCheckIn.checkin_time, VenueCheckIn.id))).scalars().all()
    rules = (await db.execute(select(VenueCapacityRule).order_by(VenueCapacityRule.station_name))).scalars().all()
    devices = (await db.execute(select(RoomDevice).where(RoomDevice.event_id == event.id).order_by(RoomDevice.device_name, RoomDevice.id))).scalars().all()
    assignments = (await db.execute(select(VenueNodeAssignment).where(VenueNodeAssignment.event_id == event.id).order_by(VenueNodeAssignment.created_at, VenueNodeAssignment.id))).scalars().all()
    payload = {
        "schema_version": 2,
        "event": {"id": str(event.id), "name": event.name, "short_code": event.short_code, "start_date": _iso(event.start_date), "end_date": _iso(event.end_date), "timezone": event.timezone, "venue_name": event.venue_name, "location": event.location},
        "assignment": {"id": str(assignment.id), "mode": assignment.mode, "station_id": assignment.station_id, "capacity_rule_id": str(assignment.capacity_rule_id) if assignment.capacity_rule_id else None, "permissions": assignment.permissions or {}},
        "rooms": [{"id": str(r.id), "name": r.name, "capacity": r.capacity, "screen_count": r.screen_count, "room_type": r.room_type, "av_technician": r.av_technician, "location_notes": r.location_notes, "is_active": r.is_active} for r in rooms],
        "sessions": [{"id": str(s.id), "session_code": s.session_code, "name": s.name, "room_id": str(s.room_id) if s.room_id else None, "start_time": _iso(s.start_time), "end_time": _iso(s.end_time), "status": s.status} for s in sessions],
        "print_templates": [{"id": str(t.id), "template_name": t.template_name, "template_type": t.template_type, "template_data": t.template_data or {}, "updated_at": _iso(t.updated_at)} for t in templates],
        "participant_roles": [{"id": str(r.id), "category": r.category, "name": r.name, "role_code": r.role_code, "is_active": r.is_active, "is_default": r.is_default, "sort_order": r.sort_order} for r in roles],
        "participants": [{"id": str(p.id), "regno": p.regno, "name": p.name, "first_name": p.first_name, "last_name": p.last_name, "email": p.email, "phone": p.phone, "role": p.role, "company": p.company, "designation": p.designation, "country": p.country, "paid_status": p.paid_status, "source": p.source, "custom_fields": p.custom_fields or {}, "registered_at": _iso(p.registered_at)} for p in participants],
        "registrations": [{"id": str(r.id), "participant_id": str(r.participant_id) if r.participant_id else None, "registration_status": r.registration_status, "registration_data": r.registration_data or {}, "submitted_at": _iso(r.submitted_at), "reviewed_at": _iso(r.reviewed_at)} for r in registrations],
        "participant_extensions": [{"id": str(e.id), "participant_id": str(e.participant_id), "department": e.department, "city": e.city, "dietary_preference": e.dietary_preference, "emergency_contact": e.emergency_contact, "notes": e.notes, "custom_attributes": e.custom_attributes or {}, "created_at": _iso(e.created_at), "updated_at": _iso(e.updated_at)} for e in extensions],
        "companions": [{"id": str(c.id), "primary_participant_id": str(c.primary_participant_id), "first_name": c.first_name, "last_name": c.last_name, "relationship": c.relationship, "email": c.email, "phone": c.phone, "badge_code": c.badge_code, "badge_status": c.badge_status, "checked_in": c.checked_in, "checked_in_at": _iso(c.checked_in_at), "dietary_preference": c.dietary_preference, "special_assistance": c.special_assistance, "notes": c.notes, "created_at": _iso(c.created_at)} for c in companions],
        "badges": [{"id": str(b.id), "participant_id": str(b.participant_id), "badge_code": b.badge_code, "qr_token": b.qr_token, "barcode": b.barcode, "nfc_uid": b.nfc_uid, "template_id": str(b.template_id) if b.template_id else None, "status": b.status, "issued_at": _iso(b.issued_at), "created_at": _iso(b.created_at), "updated_at": _iso(b.updated_at)} for b in badges],
        "badge_history": [{"id": str(h.id), "badge_id": str(h.badge_id), "action": h.action, "performed_by": str(h.performed_by) if h.performed_by else None, "metadata": h.action_metadata or {}, "created_at": _iso(h.created_at)} for h in badge_history],
        "badge_print_jobs": [{"id": str(j.id), "badge_id": str(j.badge_id), "printer_id": str(j.printer_id) if j.printer_id else None, "status": j.status, "queued_at": _iso(j.queued_at), "printed_at": _iso(j.printed_at)} for j in print_jobs],
        "printers": [{"id": str(p.id), "name": p.name, "ip_address": p.ip_address, "location": p.location, "status": p.status} for p in printers],
        "capacity_rules": [{"id": str(r.id), "station_name": r.station_name, "station_type": r.station_type, "allowed_roles": r.allowed_roles or [], "max_checkins_per_delegate": r.max_checkins_per_delegate, "station_capacity": r.station_capacity} for r in rules],
        "kits": [{"id": str(k.id), "kit_name": k.kit_name, "category": k.category, "total_quantity": k.total_quantity, "distributed_quantity": k.distributed_quantity, "max_per_participant": k.max_per_participant, "description": k.description, "target_roles": k.target_roles or ["All"], "created_at": _iso(k.created_at)} for k in kits],
        "participant_kits": [{"id": str(pk.id), "participant_id": str(pk.participant_id), "kit_id": str(pk.kit_id), "status": pk.status, "issued_by": pk.issued_by, "issued_at": _iso(pk.issued_at)} for pk in participant_kits],
        "participant_action_logs": [{"id": str(a.id), "participant_id": str(a.participant_id), "action_type": a.action_type, "performed_by": a.performed_by, "details": a.details, "created_at": _iso(a.created_at)} for a in action_logs],
        "venue_scan_events": [{"id": str(s.id), "event_id": str(s.event_id) if s.event_id else None, "participant_id": str(s.participant_id) if s.participant_id else None, "companion_id": str(s.companion_id) if s.companion_id else None, "checkin_gate_id": str(s.checkin_gate_id) if s.checkin_gate_id else None, "badge_id": str(s.badge_id) if s.badge_id else None, "station_name": s.station_name, "station_type": s.station_type, "location": s.location, "badge_code": s.badge_code, "scan_type": s.scan_type, "status": s.status, "rejection_reason": s.rejection_reason, "admin_overridden_by": s.admin_overridden_by, "created_at": _iso(s.created_at)} for s in scan_events],
        "venue_checkins": [{"id": str(c.id), "event_id": str(c.event_id) if c.event_id else None, "participant_id": str(c.participant_id) if c.participant_id else None, "companion_id": str(c.companion_id) if c.companion_id else None, "checkin_gate_id": str(c.checkin_gate_id) if c.checkin_gate_id else None, "gate_name": c.gate_name, "gate_type": c.gate_type, "gate_capacity": c.gate_capacity, "badge_code": c.badge_code, "scan_type": c.scan_type, "status": c.status, "rejection_reason": c.rejection_reason, "admin_overridden_by": c.admin_overridden_by, "checkin_time": _iso(c.checkin_time), "checkout_time": _iso(c.checkout_time), "duration": c.duration, "session_id": str(c.session_id) if c.session_id else None, "method": c.method, "device_id": c.device_id, "operation_id": c.operation_id, "created_at": _iso(c.created_at)} for c in checkins],
        "room_devices": [{"id": str(d.id), "event_id": str(d.event_id), "room_id": str(d.room_id) if d.room_id else None, "device_type": d.device_type, "device_name": d.device_name, "hostname": d.hostname, "ip_address": str(d.ip_address) if d.ip_address else None, "mac_address": str(d.mac_address) if d.mac_address else None, "os_version": d.os_version, "app_version": d.app_version, "status": d.status, "last_heartbeat_at": _iso(d.last_heartbeat_at), "registered_at": _iso(d.registered_at), "updated_at": _iso(d.updated_at)} for d in devices],
        "node_assignments": [{"id": str(a.id), "event_id": str(a.event_id), "device_id": str(a.device_id), "mode": a.mode, "station_id": a.station_id, "checkin_gate_id": str(a.checkin_gate_id) if a.checkin_gate_id else None, "permissions": a.permissions or {}, "status": a.status, "snapshot_version": a.snapshot_version, "last_sync_at": _iso(a.last_sync_at), "last_heartbeat_at": _iso(a.last_heartbeat_at), "revoked_at": _iso(a.revoked_at), "revoked_reason": a.revoked_reason, "created_by": str(a.created_by) if a.created_by else None, "created_at": _iso(a.created_at), "updated_at": _iso(a.updated_at)} for a in assignments],
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    payload["snapshot"] = {"version": assignment.snapshot_version, "sha256": hashlib.sha256(canonical).hexdigest(), "generated_at": datetime.now(timezone.utc).isoformat()}
    return payload


def _operation_error(message: str) -> tuple[str, str]:
    return "rejected", message


async def _participant_for_operation(db: AsyncSession, event_id: uuid.UUID, payload: dict[str, Any]) -> Participant | None:
    participant_id = payload.get("participant_id")
    if participant_id:
        try:
            participant = await db.get(Participant, uuid.UUID(str(participant_id)))
            return participant if participant and participant.event_id == event_id else None
        except ValueError:
            return None
    code = str(payload.get("registration_code") or payload.get("regno") or "").strip()
    if code:
        return (await db.execute(select(Participant).where(Participant.event_id == event_id, Participant.regno == code).limit(1))).scalar_one_or_none()
    return None


async def _apply_operation(db: AsyncSession, assignment: VenueNodeAssignment, operation: Operation) -> tuple[str, str | None]:
    """Apply an offline action only within the node's event, mode and assigned rule."""
    action, payload = operation.action, operation.payload
    permitted = assignment.permissions or {}
    if permitted and permitted.get(action) is False:
        return _operation_error(f"Action '{action}' is not enabled for this workstation")
    if action in {"check_in", "check_out", "scan"} and assignment.mode != "scanning":
        return _operation_error("Attendance actions are only allowed for scanning workstations")
    if action in {"badge_issue", "badge_reprint", "registration_update", "registration_create"} and assignment.mode != "registration":
        return _operation_error("Registration actions are only allowed for registration workstations")
    if action == "kit_issue" and assignment.mode != "registration":
        return _operation_error("Kit distribution actions are only allowed for kit or registration workstations")

    participant = await _participant_for_operation(db, assignment.event_id, payload)
    companion = None
    if payload.get("companion_id"):
        try:
            companion = await db.get(Companion, uuid.UUID(str(payload["companion_id"])))
        except (TypeError, ValueError):
            return _operation_error("Companion identity is invalid")
        if not companion or companion.primary_participant_id != (participant.id if participant else None):
            return _operation_error("Companion is not linked to this participant")
    if action in {"check_in", "check_out", "scan", "badge_issue", "badge_reprint", "kit_issue", "registration_update"} and not participant:
        return _operation_error("Participant was not found in this event snapshot")

    if action == "registration_create":
        first_name = str(payload.get("first_name") or "").strip()
        last_name = str(payload.get("last_name") or "").strip()
        if not first_name:
            return _operation_error("First name is required for offline registration")
        regno = str(payload.get("regno") or f"OFF-{operation.operation_id[:8].upper()}")
        existing = (await db.execute(select(Participant).where(Participant.event_id == assignment.event_id, Participant.regno == regno).limit(1))).scalar_one_or_none()
        if existing:
            registration = (await db.execute(select(ParticipantRegistration).where(ParticipantRegistration.event_id == assignment.event_id, ParticipantRegistration.participant_id == existing.id).limit(1))).scalar_one_or_none()
            if not registration:
                db.add(ParticipantRegistration(event_id=assignment.event_id, participant_id=existing.id, registration_status=str(payload.get("registration_status") or "submitted"), registration_data=payload, approval_source="offline_node", submitted_at=operation.occurred_at.astimezone(timezone.utc)))
            return "applied", None
        participant = Participant(id=uuid.uuid4(), event_id=assignment.event_id, regno=regno, name=f"{first_name} {last_name}".strip(), first_name=first_name, last_name=last_name or "Delegate", email=payload.get("email") or None, phone=payload.get("phone") or None, role=payload.get("role") or "Delegate", company=payload.get("company") or None, designation=payload.get("designation") or None, country=payload.get("country") or None, paid_status=payload.get("paid_status") or "Unpaid", source="offline", custom_fields=payload.get("custom_fields") or {})
        db.add(participant)
        await db.flush()
        db.add(ParticipantRegistration(event_id=assignment.event_id, participant_id=participant.id, registration_status=str(payload.get("registration_status") or "submitted"), registration_data=payload, approval_source="offline_node", submitted_at=operation.occurred_at.astimezone(timezone.utc)))
        return "applied", None

    if action in {"check_in", "scan"}:
        if not assignment.capacity_rule_id:
            return _operation_error("Scanning workstation has no assigned capacity rule")
        # Offline scan operations are bound to the Admin-assigned workstation
        # gate. The client payload may echo the gate for audit, but it cannot
        # choose or override the active gate during replay.
        selected_gate_id = str(assignment.capacity_rule_id)
        try:
            selected_gate_uuid = uuid.UUID(str(selected_gate_id))
        except (TypeError, ValueError):
            return _operation_error("Selected check-in gate is invalid")
        station = await db.get(VenueCapacityRule, selected_gate_uuid)
        if not station:
            return _operation_error("Assigned capacity rule no longer exists")
        allowed = station.allowed_roles or []
        if allowed and "All" not in allowed and participant.role not in allowed:
            return _operation_error(f"Role '{participant.role}' is not permitted at {station.station_name}")
        if station.max_checkins_per_delegate > 0:
            identity_filter = BadgeScan.companion_id == (companion.id if companion else None)
            count = (await db.scalar(select(func.count(BadgeScan.id)).where(BadgeScan.event_id == assignment.event_id, BadgeScan.participant_id == participant.id, identity_filter, BadgeScan.station_id == station.id, BadgeScan.scan_type == "check_in", BadgeScan.status.in_(["success", "admin_overridden"])))) or 0
            if count >= station.max_checkins_per_delegate:
                return _operation_error(f"Participant is already checked in at '{station.station_name}'")
        if station.station_capacity > 0:
            count = (await db.scalar(select(func.count(BadgeScan.id)).where(BadgeScan.event_id == assignment.event_id, BadgeScan.station_id == station.id, BadgeScan.status.in_(["success", "admin_overridden"])))) or 0
            if count >= station.station_capacity:
                return _operation_error(f"Capacity reached at {station.station_name}")
        badge_code = str(payload.get("badge_code") or participant.regno or "")
        timestamp = operation.occurred_at.astimezone(timezone.utc)
        db.add(BadgeScan(id=uuid.uuid4(), event_id=assignment.event_id, participant_id=participant.id, companion_id=companion.id if companion else None, station_id=station.id, station_name=station.station_name, station_type=station.station_type, badge_code=badge_code, scan_type="check_in", status="success", created_at=timestamp))
        db.add(VenueCheckIn(id=uuid.uuid4(), event_id=assignment.event_id, participant_id=participant.id, companion_id=companion.id if companion else None, checkin_gate_id=station.id, gate_name=station.station_name, gate_type=station.station_type, gate_capacity=station.station_capacity, badge_code=badge_code, scan_type="check_in", status="success", checkin_time=timestamp, method=str(payload.get("method") or "offline"), device_id=str(assignment.device_id), operation_id=operation.operation_id, created_at=timestamp))
        db.add(ParticipantActionLog(participant_id=participant.id, action_type="checkin", performed_by=str(assignment.device_id), details=f"Offline node {assignment.id}; rule {station.id}"))
        return "applied", None

    if action == "check_out":
        attendance = (await db.execute(select(VenueCheckIn).where(VenueCheckIn.event_id == assignment.event_id, VenueCheckIn.participant_id == participant.id, VenueCheckIn.companion_id == (companion.id if companion else None), VenueCheckIn.status.in_(["success", "admin_overridden"]), VenueCheckIn.checkout_time.is_(None)).order_by(VenueCheckIn.checkin_time.desc()).limit(1))).scalar_one_or_none()
        if not attendance:
            return _operation_error("No open attendance record exists for this participant")
        timestamp = operation.occurred_at.astimezone(timezone.utc)
        attendance.checkout_time = timestamp
        attendance.duration = max(0, int((timestamp - attendance.checkin_time).total_seconds() // 60))
        db.add(ParticipantActionLog(participant_id=participant.id, action_type="checkout", performed_by=str(assignment.device_id), details=f"Offline node {assignment.id}"))
        return "applied", None

    if action in {"badge_issue", "badge_reprint"}:
        badge = None
        if payload.get("badge_id"):
            try: badge = await db.get(Badge, uuid.UUID(str(payload["badge_id"])))
            except ValueError: pass
        if not badge:
            badge = (await db.execute(select(Badge).where(Badge.participant_id == participant.id).limit(1))).scalar_one_or_none()
        if not badge:
            return _operation_error("No badge exists for this participant")
        badge.status, badge.issued_at = "issued", operation.occurred_at.astimezone(timezone.utc)
        printer_id = payload.get("printer_id")
        if printer_id:
            try: db.add(BadgePrintJob(id=uuid.uuid4(), badge_id=badge.id, printer_id=uuid.UUID(str(printer_id)), status="queued", queued_at=badge.issued_at))
            except ValueError: return _operation_error("Invalid printer_id")
        db.add(ParticipantActionLog(participant_id=participant.id, action_type="badge_reprint" if action == "badge_reprint" else "badge_print", performed_by=str(assignment.device_id), details=f"Offline node {assignment.id}"))
        return "applied", None

    if action == "kit_issue":
        try: kit = await db.get(Kit, uuid.UUID(str(payload.get("kit_id"))))
        except (TypeError, ValueError): kit = None
        if not kit: return _operation_error("Kit was not found")
        if kit.total_quantity > 0 and kit.distributed_quantity >= kit.total_quantity: return _operation_error("Kit inventory is exhausted")
        issued = (await db.scalar(select(func.count(ParticipantKit.id)).where(ParticipantKit.participant_id == participant.id, ParticipantKit.kit_id == kit.id, ParticipantKit.status == "Issued"))) or 0
        if issued >= kit.max_per_participant: return _operation_error("Participant already received the maximum allowed kits")
        db.add(ParticipantKit(id=uuid.uuid4(), participant_id=participant.id, kit_id=kit.id, status="Issued", issued_by=str(assignment.device_id), issued_at=operation.occurred_at.astimezone(timezone.utc)))
        kit.distributed_quantity += 1
        db.add(ParticipantActionLog(participant_id=participant.id, action_type="kit_issue", performed_by=str(assignment.device_id), details=f"Offline node {assignment.id}; kit {kit.id}"))
        return "applied", None

    if action == "registration_update":
        allowed_fields = {"name", "first_name", "last_name", "email", "phone", "company", "designation", "country", "paid_status"}
        updates = payload.get("changes") or {}
        if not isinstance(updates, dict): return _operation_error("Registration changes must be an object")
        for key, value in updates.items():
            if key in allowed_fields: setattr(participant, key, value)
        db.add(ParticipantActionLog(participant_id=participant.id, action_type="registration_update", performed_by=str(assignment.device_id), details=f"Offline node {assignment.id}"))
        return "applied", None
    return _operation_error(f"Unsupported offline operation '{action}'")


@admin_router.get("")
async def list_events(db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_admin)):
    """Return all local events available on this venue node."""
    rows = (await db.execute(select(Event).order_by(Event.start_date.desc()))).scalars().all()
    return [
        {
            "id": str(e.id),
            "name": e.name,
            "short_code": e.short_code,
            "status": e.status,
            "start_date": e.start_date.isoformat() if e.start_date else None,
            "end_date": e.end_date.isoformat() if e.end_date else None,
            "venue_name": e.venue_name,
        }
        for e in rows
    ]


@admin_router.get("/{event_id}/nodes")
async def list_nodes(event_id: uuid.UUID, db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_admin)):
    if not await db.get(Event, event_id):
        raise HTTPException(404, "Event not found")
    rows = (await db.execute(select(VenueNodeAssignment, RoomDevice).join(RoomDevice, RoomDevice.id == VenueNodeAssignment.device_id).where(VenueNodeAssignment.event_id == event_id).order_by(RoomDevice.device_name))).all()
    return [{"id": str(a.id), "device_id": str(d.id), "device_name": d.device_name, "hostname": d.hostname, "ip_address": str(d.ip_address) if d.ip_address else None, "mac_address": str(d.mac_address) if d.mac_address else None, "mode": a.mode, "station_id": a.station_id, "capacity_rule_id": str(a.capacity_rule_id) if a.capacity_rule_id else None, "permissions": a.permissions or {}, "status": a.status, "snapshot_version": a.snapshot_version, "last_sync_at": _iso(a.last_sync_at), "last_heartbeat_at": _iso(a.last_heartbeat_at)} for a, d in rows]


@admin_router.get("/{event_id}/local-db-snapshot")
async def local_database_snapshot(event_id: uuid.UUID, db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_admin)):
    """Return an Admin-created SQLite replica snapshot for first-screen import/export flows."""
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    assignment = SimpleNamespace(
        id=uuid.uuid5(uuid.NAMESPACE_URL, f"eventos-admin-local-db:{event_id}"),
        mode="admin",
        station_id=None,
        capacity_rule_id=None,
        permissions={"admin_local_database_export": True},
        snapshot_version=1,
    )
    return await _snapshot(db, event, assignment)


@admin_router.post("/{event_id}/nodes/assign")
async def assign_node(event_id: uuid.UUID, payload: AssignNodeRequest, db: AsyncSession = Depends(get_database), user: VenueUser = Depends(require_admin)):
    if not await db.get(Event, event_id):
        raise HTTPException(404, "Event not found")
    device = await db.get(RoomDevice, payload.device_id)
    if not device or device.event_id != event_id:
        raise HTTPException(404, "Device is not registered for this event")
    permissions = dict(payload.permissions or {})
    requested_allowed_modes = permissions.get("allowed_modes")
    if not isinstance(requested_allowed_modes, list):
        requested_allowed_modes = [payload.mode]
    allowed_modes = []
    for value in [payload.mode, *requested_allowed_modes]:
        if value not in {"registration", "scanning", "self_checkin"}:
            raise HTTPException(422, "allowed_modes contains an unsupported mode")
        if value not in allowed_modes:
            allowed_modes.append(value)
    permissions["allowed_modes"] = allowed_modes
    if "scanning" in allowed_modes and not payload.capacity_rule_id:
        raise HTTPException(422, "Scanning nodes require a capacity_rule_id")
    if payload.capacity_rule_id and not await db.get(VenueCapacityRule, payload.capacity_rule_id):
        raise HTTPException(422, "Capacity rule not found")
    existing = (await db.execute(select(VenueNodeAssignment).where(VenueNodeAssignment.event_id == event_id, VenueNodeAssignment.device_id == device.id))).scalar_one_or_none()
    if not existing:
        existing = VenueNodeAssignment(event_id=event_id, device_id=device.id, created_by=user.id)
        db.add(existing)
    existing.mode, existing.station_id, existing.capacity_rule_id = payload.mode, payload.station_id, payload.capacity_rule_id
    existing.permissions, existing.status, existing.revoked_at = permissions, "active", None
    existing.snapshot_version += 1
    await db.commit(); await db.refresh(existing)
    return {"assignment_id": str(existing.id), "status": existing.status, "snapshot_version": existing.snapshot_version, "enrollment_token": _node_token(existing.id, event_id), "warning": "Store this token securely; issue a new assignment to rotate it."}


@admin_router.post("/{event_id}/nodes/{assignment_id}/resync")
async def force_node_resync(event_id: uuid.UUID, assignment_id: uuid.UUID, db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_admin)):
    assignment = await db.get(VenueNodeAssignment, assignment_id)
    if not assignment or assignment.event_id != event_id:
        raise HTTPException(404, "Node assignment not found")
    if assignment.status == "revoked":
        raise HTTPException(409, "A revoked node must be assigned again before it can synchronize")
    assignment.snapshot_version += 1
    await db.commit()
    return {"assignment_id": str(assignment.id), "snapshot_version": assignment.snapshot_version, "status": assignment.status}


@admin_router.post("/{event_id}/nodes/{assignment_id}/revoke")
async def revoke_node(event_id: uuid.UUID, assignment_id: uuid.UUID, payload: RevokeRequest, db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_admin)):
    assignment = await db.get(VenueNodeAssignment, assignment_id)
    if not assignment or assignment.event_id != event_id:
        raise HTTPException(404, "Node assignment not found")
    assignment.status, assignment.revoked_at, assignment.revoked_reason = "revoked", datetime.now(timezone.utc), payload.reason
    await db.commit()
    return {"assignment_id": str(assignment.id), "status": "revoked"}


@admin_router.get("/{event_id}/nodes/{assignment_id}/operations")
async def node_operations(event_id: uuid.UUID, assignment_id: uuid.UUID, db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_admin)):
    assignment = await db.get(VenueNodeAssignment, assignment_id)
    if not assignment or assignment.event_id != event_id:
        raise HTTPException(404, "Node assignment not found")
    rows = (await db.execute(select(VenueNodeOperation).where(VenueNodeOperation.assignment_id == assignment_id).order_by(VenueNodeOperation.occurred_at.desc()).limit(500))).scalars().all()
    return [{"operation_id": row.operation_id, "action": row.action, "status": row.status, "conflict_reason": row.conflict_reason, "occurred_at": _iso(row.occurred_at), "received_at": _iso(row.received_at)} for row in rows]


@node_router.get("/{assignment_id}/bootstrap")
async def bootstrap_node(assignment_id: uuid.UUID, x_venue_node_token: str | None = Header(default=None), db: AsyncSession = Depends(get_database)):
    assignment = await _authorize_node(x_venue_node_token, db)
    if assignment.id != assignment_id:
        raise HTTPException(403, "Credential does not match node")
    event = await db.get(Event, assignment.event_id)
    payload = await _snapshot(db, event, assignment)
    return payload


@node_router.post("/{assignment_id}/heartbeat")
async def heartbeat_node(assignment_id: uuid.UUID, x_venue_node_token: str | None = Header(default=None), db: AsyncSession = Depends(get_database)):
    assignment = await _authorize_node(x_venue_node_token, db)
    if assignment.id != assignment_id: raise HTTPException(403, "Credential does not match node")
    now = datetime.now(timezone.utc); assignment.last_heartbeat_at = now; assignment.status = "active"; assignment.last_sync_at = now
    await db.commit()
    return {"status": "ok", "server_time": now.isoformat(), "snapshot_version": assignment.snapshot_version}


@node_router.post("/{assignment_id}/operations")
async def upload_operations(assignment_id: uuid.UUID, batch: OperationBatch, x_venue_node_token: str | None = Header(default=None), db: AsyncSession = Depends(get_database)):
    assignment = await _authorize_node(x_venue_node_token, db)
    if assignment.id != assignment_id: raise HTTPException(403, "Credential does not match node")
    accepted, duplicate, conflicts = [], [], []
    for op in batch.operations:
        existing = (await db.execute(select(VenueNodeOperation).where(VenueNodeOperation.operation_id == op.operation_id))).scalar_one_or_none()
        if existing: duplicate.append(op.operation_id); continue
        operation = VenueNodeOperation(operation_id=op.operation_id, assignment_id=assignment.id, event_id=assignment.event_id, action=op.action, payload=op.payload, occurred_at=op.occurred_at)
        db.add(operation)
        await db.flush()
        state, reason = await _apply_operation(db, assignment, op)
        operation.status, operation.conflict_reason = state, reason
        if state == "applied": accepted.append(op.operation_id)
        else: conflicts.append({"operation_id": op.operation_id, "reason": reason})
    assignment.last_sync_at = datetime.now(timezone.utc)
    await db.commit()
    return {"accepted": accepted, "duplicates": duplicate, "conflicts": conflicts, "next_action": "pull_snapshot" if conflicts else "none"}
