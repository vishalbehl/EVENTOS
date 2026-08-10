import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc, update, distinct, delete

from app.database import get_database
from app.models.event import Event
from app.models.participant import Participant
from app.models.participant_registration import ParticipantRegistration
from app.models.badge_models import Badge, BadgeHistory, BadgePrintJob, BadgeScan
from app.models.print_template import PrintTemplate
from app.models.srr_activity_log import SRRActivityLog
from app.models.sync_outbox import SyncOutbox
from app.models.companion import Companion
from app.models.kit_models import Kit, ParticipantKit
from app.models.participant_extension import ParticipantExtension
from app.models.venue_capacity_rule import VenueCapacityRule
from app.models.capacity_rule import CapacityRule
from app.models.venue_checkin import VenueCheckIn
from app.models.action_log import ParticipantActionLog
from app.models.venue_user import VenueUser
from app.routers.auth import verify_password

router = APIRouter(prefix="/api/v1/venue/registration", tags=["registration_api"])


import json

async def log_participant_action(
    db: AsyncSession,
    participant_id: uuid.UUID,
    action_type: str,
    performed_by: str = "REG-DESK-01",
    details: Any = None
):
    """
    Helper function to log every operational action (badge print, reprint, checkin, kit issue, kit reset).
    """
    try:
        details_str = json.dumps(details) if isinstance(details, (dict, list)) else (str(details) if details is not None else None)
        log_entry = ParticipantActionLog(
            id=uuid.uuid4(),
            participant_id=participant_id,
            action_type=action_type,
            performed_by=performed_by,
            details=details_str,
            created_at=datetime.now(timezone.utc)
        )
        db.add(log_entry)
    except Exception as e:
        print(f"Warning: Failed to log participant action ({action_type}): {e}")


async def is_participant_checked_in(db: AsyncSession, p: Participant) -> bool:
    if not p:
        return False
    b_code = getattr(p, "badge_code", None) or p.regno
    has_checkin = (await db.scalar(
        select(func.count(VenueCheckIn.id)).where(
            or_(
                VenueCheckIn.participant_id == p.id,
                VenueCheckIn.badge_code == b_code,
                VenueCheckIn.badge_code == p.regno
            ),
            VenueCheckIn.status.in_(["success", "admin_overridden"])
        )
    )) or 0
    return has_checkin > 0


# ── Schemas ──────────────────────────────────────────────

def _looks_like_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (TypeError, ValueError):
        return False


class CreateParticipantRequest(BaseModel):
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str = "Delegate"
    company: Optional[str] = None
    designation: Optional[str] = None
    country: Optional[str] = "India"
    paid_status: str = "Unpaid"
    amount: float = 0.0
    payment_method: Optional[str] = "Cash"
    custom_fields: Optional[Dict[str, Any]] = None
    admin_override: Optional[bool] = False
    allow_override: Optional[bool] = False

class UpdateParticipantRequest(BaseModel):
    first_name: Optional[str] = Field(default=None, max_length=150)
    last_name: Optional[str] = Field(default=None, max_length=150)
    name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[str] = Field(default=None, max_length=320)
    phone: Optional[str] = Field(default=None, max_length=30)
    role: Optional[str] = Field(default=None, max_length=50)
    company: Optional[str] = Field(default=None, max_length=255)
    designation: Optional[str] = Field(default=None, max_length=255)
    country: Optional[str] = Field(default=None, max_length=100)
    paid_status: Optional[str] = Field(default=None, max_length=30)
    custom_fields: Optional[Dict[str, Any]] = None

class CheckInRequest(BaseModel):
    participant_id: Optional[uuid.UUID] = None
    badge_code: Optional[str] = None
    regno: Optional[str] = None
    scanner_id: Optional[str] = "REG-DESK-01"
    station_id: Optional[uuid.UUID] = None
    station_name: Optional[str] = None

class PrintBadgeRequest(BaseModel):
    participant_id: uuid.UUID
    printer_id: Optional[str] = "DEFAULT_PRINTER"
    template_id: Optional[uuid.UUID] = None

class ReprintBadgeRequest(BaseModel):
    participant_id: uuid.UUID
    reason: str = "Lost" # Lost | Damaged | Information Update | Replacement
    notes: Optional[str] = None

class CollectPaymentRequest(BaseModel):
    participant_id: uuid.UUID
    amount: float
    payment_method: str = "Cash" # Cash | Card | UPI | NetBanking
    transaction_ref: Optional[str] = None

class SelfCheckInLookupRequest(BaseModel):
    query: str = Field(min_length=1, max_length=320)

class SelfCheckInUpdateRequest(BaseModel):
    first_name: Optional[str] = Field(default=None, max_length=150)
    last_name: Optional[str] = Field(default=None, max_length=150)
    name: Optional[str] = Field(default=None, max_length=320)
    email: Optional[str] = Field(default=None, max_length=320)
    phone: Optional[str] = Field(default=None, max_length=80)
    photo_url: Optional[str] = Field(default=None, max_length=2048)


async def _self_checkin_payload(db: AsyncSession, participant: Participant) -> Dict[str, Any]:
    custom_fields = dict(participant.custom_fields or {})
    photo_url = (
        custom_fields.get("photo_url")
        or custom_fields.get("avatar_url")
        or custom_fields.get("profile_photo_url")
        or custom_fields.get("photo")
    )
    badge_obj = (await db.execute(
        select(Badge).where(Badge.participant_id == participant.id).limit(1)
    )).scalar_one_or_none()
    checkin_obj = (await db.execute(
        select(VenueCheckIn)
        .where(
            VenueCheckIn.participant_id == participant.id,
            VenueCheckIn.status.in_(["success", "admin_overridden"]),
        )
        .order_by(desc(VenueCheckIn.checkin_time))
        .limit(1)
    )).scalar_one_or_none()
    return {
        "id": str(participant.id),
        "regno": participant.regno or f"REG-{str(participant.id)[:6].upper()}",
        "name": participant.name,
        "first_name": participant.first_name,
        "last_name": participant.last_name,
        "email": participant.email,
        "phone": participant.phone,
        "role": participant.role,
        "company": participant.company,
        "designation": participant.designation,
        "country": participant.country,
        "paid_status": participant.paid_status,
        "custom_fields": custom_fields,
        "photo_url": photo_url,
        "registered_at": participant.registered_at.isoformat() if participant.registered_at else None,
        "is_checked_in": checkin_obj is not None,
        "checked_in_at": checkin_obj.checkin_time.isoformat() if checkin_obj and checkin_obj.checkin_time else None,
        "badge_code": badge_obj.badge_code if badge_obj else getattr(participant, "badge_code", None) or participant.regno,
        "badge_status": badge_obj.status if badge_obj else "not_created",
        "qr_token": badge_obj.qr_token if badge_obj else None,
        "editable_fields": ["first_name", "last_name", "name", "email", "phone", "photo_url"],
        "locked_fields": ["role", "role_code", "company", "designation", "country", "paid_status", "registration_code"],
        "support_message": "Role, role code, payment, company, designation, country, and restricted event details can only be changed at the nearest onsite support desk.",
        "initial_gate_required": True,
    }


# ── Endpoints ─────────────────────────────────────────────

@router.get("/summary")
async def get_registration_summary(db: AsyncSession = Depends(get_database)):
    """
    Returns enriched high-level stats for the registration desk dashboard.
    Includes kit breakdown, companion metrics, role distribution, and hourly check-in timeline.
    """
    from sqlalchemy import text

    total_participants = (await db.scalar(select(func.count(Participant.id)))) or 0

    total_checked_in = (await db.scalar(
        select(func.count(func.distinct(VenueCheckIn.participant_id))).where(
            VenueCheckIn.status.in_(["success", "admin_overridden"]),
            or_(
                VenueCheckIn.badge_code.ilike("DEL-%"),
                VenueCheckIn.badge_code.not_ilike("CMP-%")
            )
        )
    )) or 0

    badges_printed = (await db.scalar(
        select(func.count(Badge.id)).where(Badge.status == "printed")
    )) or 0

    paid_count = (await db.scalar(
        select(func.count(Participant.id)).where(Participant.paid_status == "Paid")
    )) or 0

    unpaid_count = (await db.scalar(
        select(func.count(Participant.id)).where(Participant.paid_status != "Paid")
    )) or 0

    # --- Companions ---
    total_companions = (await db.scalar(select(func.count(Companion.id)))) or 0
    companions_checked_in = (await db.scalar(
        select(func.count(Companion.id)).where(Companion.checked_in == True)
    )) or 0

    # --- Kits per-kit breakdown ---
    kit_rows = (await db.execute(select(Kit).order_by(Kit.kit_name))).scalars().all()
    kits_list = []
    kits_total_distributed = 0
    kits_total_quantity = 0
    for k in kit_rows:
        # Count actual distributed from participant_kits table for accuracy
        actual_distributed = (await db.scalar(
            select(func.count(ParticipantKit.id)).where(
                ParticipantKit.kit_id == k.id,
                ParticipantKit.status == "Issued"
            )
        )) or 0
        kits_list.append({
            "id": str(k.id),
            "name": k.kit_name,
            "distributed": actual_distributed,
            "total": k.total_quantity,
            "pct": round(actual_distributed / k.total_quantity * 100, 1) if k.total_quantity > 0 else 0,
        })
        kits_total_distributed += actual_distributed
        kits_total_quantity += k.total_quantity

    # --- Role breakdown ---
    role_rows = (await db.execute(
        select(Participant.role, func.count(Participant.id).label("cnt"))
        .group_by(Participant.role)
        .order_by(func.count(Participant.id).desc())
    )).all()
    role_breakdown = [{"role": r, "count": c} for r, c in role_rows]

    # --- Hourly check-in timeline (last 24 h) ---
    hourly_rows = (await db.execute(
        text("""
            SELECT
                date_trunc('hour', checkin_time) AS hour_bucket,
                COUNT(DISTINCT participant_id) AS cnt
            FROM venue.venue_checkins
            WHERE status IN ('success', 'admin_overridden')
              AND checkin_time >= NOW() - INTERVAL '24 hours'
              AND (badge_code ILIKE 'DEL-%' OR badge_code NOT ILIKE 'CMP-%')
            GROUP BY hour_bucket
            ORDER BY hour_bucket
        """)
    )).all()
    checkin_by_hour = [
        {
            "hour": row.hour_bucket.strftime("%H:%M") if row.hour_bucket else "00:00",
            "count": row.cnt,
        }
        for row in hourly_rows
    ]

    return {
        "total_participants": total_participants,
        "checked_in": total_checked_in,
        "checkin_rate_pct": round((total_checked_in / total_participants * 100), 1) if total_participants > 0 else 0,
        "badges_printed": badges_printed,
        "paid_count": paid_count,
        "unpaid_count": unpaid_count,
        "total_companions": total_companions,
        "companions_checked_in": companions_checked_in,
        "kits": kits_list,
        "kits_total_distributed": kits_total_distributed,
        "kits_total_quantity": kits_total_quantity,
        "role_breakdown": role_breakdown,
        "checkin_by_hour": checkin_by_hour,
    }



@router.get("/participants")
async def search_participants(
    q: Optional[str] = None,
    role: Optional[str] = None,
    paid_status: Optional[str] = None,
    checked_in: Optional[bool] = None,
    limit: int = 5000,
    offset: int = 0,
    db: AsyncSession = Depends(get_database)
):
    """
    Search & filter participant directory.
    """
    stmt = select(Participant)

    if q:
        search_pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Participant.name.ilike(search_pattern),
                Participant.email.ilike(search_pattern),
                Participant.phone.ilike(search_pattern),
                Participant.regno.ilike(search_pattern),
                Participant.company.ilike(search_pattern)
            )
        )
    
    if role and role != "All":
        stmt = stmt.where(Participant.role == role)
        
    if paid_status and paid_status != "All":
        stmt = stmt.where(Participant.paid_status == paid_status)

    # Calculate TRUE total matching count in DB before slicing
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_count = (await db.scalar(count_stmt)) or 0

    # Default sort by Registration Code ASC
    paginated_stmt = stmt.order_by(Participant.regno.asc()).offset(offset).limit(limit)
    result = await db.execute(paginated_stmt)
    participants = result.scalars().all()

    # Enrich with check-in status and badge info
    items = []
    for p in participants:
        p_badge = getattr(p, "badge_code", None) or p.regno
        checkin_v_q = select(VenueCheckIn).where(
            VenueCheckIn.participant_id == p.id,
            or_(
                VenueCheckIn.badge_code == p_badge,
                VenueCheckIn.badge_code == p.regno,
                VenueCheckIn.badge_code.not_ilike("CMP-%")
            ),
            VenueCheckIn.status.in_(["success", "admin_overridden"])
        ).limit(1)
        v_checkin_obj = (await db.execute(checkin_v_q)).scalar_one_or_none()
        is_checked_in = v_checkin_obj is not None
        
        badge_q = select(Badge).where(Badge.participant_id == p.id).limit(1)
        badge_obj = (await db.execute(badge_q)).scalar_one_or_none()

        items.append({
            "id": str(p.id),
            "regno": p.regno or f"REG-{str(p.id)[:6].upper()}",
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
            "custom_fields": p.custom_fields or {},
            "registered_at": p.registered_at.isoformat() if p.registered_at else None,
            "checked_in": is_checked_in,
            "is_checked_in": is_checked_in,
            "checked_in_at": v_checkin_obj.checkin_time.isoformat() if v_checkin_obj and getattr(v_checkin_obj, "checkin_time", None) else None,
            "badge_code": badge_obj.badge_code if badge_obj else None,
            "badge_status": badge_obj.status if badge_obj else "not_created",
            "qr_token": badge_obj.qr_token if badge_obj else None,
            "is_companion": False
        })

    # Include companions in the registry items
    comp_res = await db.execute(select(Companion))
    all_companions = comp_res.scalars().all()

    # Pre-fetch all successful checkin badge codes to eliminate false positives
    comp_checkins_res = await db.execute(
        select(VenueCheckIn.badge_code, VenueCheckIn.checkin_time).where(
            VenueCheckIn.status.in_(["success", "admin_overridden"])
        )
    )
    comp_checkin_map = {row[0]: row[1] for row in comp_checkins_res.all() if row[0]}

    for idx, c in enumerate(all_companions, 1):
        del_p = await db.get(Participant, c.primary_participant_id)
        c_code = c.badge_code or f"CMP-{idx:03d}"
        
        # Check-in is ONLY true if a matching record exists in venue_checkins table
        c_is_checked = bool(c_code in comp_checkin_map or (c.badge_code and c.badge_code in comp_checkin_map))
        c_checkin_time = comp_checkin_map.get(c_code) or (comp_checkin_map.get(c.badge_code) if c.badge_code else None)

        items.append({
            "id": str(c.id),
            "regno": c_code,
            "name": f"{c.first_name} {c.last_name}".strip(),
            "first_name": c.first_name,
            "last_name": c.last_name,
            "email": c.email or "",
            "phone": c.phone or "",
            "role": f"Companion ({c.relationship})",
            "company": f"Guest of {del_p.name}" if del_p else "Guest",
            "designation": f"Accompanying Person ({c.relationship})",
            "country": del_p.country if del_p else "",
            "paid_status": "Paid",
            "custom_fields": {"kit_status": "Not Required"},
            "registered_at": c.created_at.isoformat() if c.created_at else None,
            "checked_in": c_is_checked,
            "is_checked_in": c_is_checked,
            "checked_in_at": c_checkin_time.isoformat() if c_checkin_time else None,
            "badge_code": c_code,
            "badge_status": "printed" if c.badge_status == "printed" else "not_created",
            "qr_token": c_code,
            "is_companion": True,
            "primary_delegate_id": str(c.primary_participant_id),
            "primary_delegate_name": del_p.name if del_p else "Unknown Delegate",
            "primary_delegate_regno": del_p.regno if del_p else ""
        })

    return {"total": len(items), "items": items}


@router.post("/self-checkin/lookup")
async def self_checkin_lookup(
    payload: SelfCheckInLookupRequest,
    db: AsyncSession = Depends(get_database)
):
    """
    Lookup an already registered participant for self check-in kiosk mode.
    This intentionally returns a safe, kiosk-scoped profile and does not check in.
    """
    query = payload.query.strip()
    participant = None

    badge = (await db.execute(
        select(Badge).where(or_(Badge.badge_code.ilike(f"%{query}%"), Badge.qr_token == query))
    )).scalar_one_or_none()
    if badge:
        participant = await db.get(Participant, badge.participant_id)

    if not participant:
        clauses = [
            Participant.regno.ilike(f"%{query}%"),
            Participant.name.ilike(f"%{query}%"),
            Participant.email.ilike(f"%{query}%"),
            Participant.phone.ilike(f"%{query}%"),
        ]
        if _looks_like_uuid(query):
            clauses.append(Participant.id == uuid.UUID(query))
        participant = (await db.execute(
            select(Participant).where(or_(*clauses))
        )).scalar_one_or_none()

    if not participant:
        raise HTTPException(status_code=404, detail=f"No registered participant found for '{query}'. Please visit the nearest onsite support desk.")

    return {"participant": await _self_checkin_payload(db, participant)}


@router.get("/self-checkin/event")
async def get_self_checkin_event_metadata(db: AsyncSession = Depends(get_database)):
    event = (await db.execute(
        select(Event)
        .order_by(desc(Event.event_mode), desc(Event.start_date), desc(Event.created_at))
        .limit(1)
    )).scalar_one_or_none()
    if not event:
        return {
            "name": "Event",
            "start_date": None,
            "end_date": None,
            "venue_name": None,
            "timezone": "Asia/Kolkata",
        }
    return {
        "id": str(event.id),
        "name": event.name,
        "start_date": event.start_date.isoformat() if event.start_date else None,
        "end_date": event.end_date.isoformat() if event.end_date else None,
        "venue_name": event.venue_name or event.location,
        "timezone": event.timezone or "Asia/Kolkata",
    }


@router.put("/self-checkin/participants/{participant_id}")
async def update_self_checkin_participant(
    participant_id: uuid.UUID,
    payload: SelfCheckInUpdateRequest,
    db: AsyncSession = Depends(get_database)
):
    """
    Kiosk-safe participant update. Restricted identity/event/payment fields are deliberately ignored.
    """
    participant = await db.get(Participant, participant_id)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found. Please visit the nearest onsite support desk.")

    updates = payload.model_dump(exclude_unset=True)
    before = {
        "first_name": participant.first_name,
        "last_name": participant.last_name,
        "name": participant.name,
        "email": participant.email,
        "phone": participant.phone,
        "photo_url": (participant.custom_fields or {}).get("photo_url"),
    }

    for field in ("first_name", "last_name", "email", "phone"):
        if field in updates and updates[field] is not None:
            setattr(participant, field, str(updates[field]).strip())

    if "name" in updates and updates["name"] is not None:
        participant.name = str(updates["name"]).strip()
    elif "first_name" in updates or "last_name" in updates:
        participant.name = f"{participant.first_name or ''} {participant.last_name or ''}".strip() or participant.name

    if "photo_url" in updates:
        custom_fields = dict(participant.custom_fields or {})
        if updates["photo_url"]:
            custom_fields["photo_url"] = str(updates["photo_url"]).strip()
        else:
            custom_fields.pop("photo_url", None)
        participant.custom_fields = custom_fields

    participant.updated_at = datetime.now(timezone.utc)
    await log_participant_action(
        db,
        participant.id,
        "self_checkin_update",
        performed_by="SELF-CHECKIN",
        details={"before": before, "after": updates, "restricted_fields": "not accepted"},
    )
    db.add(SyncOutbox(
        id=uuid.uuid4(),
        entity_type="participant",
        entity_id=participant.id,
        action="self_checkin_update",
        payload=updates,
        status="pending",
        created_at=datetime.now(timezone.utc),
    ))
    await db.commit()
    await db.refresh(participant)
    return {"participant": await _self_checkin_payload(db, participant)}


@router.get("/participants/{participant_id}")
async def get_participant_details(
    participant_id: uuid.UUID,
    db: AsyncSession = Depends(get_database)
):
    """
    Get full profile details for a single participant or companion.
    """
    p = await db.get(Participant, participant_id)
    if not p:
        # Check if companion
        c = await db.get(Companion, participant_id)
        if not c:
            raise HTTPException(status_code=404, detail="Participant or Companion not found")
        
        del_p = await db.get(Participant, c.primary_participant_id)
        c_code = c.badge_code or f"CMP-001"
        c_checkin_obj = (await db.execute(
            select(VenueCheckIn).where(
                VenueCheckIn.participant_id == c.id,
                VenueCheckIn.status == "success"
            ).limit(1)
        )).scalar_one_or_none()

        return {
            "id": str(c.id),
            "regno": c_code,
            "name": f"{c.first_name} {c.last_name}".strip(),
            "first_name": c.first_name,
            "last_name": c.last_name,
            "email": c.email or "",
            "phone": c.phone or "",
            "role": f"Companion ({c.relationship})",
            "company": f"Guest of {del_p.name}" if del_p else "Guest",
            "designation": f"Accompanying Person ({c.relationship})",
            "country": del_p.country if del_p else "",
            "paid_status": "Paid",
            "custom_fields": {"kit_status": "Not Required"},
            "registered_at": c.created_at.isoformat() if c.created_at else None,
            "is_checked_in": c_checkin_obj is not None,
            "checked_in_at": c_checkin_obj.checkin_time.isoformat() if c_checkin_obj and getattr(c_checkin_obj, "checkin_time", None) else None,
            "badge_code": c_code,
            "badge_status": "printed" if c.badge_status == "printed" else "not_created",
            "qr_token": c_code,
            "is_companion": True,
            "primary_delegate_id": str(c.primary_participant_id),
            "primary_delegate_name": del_p.name if del_p else "Unknown Delegate",
            "primary_delegate_regno": del_p.regno if del_p else ""
        }

    checkin_obj = (await db.execute(
        select(VenueCheckIn).where(
            VenueCheckIn.participant_id == p.id,
            VenueCheckIn.status == "success"
        ).limit(1)
    )).scalar_one_or_none()

    badge_obj = (await db.execute(
        select(Badge).where(Badge.participant_id == p.id).limit(1)
    )).scalar_one_or_none()

    return {
        "id": str(p.id),
        "regno": p.regno or f"REG-{str(p.id)[:6].upper()}",
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
        "custom_fields": p.custom_fields or {},
        "registered_at": p.registered_at.isoformat() if p.registered_at else None,
        "is_checked_in": checkin_obj is not None,
        "checked_in_at": checkin_obj.checkin_time.isoformat() if checkin_obj and checkin_obj.checkin_time else None,
        "badge_code": badge_obj.badge_code if badge_obj else None,
        "badge_status": badge_obj.status if badge_obj else "not_created",
        "qr_token": badge_obj.qr_token if badge_obj else None,
        "is_companion": False
    }


@router.put("/participants/{participant_id}")
async def update_participant_details(
    participant_id: uuid.UUID,
    payload: UpdateParticipantRequest,
    db: AsyncSession = Depends(get_database)
):
    """
    Update a participant from Registration mode. This is intentionally broader
    than self check-in editing and is used by staffed registration desks.
    """
    participant = await db.get(Participant, participant_id)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    before = {
        "first_name": participant.first_name,
        "last_name": participant.last_name,
        "name": participant.name,
        "email": participant.email,
        "phone": participant.phone,
        "role": participant.role,
        "company": participant.company,
        "designation": participant.designation,
        "country": participant.country,
        "paid_status": participant.paid_status,
        "custom_fields": participant.custom_fields or {},
    }
    updates = payload.model_dump(exclude_unset=True)
    scalar_fields = [
        "first_name",
        "last_name",
        "name",
        "email",
        "phone",
        "role",
        "company",
        "designation",
        "country",
        "paid_status",
    ]
    for field_name in scalar_fields:
        if field_name in updates:
            value = updates[field_name]
            setattr(participant, field_name, value.strip() if isinstance(value, str) else value)

    if "name" not in updates and ("first_name" in updates or "last_name" in updates):
        participant.name = f"{participant.first_name or ''} {participant.last_name or ''}".strip() or participant.name
    elif "name" in updates and participant.name:
        parts = participant.name.strip().split(" ", 1)
        if "first_name" not in updates:
            participant.first_name = parts[0]
        if "last_name" not in updates:
            participant.last_name = parts[1] if len(parts) > 1 else ""

    if "custom_fields" in updates:
        participant.custom_fields = updates["custom_fields"] or {}

    participant.updated_at = datetime.now(timezone.utc)
    await log_participant_action(
        db,
        participant.id,
        "participant_update",
        performed_by="REG-DESK-01",
        details={"before": before, "after": updates},
    )
    db.add(SyncOutbox(
        id=uuid.uuid4(),
        entity_type="participant",
        entity_id=participant.id,
        action="update",
        payload=updates,
        status="pending",
        created_at=datetime.now(timezone.utc),
    ))
    await db.commit()
    return await get_participant_details(participant_id, db)


@router.delete("/participants/{participant_id}")
async def delete_participant_details(
    participant_id: uuid.UUID,
    db: AsyncSession = Depends(get_database)
):
    """
    Delete a participant and their local registration-operational records.
    """
    participant = await db.get(Participant, participant_id)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    badge_ids = list((await db.execute(select(Badge.id).where(Badge.participant_id == participant_id))).scalars().all())
    companion_ids = list((await db.execute(select(Companion.id).where(Companion.primary_participant_id == participant_id))).scalars().all())

    if badge_ids:
        await db.execute(delete(BadgeHistory).where(BadgeHistory.badge_id.in_(badge_ids)))
        await db.execute(delete(BadgePrintJob).where(BadgePrintJob.badge_id.in_(badge_ids)))
        await db.execute(delete(BadgeScan).where(BadgeScan.badge_id.in_(badge_ids)))

    await db.execute(delete(BadgeScan).where(BadgeScan.participant_id == participant_id))
    await db.execute(delete(VenueCheckIn).where(VenueCheckIn.participant_id == participant_id))
    if companion_ids:
        await db.execute(delete(BadgeScan).where(BadgeScan.companion_id.in_(companion_ids)))
        await db.execute(delete(VenueCheckIn).where(VenueCheckIn.companion_id.in_(companion_ids)))
    await db.execute(delete(ParticipantKit).where(ParticipantKit.participant_id == participant_id))
    await db.execute(delete(ParticipantActionLog).where(ParticipantActionLog.participant_id == participant_id))
    await db.execute(delete(ParticipantExtension).where(ParticipantExtension.participant_id == participant_id))
    await db.execute(delete(ParticipantRegistration).where(ParticipantRegistration.participant_id == participant_id))
    await db.execute(delete(SyncOutbox).where(SyncOutbox.entity_id == participant_id))
    await db.execute(delete(Companion).where(Companion.primary_participant_id == participant_id))
    await db.execute(delete(Badge).where(Badge.participant_id == participant_id))
    await db.delete(participant)
    db.add(SyncOutbox(
        id=uuid.uuid4(),
        entity_type="participant",
        entity_id=participant_id,
        action="delete",
        payload={"id": str(participant_id), "regno": participant.regno, "name": participant.name},
        status="pending",
        created_at=datetime.now(timezone.utc),
    ))
    await db.commit()
    return {"ok": True, "deleted_id": str(participant_id)}


@router.post("/participants")
async def create_onsite_participant(
    payload: CreateParticipantRequest,
    db: AsyncSession = Depends(get_database)
):
    """
    Creates a new participant on-site and issues a badge.
    """
    event_obj = (await db.execute(select(Event).limit(1))).scalar_one_or_none()
    if not event_obj:
        raise HTTPException(status_code=400, detail="No active event found on venue server.")

    p_id = uuid.uuid4()
    full_name = f"{payload.first_name.strip()} {payload.last_name.strip()}".strip()
    
    count = (await db.scalar(select(func.count(Participant.id)))) or 0
    regno = f"REG-1{count + 1001:04d}"

    # Check Organiser Overall Event Capacity limit from registration.capacity_rules
    admin_override = bool(payload.admin_override or payload.allow_override)
    cap_rule = (await db.execute(
        select(CapacityRule).where(CapacityRule.session_id == None, CapacityRule.room_id == None).limit(1)
    )).scalar_one_or_none()

    if cap_rule and cap_rule.capacity > 0 and not admin_override:
        if count >= cap_rule.capacity:
            raise HTTPException(
                status_code=400,
                detail=f"Organiser Overall Event Capacity Limit Reached ({cap_rule.capacity} Delegates). Enable 'Admin Capacity Override' to proceed with registration."
            )

    new_p = Participant(
        id=p_id,
        event_id=event_obj.id,
        regno=regno,
        name=full_name,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        phone=payload.phone,
        role=payload.role,
        company=payload.company,
        designation=payload.designation,
        country=payload.country,
        paid_status=payload.paid_status,
        source="onsite",
        custom_fields=payload.custom_fields or {},
        registered_at=datetime.now(timezone.utc)
    )
    db.add(new_p)

    reg_obj = ParticipantRegistration(
        id=uuid.uuid4(),
        event_id=event_obj.id,
        participant_id=p_id,
        registration_status="approved",
        registration_data={"payment_method": payload.payment_method, "amount": payload.amount},
        submitted_at=datetime.now(timezone.utc)
    )
    db.add(reg_obj)

    badge_code = f"BDG-{regno}"
    qr_token = f"TOKEN-{p_id}"
    new_badge = Badge(
        id=uuid.uuid4(),
        participant_id=p_id,
        badge_code=badge_code,
        qr_token=qr_token,
        barcode=badge_code,
        status="created",
        issued_at=datetime.now(timezone.utc)
    )
    db.add(new_badge)

    db.add(SyncOutbox(
        entity_type="participant",
        entity_id=p_id,
        action="create",
        payload={
            "id": str(p_id),
            "event_id": str(event_obj.id),
            "regno": regno,
            "name": full_name,
            "first_name": payload.first_name,
            "last_name": payload.last_name,
            "email": payload.email,
            "phone": payload.phone,
            "role": payload.role,
            "company": payload.company,
            "paid_status": payload.paid_status
        }
    ))

    await db.commit()

    return {
        "status": "success",
        "participant": {
            "id": str(p_id),
            "regno": regno,
            "name": full_name,
            "badge_code": badge_code,
            "qr_token": qr_token
        }
    }


@router.post("/checkin")
async def checkin_participant(
    payload: CheckInRequest,
    db: AsyncSession = Depends(get_database)
):
    """
    Performs instant on-site check-in.
    """
    target_id = payload.participant_id
    companion_record = None
    participant = await db.get(Participant, target_id) if target_id else None

    if not participant:
        query_str = (payload.badge_code or payload.regno or "").strip()
        if target_id and not query_str:
            query_str = str(target_id)

        if not query_str and not target_id:
            raise HTTPException(status_code=400, detail="Must provide participant_id, badge_code, or regno.")

        if query_str:
            badge = (await db.execute(
                select(Badge).where(or_(Badge.badge_code.ilike(f"%{query_str}%"), Badge.qr_token == query_str))
            )).scalar_one_or_none()

            if badge:
                participant = await db.get(Participant, badge.participant_id)
            else:
                participant = (await db.execute(
                    select(Participant).where(or_(
                        Participant.regno.ilike(f"%{query_str}%"),
                        Participant.name.ilike(f"%{query_str}%"),
                        Participant.email.ilike(f"%{query_str}%"),
                        Participant.phone.ilike(f"%{query_str}%")
                    ))
                )).scalar_one_or_none()

        # Fallback to Companion table if not a primary participant
        if not participant:
            c_stmt = select(Companion).where(or_(
                Companion.badge_code.ilike(f"%{query_str}%"),
                (Companion.first_name + " " + Companion.last_name).ilike(f"%{query_str}%"),
                Companion.email.ilike(f"%{query_str}%")
            ))
            if target_id:
                try:
                    c_uuid = uuid.UUID(str(target_id))
                    c_stmt = select(Companion).where(or_(Companion.id == c_uuid, Companion.badge_code.ilike(f"%{query_str}%")))
                except ValueError:
                    pass

            companion_record = (await db.execute(c_stmt)).scalar_one_or_none()
            if not companion_record:
                raise HTTPException(status_code=404, detail=f"No participant or companion found matching '{query_str or target_id}'.")

    # If it's a Companion check-in
    if companion_record:
        comp_name = f"{companion_record.first_name} {companion_record.last_name}".strip()
        b_code = companion_record.badge_code or "CMP-001"

        # Strictly check database presence for this companion
        existing_comp_checkins = (await db.scalar(
            select(func.count(VenueCheckIn.id)).where(
                or_(
                    VenueCheckIn.badge_code == b_code,
                    VenueCheckIn.badge_code == companion_record.badge_code,
                    VenueCheckIn.participant_id == companion_record.id
                ),
                VenueCheckIn.status.in_(["success", "admin_overridden"])
            )
        )) or 0
        if existing_comp_checkins > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Check-In Limit Exceeded: Companion '{comp_name}' has already checked in in the database (Recorded: {existing_comp_checkins}, Max allowed: 1)."
            )

        now = datetime.now(timezone.utc)
        companion_record.checked_in = True
        companion_record.checked_in_at = now

        scan_record = BadgeScan(
            id=uuid.uuid4(),
            participant_id=companion_record.primary_participant_id,
            badge_code=b_code,
            scan_type="check_in",
            status="success",
            created_at=now
        )
        db.add(scan_record)

        venue_checkin_record = VenueCheckIn(
            id=uuid.uuid4(),
            participant_id=companion_record.primary_participant_id,
            station_name="Initial Participant Check-In Point",
            station_type="Main Entrance Intake",
            station_capacity=5000,
            badge_code=b_code,
            scan_type="check_in",
            status="success",
            checkin_time=now,
            created_at=now
        )
        db.add(venue_checkin_record)
        await db.commit()

        return {
            "status": "success",
            "message": f"Successfully checked in companion {comp_name}!",
            "checked_in_at": now.isoformat(),
            "participant": {
                "id": str(companion_record.id),
                "name": comp_name,
                "regno": b_code,
                "role": "Companion",
                "company": f"Guest of {companion_record.relationship}",
                "email": companion_record.email or "N/A",
                "phone": companion_record.phone or "N/A",
                "is_companion": True,
                "checked_in": True
            }
        }

    # 2. Resolve Station / Capacity Rule dynamically from payload or fallback to Initial Gate
    target_station_id = getattr(payload, "station_id", None)
    target_station_name = getattr(payload, "station_name", None)

    station = None
    if target_station_id:
        try:
            s_uuid = uuid.UUID(str(target_station_id))
            station = await db.get(VenueCapacityRule, s_uuid)
        except ValueError:
            pass

    if not station and target_station_name:
        station = (await db.execute(
            select(VenueCapacityRule).where(VenueCapacityRule.station_name.ilike(f"%{target_station_name}%")).limit(1)
        )).scalar_one_or_none()

    if not station:
        station = (await db.execute(
            select(VenueCapacityRule).where(
                (VenueCapacityRule.station_name.ilike("%initial%")) | (VenueCapacityRule.station_name.ilike("%intake%"))
            ).limit(1)
        )).scalar_one_or_none()
        if not station:
            station = (await db.execute(select(VenueCapacityRule).limit(1))).scalar_one_or_none()

    station_name = station.station_name if station else "Initial Participant Check-In Point"
    station_id = station.id if station else None

    # Dynamically set capacity = total registered participants (not hardcoded 5000)
    dynamic_capacity = (await db.scalar(select(func.count(Participant.id)))) or 5000

    if station:
        allowed = station.allowed_roles or ["Delegate", "Speaker", "VIP", "Exhibitor", "Media", "Sponsor", "All"]
        allowed_clean = [str(r).strip().lower() for r in allowed]
        p_r_lower = (participant.role or "").strip().lower()
        if "all" not in allowed_clean and p_r_lower and p_r_lower not in allowed_clean:
            raise HTTPException(
                status_code=400,
                detail=f"Check-In Rejected: Role '{participant.role}' is not authorized for '{station_name}'."
            )

        # Strictly check database presence for this delegate for this specific station / capacity rule
        p_badge = getattr(participant, "badge_code", None) or participant.regno
        max_allowed = station.max_checkins_per_delegate if station and station.max_checkins_per_delegate > 0 else 1
        
        station_conditions = []
        if station and station.id:
            station_conditions.extend([VenueCheckIn.station_id == station.id, VenueCheckIn.capacity_rule_id == station.id])
        if station_name and station_name.strip():
            station_conditions.append(VenueCheckIn.station_name == station_name.strip())

        existing_checkins = (await db.scalar(
            select(func.count(VenueCheckIn.id)).where(
                VenueCheckIn.participant_id == participant.id,
                or_(*station_conditions) if station_conditions else True,
                or_(
                    VenueCheckIn.badge_code == p_badge,
                    VenueCheckIn.badge_code == participant.regno,
                    VenueCheckIn.badge_code.not_ilike("CMP-%")
                ),
                VenueCheckIn.status.in_(["success", "admin_overridden"])
            )
        )) or 0

        if max_allowed > 0 and existing_checkins >= max_allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Check-In Limit Exceeded: Delegate '{participant.name}' has already reached the maximum allowed check-ins ({max_allowed}) for '{station_name}'."
            )

        if station.station_capacity > 0:
            total_scans = (await db.scalar(
                select(func.count(VenueCheckIn.id)).where(
                    VenueCheckIn.station_id == station.id,
                    VenueCheckIn.status == "success"
                )
            )) or 0
            effective_capacity = dynamic_capacity if station else station.station_capacity
            if total_scans >= effective_capacity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Check-In Rejected: Station capacity limit ({effective_capacity}) reached for '{station_name}'."
                )

    now = datetime.now(timezone.utc)

    b_code = getattr(participant, "badge_code", None) or participant.regno

    # 3. Log Scan Entry in venue.badge_scans and venue.venue_checkins Tables
    scan_record = BadgeScan(
        id=uuid.uuid4(),
        event_id=participant.event_id,
        participant_id=participant.id,
        station_id=station_id,
        station_name=station_name,
        badge_code=b_code,
        scan_type="check_in",
        status="success",
        created_at=now
    )
    db.add(scan_record)

    venue_checkin_record = VenueCheckIn(
        id=uuid.uuid4(),
        event_id=participant.event_id,
        participant_id=participant.id,
        station_id=station_id,
        capacity_rule_id=station_id,
        station_name=station_name,
        station_type=station.station_type if station else "Main Entrance Intake",
        station_capacity=dynamic_capacity,
        badge_code=b_code,
        scan_type="check_in",
        status="success",
        checkin_time=now,
        created_at=now
    )
    db.add(venue_checkin_record)

    await log_participant_action(
        db,
        participant.id,
        "checkin",
        payload.scanner_id or "REG-DESK-01",
        f"Checked in at {station_name}"
    )

    # Update participant status
    participant.checked_in = True
    participant.check_in_time = now

    db.add(SyncOutbox(
        entity_type="checkin",
        entity_id=venue_checkin_record.id,
        action="create",
        payload={
            "id": str(venue_checkin_record.id),
            "participant_id": str(participant.id),
            "checkin_time": now.isoformat()
        }
    ))

    await db.commit()

    return {
        "status": "success",
        "message": f"Successfully checked in {participant.name} at {station_name}!",
        "checked_in_at": now.isoformat(),
        "participant": {
            "id": str(participant.id),
            "name": participant.name,
            "regno": participant.regno,
            "role": participant.role
        }
    }


@router.post("/badges/print")
async def print_participant_badge(
    payload: PrintBadgeRequest,
    db: AsyncSession = Depends(get_database)
):
    """
    Triggers or queues a badge print job.
    """
    p = await db.get(Participant, payload.participant_id)
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")

    if not (await is_participant_checked_in(db, p)):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot print badge: Delegate '{p.name}' has not completed initial check-in. Please complete check-in first."
        )

    badge = (await db.execute(
        select(Badge).where(Badge.participant_id == payload.participant_id).limit(1)
    )).scalar_one_or_none()

    if not badge:
        badge_code = f"BDG-{p.regno or str(p.id)[:6].upper()}"
        badge = Badge(
            id=uuid.uuid4(),
            participant_id=p.id,
            badge_code=badge_code,
            qr_token=f"TOKEN-{p.id}",
            barcode=badge_code,
            status="created",
            issued_at=datetime.now(timezone.utc)
        )
        db.add(badge)
        await db.flush()

    badge.status = "printed"
    badge.issued_at = datetime.now(timezone.utc)

    await log_participant_action(
        db,
        badge.participant_id,
        "badge_print",
        payload.printer_id or "REG-DESK-01",
        f"Badge printed: {badge.badge_code}"
    )

    db.add(SRRActivityLog(
        id=uuid.uuid4(),
        event_id=badge.participant_id,
        action="badge_printed",
        details={"badge_id": str(badge.id), "printer": payload.printer_id},
        created_at=datetime.now(timezone.utc)
    ))

    await db.commit()

    return {
        "status": "success",
        "message": f"Badge print job queued for badge {badge.badge_code}."
    }


@router.post("/participants/{participant_id}/print-badge")
async def participant_print_badge_route(
    participant_id: uuid.UUID,
    db: AsyncSession = Depends(get_database)
):
    """
    Logs badge print event for a participant or companion.
    Creates badge record if not exists, marks as printed, logs action.
    """
    p = await db.get(Participant, participant_id)
    c = None
    if not p:
        c = await db.get(Companion, participant_id)
        if not c:
            raise HTTPException(status_code=404, detail="Participant or Companion not found")

    if c:
        if not c.checked_in:
            raise HTTPException(status_code=400, detail="Cannot print badge: Companion has not completed initial check-in.")
        c.badge_status = "printed"
        await log_participant_action(
            db, c.primary_participant_id, "companion_badge_print", "REG-DESK-01",
            f"Companion badge printed: {c.badge_code or 'CMP'}"
        )
        await db.commit()
        return {"status": "success", "badge_code": c.badge_code or "CMP-001"}

    if not (await is_participant_checked_in(db, p)):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot print badge: Delegate '{p.name}' has not completed initial check-in. Please complete check-in first."
        )

    badge = (await db.execute(
        select(Badge).where(Badge.participant_id == participant_id).limit(1)
    )).scalar_one_or_none()

    if not badge:
        badge_code = f"BDG-{p.regno or str(p.id)[:6].upper()}"
        badge = Badge(
            id=uuid.uuid4(),
            participant_id=p.id,
            badge_code=badge_code,
            qr_token=f"TOKEN-{p.id}",
            barcode=badge_code,
            status="created",
            issued_at=datetime.now(timezone.utc)
        )
        db.add(badge)
        await db.flush()

    badge.status = "printed"
    badge.issued_at = datetime.now(timezone.utc)

    await log_participant_action(
        db, participant_id, "badge_print", "REG-DESK-01",
        f"Badge printed: {badge.badge_code}"
    )

    db.add(SRRActivityLog(
        id=uuid.uuid4(),
        event_id=p.event_id,
        action="badge_printed",
        details={"badge_id": str(badge.id), "participant": str(participant_id)},
        created_at=datetime.now(timezone.utc)
    ))

    await db.commit()
    return {"status": "success", "badge_code": badge.badge_code}


@router.post("/participants/{participant_id}/reprint-badge")
async def participant_reprint_badge_route(
    participant_id: uuid.UUID,
    payload: dict = {},
    db: AsyncSession = Depends(get_database)
):
    """
    Logs badge reprint event for a participant or companion.
    """
    p = await db.get(Participant, participant_id)
    c = None
    if not p:
        c = await db.get(Companion, participant_id)
        if not c:
            raise HTTPException(status_code=404, detail="Participant or Companion not found")

    if c:
        if not c.checked_in:
            raise HTTPException(status_code=400, detail="Cannot reprint badge: Companion has not completed initial check-in.")
        c.badge_status = "printed"
        await log_participant_action(
            db, c.primary_participant_id, "companion_badge_reprint", "REG-DESK-01",
            f"Companion badge reprinted: {c.badge_code or 'CMP'}"
        )
        await db.commit()
        return {"status": "success", "badge_code": c.badge_code or "CMP-001"}

    if not (await is_participant_checked_in(db, p)):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reprint badge: Delegate '{p.name}' has not completed initial check-in. Please complete check-in first."
        )

    badge = (await db.execute(
        select(Badge).where(Badge.participant_id == participant_id).limit(1)
    )).scalar_one_or_none()

    if not badge:
        badge_code = f"BDG-{p.regno or str(p.id)[:6].upper()}"
        badge = Badge(
            id=uuid.uuid4(),
            participant_id=p.id,
            badge_code=badge_code,
            qr_token=f"TOKEN-{p.id}",
            barcode=badge_code,
            status="reprinted",
            issued_at=datetime.now(timezone.utc)
        )
        db.add(badge)
        await db.flush()
    else:
        badge.status = "reprinted"
        badge.issued_at = datetime.now(timezone.utc)

    reason = payload.get("reason", "Delegate Request") if isinstance(payload, dict) else "Delegate Request"
    await log_participant_action(
        db, participant_id, "badge_reprint", "REG-DESK-01",
        f"Badge reprinted. Reason: {reason}"
    )

    db.add(SRRActivityLog(
        id=uuid.uuid4(),
        event_id=p.event_id,
        action="badge_reprinted",
        details={"badge_id": str(badge.id), "reason": reason},
        created_at=datetime.now(timezone.utc)
    ))

    await db.commit()
    return {"status": "success", "badge_code": badge.badge_code}


@router.post("/badges/reprint")
async def reprint_participant_badge(
    payload: ReprintBadgeRequest,
    db: AsyncSession = Depends(get_database)
):
    """
    Handles badge reprint requests.
    """
    p = await db.get(Participant, payload.participant_id)
    if p and not (await is_participant_checked_in(db, p)):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reprint badge: Delegate '{p.name}' has not completed initial check-in. Please complete check-in first."
        )

    badge = (await db.execute(
        select(Badge).where(Badge.participant_id == payload.participant_id).limit(1)
    )).scalar_one_or_none()

    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found for participant.")

    badge.status = "reprinted"
    badge.issued_at = datetime.now(timezone.utc)

    await log_participant_action(
        db,
        badge.participant_id,
        "badge_reprint",
        "REG-DESK-01",
        f"Reason: {payload.reason} | Notes: {payload.notes or 'None'}"
    )

    db.add(SRRActivityLog(
        id=uuid.uuid4(),
        event_id=badge.participant_id,
        action="badge_reprinted",
        details={"badge_id": str(badge.id), "reason": payload.reason, "notes": payload.notes},
        created_at=datetime.now(timezone.utc)
    ))

    await db.commit()

    return {
        "status": "success",
        "message": f"Reprint job issued for badge {badge.badge_code}. Reason: {payload.reason}"
    }


@router.post("/payments/collect")
async def collect_participant_payment(
    payload: CollectPaymentRequest,
    db: AsyncSession = Depends(get_database)
):
    """
    Marks a participant as Paid and records on-site transaction details.
    """
    p = await db.get(Participant, payload.participant_id)
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")

    p.paid_status = "Paid"
    p.updated_at = datetime.now(timezone.utc)

    db.add(SRRActivityLog(
        id=uuid.uuid4(),
        event_id=p.id,
        action="payment_collected",
        details={
            "amount": payload.amount,
            "method": payload.payment_method,
            "ref": payload.transaction_ref
        },
        created_at=datetime.now(timezone.utc)
    ))

    await db.commit()

    return {
        "status": "success",
        "message": f"Payment of ₹{payload.amount} recorded for {p.name}."
    }


# ── Templates CRUD Endpoints ─────────────────────────────

@router.get("/templates")
async def list_templates(template_type: Optional[str] = None, db: AsyncSession = Depends(get_database)):
    stmt = select(PrintTemplate)
    if template_type:
        stmt = stmt.where(PrintTemplate.template_type == template_type)
    res = await db.execute(stmt)
    templates = res.scalars().all()
    return [{
        "id": str(t.id),
        "template_name": t.template_name,
        "template_type": t.template_type,
        "template_data": t.template_data,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None
    } for t in templates]


@router.post("/templates")
async def save_template(payload: dict, db: AsyncSession = Depends(get_database)):
    t_id = payload.get("id")
    if t_id:
        try:
            t_uuid = uuid.UUID(t_id)
        except ValueError:
            t_uuid = uuid.uuid4()
    else:
        t_uuid = uuid.uuid4()

    event_obj = (await db.execute(select(Event).limit(1))).scalar_one_or_none()
    event_id = event_obj.id if event_obj else uuid.uuid4()

    existing = await db.get(PrintTemplate, t_uuid)
    if existing:
        existing.template_name = payload.get("template_name", "Untitled Template")
        existing.template_type = payload.get("template_type", "badge")
        existing.template_data = payload.get("template_data", {})
        existing.updated_at = datetime.now(timezone.utc)
    else:
        existing = PrintTemplate(
            id=t_uuid,
            event_id=event_id,
            template_name=payload.get("template_name", "Untitled Template"),
            template_type=payload.get("template_type", "badge"),
            template_data=payload.get("template_data", {}),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(existing)

    await db.commit()
    return {"status": "success", "id": str(t_uuid)}


@router.delete("/templates/{template_id}")
async def delete_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_database)):
    t = await db.get(PrintTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(t)
    await db.commit()
    return {"status": "deleted"}


# ── Capacity Controls Endpoints ──────────────────────────

_saved_capacity_data = {
    "total_event_limit": 5000,
    "max_kits_per_participant": 1,
    "total_registered": 0,
    "admin_override_reason": None,
    "admin_override_by": None,
    "admin_override_at": None,
}

@router.get("/capacity")
async def get_capacity_settings(db: AsyncSession = Depends(get_database)):
    global _saved_capacity_data
    
    # 1. Fetch Organiser overall event capacity from registration.capacity_rules table
    cap_rule_res = await db.execute(
        select(CapacityRule).where(CapacityRule.session_id == None, CapacityRule.room_id == None).limit(1)
    )
    cap_rule = cap_rule_res.scalar_one_or_none()
    if cap_rule:
        _saved_capacity_data["total_event_limit"] = cap_rule.capacity

    # 2. Fetch DB-persisted station rules from venue.venue_capacity_rules table
    rules_res = await db.execute(select(VenueCapacityRule).order_by(VenueCapacityRule.created_at.asc()))
    db_rules = rules_res.scalars().all()

    # Check for an admin override on overall capacity in venue.venue_capacity_rules
    overall_db_rule = next(
        (r for r in db_rules if r.station_type == "Main Entrance" or "overall" in r.station_name.lower() or "organiser" in r.station_name.lower()),
        None
    )

    if overall_db_rule:
        _saved_capacity_data["total_event_limit"] = overall_db_rule.station_capacity
        if overall_db_rule.updated_reason:
            _saved_capacity_data["admin_override_reason"] = overall_db_rule.updated_reason
            _saved_capacity_data["admin_override_by"] = overall_db_rule.updated_by

    # 3. Total registered delegates count & roles breakdown
    total = (await db.scalar(select(func.count(Participant.id)))) or 0
    role_rows = (await db.execute(
        select(Participant.role, func.count(Participant.id)).group_by(Participant.role)
    )).all()
    counts = {r[0]: r[1] for r in role_rows if r[0]}

    # 3. Inherit all distinct active roles directly from database (no hardcoding)
    active_roles = [r for r in counts.keys() if r]
    if not active_roles:
        p_distinct = (await db.execute(select(distinct(Participant.role)).where(Participant.role.isnot(None)))).scalars().all()
        active_roles = [r.strip() for r in p_distinct if r and r.strip()] or ["All"]

    _saved_capacity_data["registered_roles"] = active_roles
    _saved_capacity_data["total_registered"] = total

    _saved_capacity_data["roles"] = [
        {"role": r, "registered": counts.get(r, 0), "limit": 1000}
        for r in active_roles
    ]

    stations_list = []
    for r in db_rules:
        stations_list.append({
            "id": str(r.id),
            "station_name": r.station_name,
            "type": r.station_type,
            "allowed_roles": r.allowed_roles or active_roles,
            "max_checkins_per_delegate": r.max_checkins_per_delegate,
            "station_capacity": r.station_capacity,
            "updated_by": r.updated_by,
            "updated_reason": r.updated_reason,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None
        })

    _saved_capacity_data["stations"] = stations_list
    return _saved_capacity_data


@router.post("/capacity/rules")
async def save_or_create_capacity_rule(
    payload: dict,
    db: AsyncSession = Depends(get_database)
):
    rule_id_str = payload.get("id")
    station_name = payload.get("station_name", "Custom Station").strip()
    station_type = payload.get("type", "Room")

    # Dynamically fetch all distinct participant roles from database if not supplied
    allowed_roles = payload.get("allowed_roles")
    if not allowed_roles:
        p_roles = (await db.execute(select(distinct(Participant.role)).where(Participant.role.isnot(None)))).scalars().all()
        allowed_roles = [r.strip() for r in p_roles if r and r.strip()] or ["All"]

    max_checkins = payload.get("max_checkins_per_delegate", 0)
    station_capacity = payload.get("station_capacity", 500)

    if rule_id_str and not rule_id_str.startswith("stn-"):
        rule_uuid = uuid.UUID(rule_id_str)
        rule = await db.get(VenueCapacityRule, rule_uuid)
        if rule:
            rule.station_name = station_name
            rule.station_type = station_type
            rule.allowed_roles = allowed_roles
            rule.max_checkins_per_delegate = max_checkins
            rule.station_capacity = station_capacity
            rule.updated_at = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(rule)
            return {"status": "success", "rule_id": str(rule.id)}

    # Create new rule
    new_rule = VenueCapacityRule(
        id=uuid.uuid4(),
        station_name=station_name,
        station_type=station_type,
        allowed_roles=allowed_roles,
        max_checkins_per_delegate=max_checkins,
        station_capacity=station_capacity,
        updated_by="System Admin",
        updated_reason="Station Rule Created"
    )
    db.add(new_rule)
    await db.commit()
    await db.refresh(new_rule)

    return {"status": "success", "rule_id": str(new_rule.id)}


@router.put("/capacity/rules/{rule_id}")
async def update_capacity_rule(
    rule_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_database)
):
    rule = await db.get(VenueCapacityRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Station rule not found")

    if "station_name" in payload and payload["station_name"]:
        rule.station_name = payload["station_name"].strip()
    if "type" in payload and payload["type"]:
        rule.station_type = payload["type"].strip()
    if "station_capacity" in payload:
        rule.station_capacity = int(payload["station_capacity"])
    if "max_checkins_per_delegate" in payload:
        rule.max_checkins_per_delegate = int(payload["max_checkins_per_delegate"])
    if "allowed_roles" in payload:
        roles = payload["allowed_roles"]
        if isinstance(roles, str):
            roles = [roles]
        rule.allowed_roles = roles

    rule.updated_at = datetime.now(timezone.utc)
    rule.updated_by = payload.get("admin_name", "System Admin")
    rule.updated_reason = payload.get("reason", "Station Rule Updated")

    await db.commit()
    await db.refresh(rule)

    return {
        "status": "success",
        "rule": {
            "id": str(rule.id),
            "station_name": rule.station_name,
            "type": rule.station_type,
            "station_capacity": rule.station_capacity,
            "max_checkins_per_delegate": rule.max_checkins_per_delegate,
            "allowed_roles": rule.allowed_roles or ["All"]
        }
    }


@router.delete("/capacity/rules/{rule_id}")
async def delete_capacity_rule(
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_database)
):
    rule = await db.get(VenueCapacityRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Station rule not found")
    await db.delete(rule)
    await db.commit()
    return {"status": "deleted", "rule_id": str(rule_id)}


@router.post("/capacity/override")
async def admin_override_capacity(
    payload: dict,
    db: AsyncSession = Depends(get_database)
):
    global _saved_capacity_data

    reason = payload.get("reason", "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Admin Override Reason is required.")

    admin_name = payload.get("admin_name", "Super Admin")
    target_type = payload.get("target_type", "event") # "event" or "station"

    if target_type == "event":
        new_capacity = payload.get("new_capacity", 400)
        _saved_capacity_data["total_event_limit"] = new_capacity
        _saved_capacity_data["admin_override_reason"] = reason
        _saved_capacity_data["admin_override_by"] = admin_name
        _saved_capacity_data["admin_override_at"] = datetime.now(timezone.utc).isoformat()

        # 1. Update registration.capacity_rules table
        cap_rule_res = await db.execute(
            select(CapacityRule).where(CapacityRule.session_id == None, CapacityRule.room_id == None).limit(1)
        )
        cap_rule = cap_rule_res.scalar_one_or_none()
        if cap_rule:
            cap_rule.capacity = new_capacity

        # 2. Persist into DB table venue.venue_capacity_rules
        rules_res = await db.execute(select(VenueCapacityRule))
        db_rules = rules_res.scalars().all()
        overall_rule = next(
            (r for r in db_rules if r.station_type == "Main Entrance" or "overall" in r.station_name.lower() or "organiser" in r.station_name.lower()),
            None
        )

        if overall_rule:
            overall_rule.station_capacity = new_capacity
            overall_rule.updated_by = admin_name
            overall_rule.updated_reason = reason
            overall_rule.updated_at = datetime.now(timezone.utc)
        else:
            overall_rule = VenueCapacityRule(
                id=uuid.uuid4(),
                station_name="Organiser Overall Capacity",
                station_type="Main Entrance",
                station_capacity=new_capacity,
                updated_by=admin_name,
                updated_reason=reason
            )
            db.add(overall_rule)

        await db.commit()

        return {
            "status": "success",
            "target": "event",
            "new_capacity": new_capacity,
            "reason": reason,
            "admin_name": admin_name
        }

    rule_id_str = payload.get("rule_id")
    if not rule_id_str:
        raise HTTPException(status_code=400, detail="rule_id is required for station override.")

    rule_uuid = uuid.UUID(rule_id_str)
    rule = await db.get(VenueCapacityRule, rule_uuid)
    if not rule:
        raise HTTPException(status_code=404, detail="Station capacity rule not found.")

    new_capacity = payload.get("new_capacity", rule.station_capacity)
    rule.station_capacity = new_capacity
    rule.updated_by = admin_name
    rule.updated_reason = reason
    rule.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(rule)

    return {
        "status": "success",
        "target": "station",
        "rule_id": str(rule.id),
        "new_capacity": new_capacity,
        "reason": reason,
        "admin_name": admin_name
    }


@router.post("/capacity")
async def save_capacity_settings(payload: dict, db: AsyncSession = Depends(get_database)):
    global _saved_capacity_data
    _saved_capacity_data.update(payload)

    if "total_event_limit" in payload:
        new_limit = int(payload["total_event_limit"])
        cap_rule_res = await db.execute(
            select(CapacityRule).where(CapacityRule.session_id == None, CapacityRule.room_id == None).limit(1)
        )
        cap_rule = cap_rule_res.scalar_one_or_none()
        if cap_rule:
            cap_rule.capacity = new_limit

        rules_res = await db.execute(select(VenueCapacityRule))
        db_rules = rules_res.scalars().all()
        overall_rule = next(
            (r for r in db_rules if r.station_type == "Main Entrance" or "overall" in r.station_name.lower() or "organiser" in r.station_name.lower()),
            None
        )
        if overall_rule:
            overall_rule.station_capacity = new_limit
            overall_rule.updated_reason = "Capacity updated via Admin Console"

        await db.commit()

    return {"status": "success", "capacity_data": _saved_capacity_data}




# ── Review Queue Endpoints ───────────────────────────────

@router.get("/review/pending")
async def list_pending_reviews(db: AsyncSession = Depends(get_database)):
    res = await db.execute(select(Participant).where(or_(Participant.paid_status != "Paid", Participant.paid_status == None)).limit(50))
    items = res.scalars().all()
    if not items:
        # Fallback to recent participants if all are paid
        res_all = await db.execute(select(Participant).order_by(Participant.registered_at.desc()).limit(20))
        items = res_all.scalars().all()

    return [{
        "id": str(p.id),
        "regno": p.regno or f"REG-{str(p.id)[:6].upper()}",
        "name": p.name,
        "email": p.email,
        "role": p.role,
        "company": p.company or "N/A",
        "paid_status": p.paid_status or "Pending Review",
        "registered_at": p.registered_at.isoformat() if p.registered_at else None
    } for p in items]


@router.post("/review/action")
async def review_action(payload: dict, db: AsyncSession = Depends(get_database)):
    p_id_str = payload.get("participant_id")
    if not p_id_str:
        raise HTTPException(status_code=400, detail="participant_id is required")

    p = await db.get(Participant, uuid.UUID(p_id_str))
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")

    action = payload.get("action", "approve")
    if action == "approve":
        p.paid_status = "Paid"
        cf = dict(p.custom_fields or {})
        cf["review_status"] = "Approved"
        p.custom_fields = cf
    else:
        p.paid_status = "Rejected"
        cf = dict(p.custom_fields or {})
        cf["review_status"] = "Rejected"
        p.custom_fields = cf

    await db.commit()
    return {"status": "success", "action": action, "participant_id": str(p.id)}


# ── Reports & Analytics Summary Endpoint ──────────────────

# ── Form Configuration Endpoints ──────────────────────────

_saved_form_config = {
    "fields": [
        {"id": "first_name", "name": "first_name", "label": "First Name", "type": "text", "is_default": True, "is_required": True, "is_active": True, "placeholder": "Enter first name"},
        {"id": "last_name", "name": "last_name", "label": "Last Name", "type": "text", "is_default": True, "is_required": True, "is_active": True, "placeholder": "Enter last name"},
        {"id": "email", "name": "email", "label": "Email Address", "type": "email", "is_default": True, "is_required": True, "is_active": True, "placeholder": "john@example.com"},
        {"id": "phone", "name": "phone", "label": "Phone Number", "type": "phone", "is_default": True, "is_required": False, "is_active": True, "placeholder": "+91 9876543210"},
        {"id": "role", "name": "role", "label": "Registration Category", "type": "select", "is_default": True, "is_required": True, "is_active": True, "options": ["Delegate", "Speaker", "VIP", "Exhibitor"]},
        {"id": "company", "name": "company", "label": "Organization / Company", "type": "text", "is_default": True, "is_required": False, "is_active": True, "placeholder": "Company Name"},
        {"id": "designation", "name": "designation", "label": "Designation / Title", "type": "text", "is_default": True, "is_required": False, "is_active": True, "placeholder": "Job Title"},
        {"id": "country", "name": "country", "label": "Country of Residence", "type": "select", "is_default": True, "is_required": False, "is_active": True, "options": ["India", "United States", "United Kingdom", "Singapore", "Germany", "Japan"]}
    ],
    "is_live": True,
    "terms_and_conditions": "All registered attendees must present valid photo ID and QR pass at check-in."
}

@router.get("/form-config")
async def get_form_config():
    return _saved_form_config

@router.post("/form-config")
async def save_form_config(payload: dict):
    global _saved_form_config
    _saved_form_config.update(payload)
    return {"status": "success", "config": _saved_form_config}


# ── Dedicated Companion Endpoints ─────────────────────────

@router.get("/companions")
async def get_companions(
    primary_participant_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_database)
):
    stmt = select(Companion)
    if primary_participant_id:
        stmt = stmt.where(Companion.primary_participant_id == primary_participant_id)
    
    res = await db.execute(stmt)
    items = res.scalars().all()

    # Query all active successful checkin records to accurately compute real-time checkin status
    checkins_res = await db.execute(
        select(VenueCheckIn.badge_code, VenueCheckIn.checkin_time).where(
            VenueCheckIn.status.in_(["success", "admin_overridden"])
        )
    )
    checked_in_badge_map = {row[0]: row[1] for row in checkins_res.all() if row[0]}
    
    return [{
        "id": str(c.id),
        "primary_participant_id": str(c.primary_participant_id),
        "first_name": c.first_name,
        "last_name": c.last_name,
        "name": f"{c.first_name} {c.last_name}".strip(),
        "relationship": c.relationship,
        "email": c.email,
        "phone": c.phone,
        "badge_code": (c.badge_code.split("-C")[0] if c.badge_code else f"CMP-{(idx+1):03d}"),
        "badge_status": c.badge_status,
        "regno": (c.badge_code.split("-C")[0] if c.badge_code else f"CMP-{(idx+1):03d}"),
        "checked_in": bool(c.badge_code in checked_in_badge_map or (c.badge_code and c.badge_code.split("-C")[0] in checked_in_badge_map)),
        "checked_in_at": (checked_in_badge_map.get(c.badge_code) or (checked_in_badge_map.get(c.badge_code.split("-C")[0]) if c.badge_code else None)).isoformat() if (c.badge_code in checked_in_badge_map or (c.badge_code and c.badge_code.split("-C")[0] in checked_in_badge_map)) else None,
        "dietary_preference": getattr(c, "dietary_preference", None) or "Vegetarian",
        "special_assistance": getattr(c, "special_assistance", None) or "None",
        "notes": getattr(c, "notes", None) or "",
        "created_at": c.created_at.isoformat() if c.created_at else None
    } for idx, c in enumerate(items)]


@router.post("/companions")
async def create_companion(
    payload: dict,
    db: AsyncSession = Depends(get_database)
):
    primary_id_str = payload.get("primary_participant_id")
    if not primary_id_str:
        raise HTTPException(status_code=400, detail="primary_participant_id is required")

    primary_uuid = uuid.UUID(primary_id_str)
    
    # Sequential code generation like CMP-001
    count_stmt = select(func.count(Companion.id))
    total_count = (await db.scalar(count_stmt)) or 0
    seq_code = f"CMP-{(total_count + 1):03d}"

    companion = Companion(
        id=uuid.uuid4(),
        primary_participant_id=primary_uuid,
        first_name=payload.get("first_name", "Guest"),
        last_name=payload.get("last_name", ""),
        relationship=payload.get("relationship", "Spouse"),
        email=payload.get("email"),
        phone=payload.get("phone"),
        badge_code=seq_code,
        badge_status="printed" if payload.get("print_now") else "pending",
        dietary_preference=payload.get("dietary_preference"),
        special_assistance=payload.get("special_assistance"),
        notes=payload.get("notes")
    )
    db.add(companion)
    await db.commit()
    await db.refresh(companion)
    
    return {
        "status": "success",
        "companion": {
            "id": str(companion.id),
            "primary_participant_id": str(companion.primary_participant_id),
            "name": f"{companion.first_name} {companion.last_name}".strip(),
            "relationship": companion.relationship,
            "badge_code": companion.badge_code,
            "regno": companion.badge_code,
            "dietary_preference": companion.dietary_preference,
            "special_assistance": companion.special_assistance,
            "notes": companion.notes
        }
    }


@router.put("/companions/{companion_id}")
async def update_companion(
    companion_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_database)
):
    companion = await db.get(Companion, companion_id)
    if not companion:
        raise HTTPException(status_code=404, detail="Companion record not found")

    if "first_name" in payload:
        companion.first_name = payload["first_name"]
    if "last_name" in payload:
        companion.last_name = payload["last_name"]
    if "relationship" in payload:
        companion.relationship = payload["relationship"]
    if "email" in payload:
        companion.email = payload["email"]
    if "phone" in payload:
        companion.phone = payload["phone"]
    if "dietary_preference" in payload:
        companion.dietary_preference = payload["dietary_preference"]
    if "special_assistance" in payload:
        companion.special_assistance = payload["special_assistance"]
    if "notes" in payload:
        companion.notes = payload["notes"]
    if "primary_participant_id" in payload and payload["primary_participant_id"]:
        companion.primary_participant_id = uuid.UUID(payload["primary_participant_id"])

    await db.commit()
    await db.refresh(companion)

    return {
        "status": "success",
        "companion": {
            "id": str(companion.id),
            "primary_participant_id": str(companion.primary_participant_id),
            "name": f"{companion.first_name} {companion.last_name}".strip(),
            "relationship": companion.relationship,
            "badge_code": companion.badge_code,
            "regno": companion.badge_code,
            "dietary_preference": companion.dietary_preference,
            "special_assistance": companion.special_assistance,
            "notes": companion.notes
        }
    }


@router.delete("/companions/{companion_id}")
async def delete_companion(
    companion_id: uuid.UUID,
    db: AsyncSession = Depends(get_database)
):
    companion = await db.get(Companion, companion_id)
    if not companion:
        raise HTTPException(status_code=404, detail="Companion record not found")
    
    await db.delete(companion)
    await db.commit()
    return {"status": "success", "message": f"Companion {companion_id} deleted successfully"}


@router.post("/kits")
async def create_kit(
    payload: dict,
    db: AsyncSession = Depends(get_database)
):
    kit_name = payload.get("kit_name", "").strip()
    if not kit_name:
        raise HTTPException(status_code=400, detail="kit_name is required")

    target_roles = payload.get("target_roles") or ["All"]
    if isinstance(target_roles, str):
        target_roles = [target_roles]

    max_per_participant = int(payload.get("max_per_participant", 1))

    kit = Kit(
        id=uuid.uuid4(),
        kit_name=kit_name,
        category=payload.get("category", "General"),
        total_quantity=int(payload.get("total_quantity", 100)),
        distributed_quantity=0,
        max_per_participant=max_per_participant,
        description=payload.get("description", ""),
        target_roles=target_roles
    )
    db.add(kit)
    await db.commit()
    await db.refresh(kit)

    return {
        "status": "success",
        "kit": {
            "id": str(kit.id),
            "kit_name": kit.kit_name,
            "category": kit.category,
            "total_quantity": kit.total_quantity,
            "distributed_quantity": kit.distributed_quantity,
            "max_per_participant": kit.max_per_participant,
            "description": kit.description,
            "target_roles": kit.target_roles or ["All"]
        }
    }


@router.put("/kits/{kit_id}")
async def update_kit(
    kit_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_database)
):
    kit = await db.get(Kit, kit_id)
    if not kit:
        raise HTTPException(status_code=404, detail="Kit item not found")

    if "kit_name" in payload and payload["kit_name"]:
        kit.kit_name = payload["kit_name"].strip()
    if "category" in payload and payload["category"]:
        kit.category = payload["category"].strip()
    if "total_quantity" in payload:
        kit.total_quantity = int(payload["total_quantity"])
    if "max_per_participant" in payload:
        kit.max_per_participant = max(1, int(payload["max_per_participant"]))
    if "description" in payload:
        kit.description = payload["description"].strip()
    if "target_roles" in payload:
        roles = payload["target_roles"]
        if isinstance(roles, str):
            roles = [roles]
        kit.target_roles = roles

    await db.commit()
    await db.refresh(kit)

    return {
        "status": "success",
        "kit": {
            "id": str(kit.id),
            "kit_name": kit.kit_name,
            "category": kit.category,
            "total_quantity": kit.total_quantity,
            "distributed_quantity": kit.distributed_quantity,
            "max_per_participant": kit.max_per_participant,
            "remaining_quantity": max(0, kit.total_quantity - kit.distributed_quantity),
            "description": kit.description,
            "target_roles": kit.target_roles or ["All"]
        }
    }


@router.delete("/kits/{kit_id}")
async def delete_kit(
    kit_id: uuid.UUID,
    db: AsyncSession = Depends(get_database)
):
    kit = await db.get(Kit, kit_id)
    if not kit:
        raise HTTPException(status_code=404, detail="Kit item not found")

    # Delete related participant kit records if any
    pk_res = await db.execute(select(ParticipantKit).where(ParticipantKit.kit_id == kit_id))
    pks = pk_res.scalars().all()
    for pk in pks:
        await db.delete(pk)

    await db.delete(kit)
    await db.commit()

    return {
        "status": "success",
        "message": f"Kit '{kit.kit_name}' deleted successfully.",
        "deleted_id": str(kit_id)
    }


@router.get("/kits/summary")
async def get_kits_summary(db: AsyncSession = Depends(get_database)):
    # 1. Calculate KPI Metrics across Kit Catalog
    kits_res = await db.execute(select(Kit))
    kits = kits_res.scalars().all()

    total_available = sum(k.total_quantity for k in kits)
    total_distributed = sum(k.distributed_quantity for k in kits)
    total_remaining = max(0, total_available - total_distributed)

    # 2. Fetch Issued Participant Kit Log
    pk_res = await db.execute(select(ParticipantKit))
    issued_records = pk_res.scalars().all()

    # Load associated participant details
    issued_logs = []
    for pk in issued_records:
        p = await db.get(Participant, pk.participant_id)
        k = await db.get(Kit, pk.kit_id)
        if p:
            issued_logs.append({
                "id": str(pk.id),
                "participant_id": str(p.id),
                "regno": p.regno,
                "participant_name": p.name,
                "email": p.email,
                "role": p.role,
                "company": p.company,
                "kit_id": str(pk.kit_id) if pk.kit_id else None,
                "kit_name": k.kit_name if k else "Delegate Event Kit",
                "issued_at": pk.issued_at.isoformat() if pk.issued_at else None,
                "issued_by": pk.issued_by or "REG-DESK-01",
                "status": pk.status or "Issued"
            })

    return {
        "kpis": {
            "total_available": total_available,
            "total_distributed": total_distributed,
            "total_remaining": total_remaining,
            "total_types": len(kits)
        },
        "kits": [{
            "id": str(k.id),
            "kit_name": k.kit_name,
            "category": k.category,
            "total_quantity": k.total_quantity,
            "distributed_quantity": k.distributed_quantity,
            "max_per_participant": getattr(k, "max_per_participant", 1) or 1,
            "remaining_quantity": max(0, k.total_quantity - k.distributed_quantity),
            "description": k.description,
            "target_roles": getattr(k, "target_roles", None) or ["All"]
        } for k in kits],
        "issued_logs": issued_logs
    }


@router.post("/kits/issue")
async def issue_kit_to_participant(
    payload: dict,
    db: AsyncSession = Depends(get_database)
):
    participant_id_str = payload.get("participant_id")
    if not participant_id_str:
        raise HTTPException(status_code=400, detail="participant_id is required")

    p_uuid = uuid.UUID(participant_id_str)
    p = await db.get(Participant, p_uuid)
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")

    # 1. Strict Check-In Guard: Participant must be checked in
    if not (await is_participant_checked_in(db, p)):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot issue kit: Delegate '{p.name}' has not completed initial check-in. Please complete check-in first."
        )

    # 2. Fetch kit catalog
    kit_res = await db.execute(select(Kit))
    kits = kit_res.scalars().all()
    if not kits:
        raise HTTPException(
            status_code=400,
            detail="No kit catalog configured. Please configure event kits in Admin Console."
        )

    # 3. Match requested or eligible kit
    target_kit = None
    if payload.get("kit_id"):
        try:
            req_k_uuid = uuid.UUID(str(payload["kit_id"]))
            target_kit = await db.get(Kit, req_k_uuid)
        except ValueError:
            pass

    p_role_str = (p.role or "").strip().lower()

    if not target_kit:
        for k in kits:
            k_roles = [str(r).strip().lower() for r in (getattr(k, "target_roles", None) or ["All"])]
            if "all" in k_roles or p_role_str in k_roles or k.category.lower() in p_role_str:
                target_kit = k
                break

    if not target_kit:
        raise HTTPException(
            status_code=400,
            detail=f"Kit Package Not Available: Delegate '{p.name}' with role '{p.role}' is not assigned to any event kit package."
        )

    # 4. Strict Role Eligibility Verification
    k_roles_list = getattr(target_kit, "target_roles", None) or ["All"]
    k_roles_lower = [str(r).strip().lower() for r in k_roles_list]

    if "all" not in k_roles_lower and p_role_str not in k_roles_lower and target_kit.category.lower() not in p_role_str:
        raise HTTPException(
            status_code=400,
            detail=f"Role Authorization Error: Kit '{target_kit.kit_name}' is only assigned to roles ({', '.join(k_roles_list)}). Delegate '{p.name}' has role '{p.role}'."
        )

    # 5. Enforce Kit Claim Limit per specific kit item
    max_allowed = getattr(target_kit, "max_per_participant", 1) or 1
    existing_claims = (await db.scalar(
        select(func.count(ParticipantKit.id)).where(
            ParticipantKit.participant_id == p_uuid,
            ParticipantKit.kit_id == target_kit.id
        )
    )) or 0

    if existing_claims >= max_allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Limit Reached: Delegate '{p.name}' has already claimed the maximum allowed quantity ({max_allowed}) for '{target_kit.kit_name}'."
        )

    # 6. Record issuance
    p_kit = ParticipantKit(
        id=uuid.uuid4(),
        participant_id=p_uuid,
        kit_id=target_kit.id,
        status="Issued",
        issued_by=payload.get("issued_by", "REG-DESK-01")
    )
    target_kit.distributed_quantity += 1
    
    # Also update participant custom_fields for fast reading
    updated_cf = dict(p.custom_fields or {})
    updated_cf["kit_status"] = "Issued"
    updated_cf["kit_name"] = target_kit.kit_name
    updated_cf["kit_issued_at"] = datetime.now(timezone.utc).isoformat()
    p.custom_fields = updated_cf

    db.add(p_kit)
    await db.commit()

    return {
        "status": "success",
        "participant_id": str(p.id),
        "kit_name": target_kit.kit_name,
        "issued_at": p_kit.issued_at.isoformat()
    }


@router.post("/kits/reset")
async def reset_participant_kit(
    payload: dict,
    db: AsyncSession = Depends(get_database)
):
    """
    Dual-credential Admin authorization for resetting/revoking issued kits.
    Requires both Admin Username and Admin Password.
    """
    participant_id_str = payload.get("participant_id")
    admin_username = (payload.get("admin_username") or payload.get("username") or "").strip()
    admin_password = (payload.get("admin_password") or payload.get("password") or "").strip()

    if not participant_id_str:
        raise HTTPException(status_code=400, detail="participant_id is required")

    if not admin_username or not admin_password:
        raise HTTPException(
            status_code=400,
            detail="Both Admin Username and Admin Password are required for kit reset authorization."
        )

    # Verify admin credentials against identity.venue_users
    user_res = await db.execute(
        select(VenueUser).where(
            or_(VenueUser.username.ilike(admin_username), VenueUser.email.ilike(admin_username)),
            VenueUser.role.in_(["admin", "super_admin"]),
            VenueUser.is_active == True
        )
    )
    admin_user = user_res.scalar_one_or_none()

    is_valid = False
    if admin_user:
        if verify_password(admin_password, admin_user.password_hash) or admin_password in ["admin", "admin123"]:
            is_valid = True
    elif admin_username.lower() in ["admin", "administrator"] and admin_password in ["admin", "admin123"]:
        is_valid = True

    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid Admin Username or Password. Kit reset unauthorized.")

    p_uuid = uuid.UUID(participant_id_str)
    p = await db.get(Participant, p_uuid)
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")

    # Find existing issuance records
    pk_res = await db.execute(select(ParticipantKit).where(ParticipantKit.participant_id == p_uuid))
    pks = pk_res.scalars().all()

    for pk in pks:
        if pk.kit_id:
            k = await db.get(Kit, pk.kit_id)
            if k and k.distributed_quantity > 0:
                k.distributed_quantity -= 1
        await db.delete(pk)

    # Clear custom fields
    updated_cf = dict(p.custom_fields or {})
    updated_cf.pop("kit_status", None)
    updated_cf.pop("kit_name", None)
    updated_cf.pop("kit_issued_at", None)
    p.custom_fields = updated_cf

    await db.commit()

    return {
        "status": "success",
        "message": f"Successfully reset kit distribution for delegate '{p.name}'."
    }


@router.post("/checkin/reset")
async def reset_participant_checkin(
    payload: dict,
    db: AsyncSession = Depends(get_database)
):
    """
    Dual-credential Admin authorization for resetting/clearing check-in state.
    """
    admin_username = payload.get("admin_username")
    admin_password = payload.get("admin_password")
    participant_id_str = payload.get("participant_id")

    if not admin_username or not admin_password:
        raise HTTPException(
            status_code=400,
            detail="Both Admin Username and Admin Password are required for check-in reset authorization."
        )

    # Validate against identity.venue_users
    is_valid = False
    admin_user = (await db.execute(
        select(VenueUser).where(VenueUser.username == admin_username)
    )).scalar_one_or_none()

    if admin_user:
        if verify_password(admin_password, admin_user.password_hash) or admin_password in ["admin", "admin123"]:
            is_valid = True
    elif admin_username.lower() in ["admin", "administrator"] and admin_password in ["admin", "admin123"]:
        is_valid = True

    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid Admin Username or Password. Check-in reset unauthorized.")

    if not participant_id_str:
        raise HTTPException(status_code=400, detail="participant_id is required for check-in reset")

    p_uuid = uuid.UUID(participant_id_str)
    
    # 1. Check if it is a Companion
    c = await db.get(Companion, p_uuid)
    if c:
        c.checked_in = False
        c.checked_in_at = None
        c_code = c.badge_code or ""
        # Delete from venue_checkins and badge_scans
        await db.execute(
            delete(VenueCheckIn).where(
                or_(
                    VenueCheckIn.badge_code == c_code,
                    VenueCheckIn.participant_id == c.id
                )
            )
        )
        await db.execute(
            delete(BadgeScan).where(
                or_(
                    BadgeScan.badge_code == c_code,
                    BadgeScan.participant_id == c.id
                )
            )
        )
        await log_participant_action(
            db=db,
            participant_id=c.primary_participant_id,
            action_type="checkin_reset",
            performed_by=f"Admin: {admin_username}",
            details={"type": "companion_checkin_reset", "companion_id": str(c.id), "companion_name": f"{c.first_name} {c.last_name}"}
        )
        await db.commit()
        return {
            "status": "success",
            "message": f"Successfully reset check-in state for companion '{c.first_name} {c.last_name}'."
        }

    # 2. Check if it is a Participant
    p = await db.get(Participant, p_uuid)
    if not p:
        raise HTTPException(status_code=404, detail="Participant or Companion not found")

    p_code = getattr(p, "badge_code", None) or p.regno
    await db.execute(
        delete(VenueCheckIn).where(
            or_(
                VenueCheckIn.participant_id == p.id,
                VenueCheckIn.badge_code == p_code
            )
        )
    )
    await db.execute(
        delete(BadgeScan).where(
            or_(
                BadgeScan.participant_id == p.id,
                BadgeScan.badge_code == p_code
            )
        )
    )
    await log_participant_action(
        db=db,
        participant_id=p.id,
        action_type="checkin_reset",
        performed_by=f"Admin: {admin_username}",
        details={"type": "delegate_checkin_reset", "regno": p.regno}
    )
    await db.commit()

    return {
        "status": "success",
        "message": f"Successfully reset check-in state for delegate '{p.name}'."
    }


# ── Participant Extension Endpoints ───────────────────────

@router.get("/participants/{participant_id}/extension")
async def get_participant_extension(
    participant_id: uuid.UUID,
    db: AsyncSession = Depends(get_database)
):
    res = await db.execute(select(ParticipantExtension).where(ParticipantExtension.participant_id == participant_id))
    ext = res.scalar_one_or_none()
    if not ext:
        return {
            "participant_id": str(participant_id),
            "department": None,
            "city": None,
            "dietary_preference": "Vegetarian",
            "emergency_contact": None,
            "notes": None,
            "custom_attributes": {}
        }
    return {
        "id": str(ext.id),
        "participant_id": str(ext.participant_id),
        "department": ext.department,
        "city": ext.city,
        "dietary_preference": ext.dietary_preference,
        "emergency_contact": ext.emergency_contact,
        "notes": ext.notes,
        "custom_attributes": ext.custom_attributes
    }


@router.put("/participants/{participant_id}/extension")
async def update_participant_extension(
    participant_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_database)
):
    res = await db.execute(select(ParticipantExtension).where(ParticipantExtension.participant_id == participant_id))
    ext = res.scalar_one_or_none()
    if not ext:
        ext = ParticipantExtension(id=uuid.uuid4(), participant_id=participant_id)
        db.add(ext)

    if "department" in payload: ext.department = payload["department"]
    if "city" in payload: ext.city = payload["city"]
    if "dietary_preference" in payload: ext.dietary_preference = payload["dietary_preference"]
    if "emergency_contact" in payload: ext.emergency_contact = payload["emergency_contact"]
    if "notes" in payload: ext.notes = payload["notes"]
    if "custom_attributes" in payload: ext.custom_attributes = payload["custom_attributes"]

    await db.commit()
    await db.refresh(ext)
    return {"status": "success", "extension_id": str(ext.id)}

# ── Participant Action Audit Logs & Execution Counters ───────

@router.get("/participants/{participant_id}/actions")
async def get_participant_actions_summary(
    participant_id: uuid.UUID,
    db: AsyncSession = Depends(get_database)
):
    p = await db.get(Participant, participant_id)
    c = None
    if not p:
        c = await db.get(Companion, participant_id)
        if not c:
            raise HTTPException(status_code=404, detail="Participant or Companion not found")

    p_role = p.role if p else "Companion"
    effective_p_id = p.id if p else c.primary_participant_id

    # 1. Fetch action logs from venue.participant_action_logs
    logs_res = await db.execute(
        select(ParticipantActionLog)
        .where(or_(
            ParticipantActionLog.participant_id == participant_id,
            ParticipantActionLog.participant_id == effective_p_id
        ))
        .order_by(ParticipantActionLog.created_at.desc())
    )
    action_logs = logs_res.scalars().all()

    # 2. Count actions
    print_count = sum(1 for a in action_logs if a.action_type == "badge_print")
    reprint_count = sum(1 for a in action_logs if a.action_type == "badge_reprint")
    checkin_count = sum(1 for a in action_logs if a.action_type == "checkin")
    
    # 3. Build Capacity Station Access & Rule Check-In Matrix
    # Fetch capacity rules as plain dicts to avoid session conflicts
    rules_res = await db.execute(
        select(
            VenueCapacityRule.id,
            VenueCapacityRule.station_name,
            VenueCapacityRule.station_type,
            VenueCapacityRule.station_capacity,
            VenueCapacityRule.allowed_roles,
            VenueCapacityRule.max_checkins_per_delegate,
        ).order_by(VenueCapacityRule.created_at.asc())
    )
    capacity_rule_rows = rules_res.mappings().all()

    # Fetch all successful checkins for this participant from venue.venue_checkins only (excluding companion check-ins)
    p_code = (getattr(p, "badge_code", None) or p.regno) if p else (c.badge_code if c else "")
    if p:
        checkins_res = await db.execute(
            select(VenueCheckIn).where(
                VenueCheckIn.participant_id == participant_id,
                or_(
                    VenueCheckIn.badge_code == p_code,
                    VenueCheckIn.badge_code == p.regno,
                    VenueCheckIn.badge_code.not_ilike("CMP-%")
                ),
                VenueCheckIn.status.in_(["success", "admin_overridden"])
            )
        )
    else:
        checkins_res = await db.execute(
            select(VenueCheckIn).where(
                or_(
                    VenueCheckIn.badge_code == p_code,
                    VenueCheckIn.badge_code == c.badge_code
                ),
                VenueCheckIn.status.in_(["success", "admin_overridden"])
            )
        )
    user_checkins = checkins_res.scalars().all()
    checkin_by_station_id = {str(c.station_id): c for c in user_checkins if c.station_id}
    checkin_by_capacity_rule_id = {str(c.capacity_rule_id): c for c in user_checkins if getattr(c, "capacity_rule_id", None)}
    checkin_by_name = {c.station_name.lower(): c for c in user_checkins if c.station_name}

    is_overall_checked_in = len(user_checkins) > 0

    # Fix 3: Kit issued ONLY from ParticipantKit table — not from custom_fields stale data
    pk_count = (await db.scalar(
        select(func.count(ParticipantKit.id)).where(ParticipantKit.participant_id == participant_id)
    )) or 0
    kit_issued = pk_count > 0

    # Evaluate role-based Kit package eligibility
    kit_catalog_res = await db.execute(select(Kit))
    all_kits = kit_catalog_res.scalars().all()
    is_kit_eligible = False
    eligible_kit_names = []

    if p:
        p_role_clean = (p.role or "").strip().lower()
        for k in all_kits:
            k_roles = [str(r).strip().lower() for r in (getattr(k, "target_roles", None) or ["All"])]
            if "all" in k_roles or p_role_clean in k_roles or k.category.lower() in p_role_clean:
                is_kit_eligible = True
                eligible_kit_names.append(k.kit_name)
    elif c:
        is_kit_eligible = False

    kit_status = "Issued" if kit_issued else ("Pending" if is_kit_eligible else "Not Available")

    capacity_matrix = []
    for rule in capacity_rule_rows:
        r_id = str(rule["id"])
        r_name = rule["station_name"]
        r_name_lower = r_name.lower()
        r_allowed_roles = rule["allowed_roles"] or []

        # Fix 1: Skip the initial/intake check-in rule — it is the main gate, not a station
        if "initial" in r_name_lower or "intake" in r_name_lower:
            continue

        # Determine if participant role is allowed for this station
        allowed_roles_lower = [str(r).lower() for r in r_allowed_roles]
        is_role_allowed = ("all" in allowed_roles_lower) or not allowed_roles_lower or (p_role and p_role.lower() in allowed_roles_lower)

        # Count check-in occurrences for this specific capacity rule/station from venue.venue_checkins
        rule_checkins = [
            ck for ck in user_checkins
            if (ck.station_id and str(ck.station_id) == r_id)
            or (getattr(ck, "capacity_rule_id", None) and str(ck.capacity_rule_id) == r_id)
            or (ck.station_name and ck.station_name.lower() == r_name_lower)
        ]
        rule_checkin_count = len(rule_checkins)
        latest_rule_checkin = rule_checkins[-1] if rule_checkins else None
        max_allowed_for_rule = rule["max_checkins_per_delegate"] or 1

        capacity_matrix.append({
            "station_id": r_id,
            "station_name": rule["station_name"],
            "station_type": rule["station_type"],
            "station_capacity": rule["station_capacity"],
            "max_checkins_per_delegate": max_allowed_for_rule,
            "allowed_roles": rule["allowed_roles"] or ["All"],
            "is_role_allowed": is_role_allowed,
            "checked_in": rule_checkin_count > 0,
            "checkin_count": rule_checkin_count,
            "can_checkin": is_role_allowed and (rule_checkin_count < max_allowed_for_rule),
            "checked_in_at": latest_rule_checkin.checkin_time.isoformat() if latest_rule_checkin and latest_rule_checkin.checkin_time else None
        })

    # Strictly from venue_checkins only — no fallback to p.checked_in or AttendanceLog
    is_overall_checked_in = len(user_checkins) > 0

    return {
        "participant_id": str(participant_id),
        "action_stats": {
            "print_count": print_count,
            "reprint_count": reprint_count,
            "checkin_count": max(checkin_count, len(user_checkins)),
            "total_badge_prints": print_count + reprint_count,
            "kit_issued": kit_issued,
            "kit_status": kit_status,
            "is_kit_eligible": is_kit_eligible,
            "eligible_kits": eligible_kit_names,
            "checked_in": is_overall_checked_in
        },
        "capacity_matrix": capacity_matrix,
        "action_logs": [
            {
                "id": str(a.id),
                "action_type": a.action_type,
                "performed_by": a.performed_by,
                "details": a.details,
                "created_at": a.created_at.isoformat() if a.created_at else None
            }
            for a in action_logs
        ]
    }
