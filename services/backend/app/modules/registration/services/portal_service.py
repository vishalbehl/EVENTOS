"""
Portal Service
app/modules/registration/services/portal_service.py

Business logic for the attendee self-service portal:
- Load dashboard data (registration, participant, payment, event info)
- Check edit lock
- Apply detail updates
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Optional

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, load_only

from app.core.cache import invalidate_event
from app.modules.events.models.event import Event
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.events.models.speaker import Speaker
from app.modules.registration.models.registration_form_config import RegistrationFormConfig


@dataclass
class EventInfo:
    name: str
    start_date: Optional[date]
    end_date: Optional[date]
    venue: str
    support_email: str
    announcements: Any
    program_url: str
    terms_and_conditions: str
    short_code: str = ""
    faqs: Optional[list] = None
    include_default_faqs: Optional[bool] = True
    description: Optional[str] = ""
    location: Optional[str] = ""
    venue_name: Optional[str] = ""
    state: Optional[str] = ""
    country: Optional[str] = ""
    timezone: Optional[str] = "UTC"
    mode: Optional[str] = "IN_PERSON"
    organizer_name: Optional[str] = ""


@dataclass
class RegistrationInfo:
    status: str  # not_registered | submitted | pending_review | approved | waitlisted | rejected | closed
    registration_id: Optional[str]
    submitted_at: Optional[datetime]
    waitlist_position: Optional[int]
    rejection_reason: Optional[str]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass
class ParticipantInfo:
    regno: str
    name: str
    first_name: str
    last_name: str
    email: str
    phone: str
    company: str
    designation: str
    country: str
    role: str
    paid_status: str
    custom_fields: dict
    registered_at: Optional[datetime]
    state: Optional[str] = None
    title: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass
class PaymentInfo:
    status: str
    amount: float
    currency: str
    payment_method: str
    transaction_id: str
    created_at: datetime
    gateway_payment_id: Optional[str]
    discount_applied: float


@dataclass
class PricingInfo:
    base_price: float
    currency: str
    active_tier: str
    payment_enabled: bool
    active_gateway: str
    roles: list[dict]
    active_prices: dict[str, float]


@dataclass
class DashboardData:
    event: EventInfo
    registration: RegistrationInfo
    participant: Optional[ParticipantInfo]
    payment: Optional[PaymentInfo]
    edits_locked: bool
    is_speaker: bool
    speaker_portal_url: str
    pricing: Optional[PricingInfo] = None


def _check_edits_locked(event: Event, is_live: bool = True) -> bool:
    """Return True if edits are disabled (within cutoff_days of event start, past cutoff_date, or registration is closed)."""
    if not is_live:
        return True
    settings = event.registration_settings or {}
    
    # Check date-based registration/edit cutoff
    cutoff_date_str = settings.get("edit_cutoff_date")
    if cutoff_date_str:
        try:
            # Parse date in ISO format YYYY-MM-DD
            cutoff_date = date.fromisoformat(cutoff_date_str.split("T")[0])
            if date.today() > cutoff_date:
                return True
        except Exception:
            pass

    cutoff_days: int = int(settings.get("edit_cutoff_days", 0))
    if cutoff_days <= 0:
        return False
    if not event.start_date:
        return False
    days_until = (event.start_date - date.today()).days
    return days_until <= cutoff_days


async def _load_participant_and_registration(
    db: AsyncSession, *, event_id: uuid.UUID, email: str
) -> tuple[Participant | None, ParticipantRegistration | None]:
    """Resolve the common confirmed-attendee path in one tenant/event query."""
    if not email:
        return None, None
    normalized_email = email.strip().lower()
    result = await db.execute(
        select(Participant, ParticipantRegistration)
        .outerjoin(
            ParticipantRegistration,
            and_(
                ParticipantRegistration.participant_id == Participant.id,
                ParticipantRegistration.event_id == event_id,
                ParticipantRegistration.deleted_at.is_(None),
            ),
        )
        .options(joinedload(Participant.role_rel))
        .where(
            Participant.event_id == event_id,
            Participant.deleted_at.is_(None),
            or_(
                func.lower(Participant.email) == normalized_email,
                Participant.custom_fields["additional_emails"].contains([normalized_email]),
            ),
        )
        .order_by(ParticipantRegistration.submitted_at.desc().nullslast())
        .limit(1)
    )
    row = result.first()
    return row if row else (None, None)


async def get_dashboard_data(
    email: str,
    event_id: uuid.UUID,
    db: AsyncSession,
    event: Event | None = None,
) -> DashboardData:
    """Aggregate all portal dashboard data for an attendee."""

    # 1 — Load event
    if event is None:
        event_result = await db.execute(select(Event).where(Event.id == event_id))
        event = event_result.scalar_one_or_none()
    if not event:
        raise ValueError("Event not found.")

    config_stmt = select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event_id)
    config = (await db.execute(config_stmt)).scalar_one_or_none()
    is_live = config.is_live if config else True

    from app.modules.notifications.services.announcement_service import list_active_entitled_announcements

    active_anns = await list_active_entitled_announcements(
        db,
        organization_id=event.organization_id,
        event_id=event_id,
        audiences=["all", "participants"],
    )

    announcements_list = [
        {
            "id": str(ann.id),
            "title": ann.title,
            "message": ann.body,
            "type": ann.priority,
            "is_pinned": ann.is_pinned,
            "created_at": ann.created_at.isoformat(),
            "attachments": ann.attachments or []
        }
        for ann in active_anns
    ]

    reg_settings = event.registration_settings or {}
    
    from app.modules.registration.routers.registration_portal import DEFAULT_FAQS, DEFAULT_TERMS
    
    terms = reg_settings.get("terms_and_conditions") or DEFAULT_TERMS
    include_default = reg_settings.get("include_default_faqs", True)
    custom_faqs = reg_settings.get("faqs", [])
    
    if include_default:
        existing_questions = {f.get("q", "").strip().lower() for f in custom_faqs}
        faqs = list(custom_faqs)
        for df in DEFAULT_FAQS:
            if df["q"].strip().lower() not in existing_questions:
                faqs.append(df)
    else:
        faqs = custom_faqs

    event_info = EventInfo(
        name=event.name,
        start_date=event.start_date,
        end_date=event.end_date,
        venue=", ".join([v for v in [event.venue_name, event.location, event.state, event.country] if v]),
        support_email=reg_settings.get("support_email", "") or event.support_email or "",
        announcements=announcements_list,
        program_url=reg_settings.get("program_url", ""),
        terms_and_conditions=terms,
        short_code=event.short_code or "",
        faqs=faqs,
        include_default_faqs=include_default,
        description=getattr(event, "description", "") or reg_settings.get("description", "") or "",
        location=getattr(event, "location", "") or "",
        venue_name=getattr(event, "venue_name", "") or "",
        state=getattr(event, "state", "") or "",
        country=getattr(event, "country", "") or "",
        timezone=getattr(event, "timezone", "Asia/Kolkata") or "Asia/Kolkata",
        mode="In-Person" if getattr(event, "location", None) or getattr(event, "venue_name", None) else "Virtual",
        organizer_name=getattr(event, "organizer_name", "") or "",
    )

    # 2 — Load confirmed participant and its linked registration together.
    p, reg_row = await _load_participant_and_registration(
        db, event_id=event_id, email=email
    )

    if p:
        if not reg_row:
            reg_email_stmt = (
                select(ParticipantRegistration)
                .where(
                    ParticipantRegistration.event_id == event_id,
                    func.lower(ParticipantRegistration.registration_data["email"].astext) == email.lower(),
                )
                .order_by(ParticipantRegistration.submitted_at.desc())
                .limit(1)
            )
            reg_row = (await db.execute(reg_email_stmt)).scalar_one_or_none()
            # Dashboard reads must remain side-effect free. Legacy registration
            # repair is handled by the explicit reconciliation workflow.

        reg_info = RegistrationInfo(
            status="approved",
            registration_id=str(reg_row.id) if reg_row else None,
            submitted_at=reg_row.submitted_at if reg_row else p.registered_at,
            waitlist_position=None,
            rejection_reason=None,
            created_at=getattr(reg_row, "created_at", None) or getattr(p, "created_at", None),
            updated_at=getattr(reg_row, "updated_at", None) or getattr(p, "updated_at", None),
        )
        participant_info = ParticipantInfo(
            regno=p.regno or "",
            name=p.name,
            first_name=p.first_name,
            last_name=p.last_name,
            email=p.email or "",
            phone=p.phone or "",
            company=p.company or "",
            designation=p.designation or "",
            country=p.country or "",
            role=p.role,
            paid_status=p.paid_status,
            custom_fields=p.custom_fields or {},
            registered_at=p.registered_at,
            state=p.state or (reg_row.registration_data.get("state") if reg_row and reg_row.registration_data else ""),
            title=reg_row.registration_data.get("title") if reg_row and reg_row.registration_data else "Dr.",
            created_at=getattr(p, "created_at", None),
            updated_at=getattr(p, "updated_at", None),
        )
    else:
        # No confirmed participant, check for an unapproved registration workflow submission
        reg_stmt = (
            select(ParticipantRegistration)
            .where(
                ParticipantRegistration.event_id == event_id,
                func.lower(ParticipantRegistration.registration_data["email"].astext) == email.lower(),
            )
            .order_by(ParticipantRegistration.submitted_at.desc())
            .limit(1)
        )
        reg_result = await db.execute(reg_stmt)
        reg_row = reg_result.scalar_one_or_none()

        if not event.registration_allowed and not reg_row:
            reg_info = RegistrationInfo(
                status="closed",
                registration_id=None,
                submitted_at=None,
                waitlist_position=None,
                rejection_reason=None,
            )
            from app.config import settings
            return DashboardData(
                event=event_info,
                registration=reg_info,
                participant=None,
                payment=None,
                edits_locked=True,
                is_speaker=False,
                speaker_portal_url=f"{settings.SPEAKER_PORTAL_BASE_URL}/{event_id}",
            )

        if not reg_row:
            reg_info = RegistrationInfo(
                status="not_registered",
                registration_id=None,
                submitted_at=None,
                waitlist_position=None,
                rejection_reason=None,
            )
            from app.config import settings
            return DashboardData(
                event=event_info,
                registration=reg_info,
                participant=None,
                payment=None,
                edits_locked=_check_edits_locked(event, is_live=is_live),
                is_speaker=False,
                speaker_portal_url=f"{settings.SPEAKER_PORTAL_BASE_URL}/{event_id}",
            )

        reg_info = RegistrationInfo(
            status=reg_row.registration_status,
            registration_id=str(reg_row.id),
            submitted_at=reg_row.submitted_at,
            waitlist_position=reg_row.waitlist_position,
            rejection_reason=reg_row.rejection_reason,
            created_at=getattr(reg_row, "created_at", None),
            updated_at=getattr(reg_row, "updated_at", None),
        )
        reg_data = reg_row.registration_data or {}
        participant_info = ParticipantInfo(
            regno="",
            name=reg_data.get("name", ""),
            first_name=reg_data.get("first_name", ""),
            last_name=reg_data.get("last_name", ""),
            email=reg_data.get("email", ""),
            phone=reg_data.get("phone", ""),
            company=reg_data.get("company", ""),
            designation=reg_data.get("designation", ""),
            country=reg_data.get("country", ""),
            role=reg_data.get("role", "Delegate"),
            paid_status=reg_data.get("paid_status", "Unpaid"),
            custom_fields=reg_data.get("custom_fields", {}),
            registered_at=reg_row.submitted_at,
            state=reg_data.get("state", ""),
            title=reg_data.get("title", "Dr."),
            created_at=getattr(reg_row, "created_at", None),
            updated_at=getattr(reg_row, "updated_at", None),
        )

    # 4 — Latest payment transaction (load for any registration status if reg_row exists)
    pay = None
    payment_info = None
    if reg_row:
        pay_result = await db.execute(
            select(PaymentTransaction).options(
                load_only(
                    PaymentTransaction.id,
                    PaymentTransaction.status,
                    PaymentTransaction.amount,
                    PaymentTransaction.currency,
                    PaymentTransaction.payment_method,
                    PaymentTransaction.created_at,
                    PaymentTransaction.gateway_payment_id,
                    PaymentTransaction.discount_applied,
                )
            )
            .where(PaymentTransaction.registration_id == reg_row.id)
            .order_by(PaymentTransaction.created_at.desc())
            .limit(1)
        )
        pay = pay_result.scalar_one_or_none()
    if pay:
        payment_info = PaymentInfo(
            status=pay.status,
            amount=pay.amount,
            currency=pay.currency,
            payment_method=pay.payment_method,
            transaction_id=str(pay.id),
            created_at=pay.created_at,
            gateway_payment_id=pay.gateway_payment_id,
            discount_applied=pay.discount_applied,
        )

    # 5 — Speaker check
    sp_result = await db.execute(
        select(Speaker).options(
            load_only(Speaker.id, Speaker.speaker_code, Speaker.event_id, Speaker.email)
        ).where(
            Speaker.event_id == event_id,
            Speaker.email == email.lower(),
        ).limit(1)
    )
    speaker_rec = sp_result.scalar_one_or_none()
    is_speaker = speaker_rec is not None

    from app.modules.registration.services.pricing_service import get_ticket_price, get_active_tier, get_active_prices_for_event
    from app.modules.registration.models.participant_role import ParticipantRole

    # Dynamic pricing and roles resolution from database and organizer settings
    active_tier = get_active_tier(event)
    active_prices = await get_active_prices_for_event(db, event)
    payment_enabled = bool(reg_settings.get("payment_enabled", False))
    active_gateway = str(reg_settings.get("active_gateway", "simulated"))
    currency = str(event.currency or "INR")

    attendee_role = "Delegate"
    if participant_info and participant_info.role:
        attendee_role = participant_info.role
    elif reg_row and reg_row.registration_data and reg_row.registration_data.get("role"):
        attendee_role = reg_row.registration_data.get("role")

    # Fetch all active roles configured for this event by organizer
    role_stmt = select(ParticipantRole).options(
        load_only(
            ParticipantRole.id,
            ParticipantRole.event_id,
            ParticipantRole.name,
            ParticipantRole.category,
            ParticipantRole.is_default,
        )
    ).where(ParticipantRole.event_id == event_id)
    roles_db = (await db.execute(role_stmt)).scalars().all()
    roles_list = [
        {
            "id": str(r.id),
            "name": r.name,
            "category": r.category,
            "is_default": r.is_default,
        }
        for r in roles_db
    ]

    # Resolve exact ticket price from TicketType table for attendee's role and active tier
    resolved_price = active_prices.get(attendee_role)
    if resolved_price is None:
        for r_name, r_price in active_prices.items():
            if r_name.strip().lower() == attendee_role.strip().lower():
                resolved_price = r_price
                break
    if resolved_price is None:
        resolved_price = await get_ticket_price(db, event_id, attendee_role, active_tier)
    if resolved_price is None and attendee_role in active_prices:
        resolved_price = active_prices[attendee_role]
    if resolved_price is None:
        for r_name, r_price in active_prices.items():
            if r_name.strip().lower() == attendee_role.strip().lower():
                resolved_price = r_price
                break
    if resolved_price is None and reg_row and reg_row.registration_data:
        saved_amt = reg_row.registration_data.get("amount_paid") or reg_row.registration_data.get("amount")
        if saved_amt is not None:
            try:
                resolved_price = float(saved_amt)
            except Exception:
                pass

    base_price = float(resolved_price if resolved_price is not None else 0.0)

    pricing_info = PricingInfo(
        base_price=base_price,
        currency=currency,
        active_tier=active_tier,
        payment_enabled=payment_enabled,
        active_gateway=active_gateway,
        roles=roles_list,
        active_prices=active_prices,
    )
    from app.config import settings
    speaker_portal_url = ""
    if speaker_rec:
        speaker_portal_url = f"{settings.SPEAKER_PORTAL_BASE_URL}/{event_id}/{speaker_rec.speaker_code}"
    else:
        role_row = next((r for r in roles_db if r.name.lower() == attendee_role.lower()), None)
        if role_row and role_row.category == "Presentation Related":
            is_speaker = True
            speaker_portal_url = f"{settings.SPEAKER_PORTAL_BASE_URL}/{event_id}"

    return DashboardData(
        event=event_info,
        registration=reg_info,
        participant=participant_info,
        payment=payment_info,
        edits_locked=_check_edits_locked(event, is_live=is_live),
        is_speaker=is_speaker,
        speaker_portal_url=speaker_portal_url,
        pricing=pricing_info,
    )


async def update_attendee_details(
    email: str,
    event_id: uuid.UUID,
    updates: dict[str, Any],
    new_email: Optional[str],
    db: AsyncSession,
) -> tuple[str, dict]:
    """
    Apply allowed field updates to the registration_data (JSONB) and/or Participant row.
    If new_email is verified, we also update the email field.
    Returns a tuple of (updated_email, updated_details_dict).
    """
    allowed_fields = {"name", "first_name", "last_name", "title", "phone", "company", "designation", "country", "state"}
    target_email = new_email.lower() if new_email else email.lower()
    organization_id = await db.scalar(
        select(Event.organization_id).where(
            Event.id == event_id,
            Event.deleted_at.is_(None),
        )
    )
    if organization_id is None:
        raise ValueError("Event not found.")

    # Check if a confirmed Participant exists first
    participant = await Participant.find_by_email(db, event_id, email)

    if participant:
        if new_email:
            # Check if registration is already submitted/approved
            reg_stmt = (
                select(ParticipantRegistration)
                .where(
                    ParticipantRegistration.event_id == event_id,
                    ParticipantRegistration.participant_id == participant.id,
                )
                .limit(1)
            )
            reg_result = await db.execute(reg_stmt)
            reg_row = reg_result.scalar_one_or_none()
            
            # If no registration row, or if the registration status is submitted/approved, block email change
            is_locked = True
            if reg_row and reg_row.registration_status not in ("submitted", "pending_review", "approved", "waitlisted", "rejected"):
                is_locked = False
                
            if is_locked:
                raise ValueError("Email address cannot be changed after registration.")
        else:
            reg_row = None

        # Directly assign first_name and last_name first
        if "first_name" in updates and updates["first_name"] is not None:
            participant.first_name = updates["first_name"].strip()
        if "last_name" in updates and updates["last_name"] is not None:
            participant.last_name = updates["last_name"].strip()
        if "name" in updates and updates["name"] is not None and "first_name" not in updates and "last_name" not in updates:
            participant.name = updates["name"].strip()

        if "phone" in updates and updates["phone"] is not None:
            participant.phone = updates["phone"]
        if "company" in updates and updates["company"] is not None:
            participant.company = updates["company"]
        if "designation" in updates and updates["designation"] is not None:
            participant.designation = updates["designation"]
        if "country" in updates and updates["country"] is not None:
            participant.country = updates["country"]
        if "state" in updates and updates["state"] is not None:
            participant.state = updates["state"]

        if "custom_fields" in updates and updates["custom_fields"] is not None:
            participant.custom_fields = {
                **(participant.custom_fields or {}),
                **updates["custom_fields"]
            }
        if new_email:
            participant.email = target_email
        participant.updated_at = datetime.now(timezone.utc)

        # Also update registration row if it exists
        if not reg_row:
            reg_stmt = (
                select(ParticipantRegistration)
                .where(
                    ParticipantRegistration.event_id == event_id,
                    ParticipantRegistration.participant_id == participant.id,
                )
                .limit(1)
            )
            reg_result = await db.execute(reg_stmt)
            reg_row = reg_result.scalar_one_or_none()

        if reg_row:
            reg_data = dict(reg_row.registration_data or {})
            for field_name in allowed_fields:
                if field_name in updates and updates[field_name] is not None:
                    reg_data[field_name] = updates[field_name]
            if "name" in updates and updates["name"] is not None and "first_name" not in updates and "last_name" not in updates:
                parts = updates["name"].strip().split(" ", 1)
                reg_data["first_name"] = parts[0]
                reg_data["last_name"] = parts[1] if len(parts) > 1 else ""
                reg_data["name"] = updates["name"].strip()
            elif "first_name" in updates or "last_name" in updates:
                f = updates.get("first_name", reg_data.get("first_name", ""))
                l = updates.get("last_name", reg_data.get("last_name", ""))
                reg_data["name"] = f"{f} {l}".strip()

            if "custom_fields" in updates and updates["custom_fields"] is not None:
                reg_data["custom_fields"] = {
                    **(reg_data.get("custom_fields") or {}),
                    **updates["custom_fields"]
                }
            if new_email:
                reg_data["email"] = target_email
            reg_row.registration_data = reg_data

        await db.commit()
        await invalidate_event(organization_id, event_id)

        participant_details = {
            "regno": participant.regno or "",
            "name": participant.name,
            "first_name": participant.first_name,
            "last_name": participant.last_name,
            "phone": participant.phone or "",
            "company": participant.company or "",
            "designation": participant.designation or "",
            "country": participant.country or "",
            "state": participant.state or (reg_row.registration_data.get("state") if reg_row and reg_row.registration_data else ""),
            "title": reg_row.registration_data.get("title") if reg_row and reg_row.registration_data else "Dr.",
            "custom_fields": participant.custom_fields or {},
        }
        return target_email, participant_details

    # No confirmed participant, search for an unapproved registration workflow submission
    reg_stmt = (
        select(ParticipantRegistration)
        .where(
            ParticipantRegistration.event_id == event_id,
            func.lower(ParticipantRegistration.registration_data["email"].astext) == email.lower(),
        )
        .order_by(ParticipantRegistration.submitted_at.desc())
        .limit(1)
    )
    reg_result = await db.execute(reg_stmt)
    reg_row = reg_result.scalar_one_or_none()

    if not reg_row:
        if new_email:
            return target_email, {}
        raise ValueError("No registration found for this account.")

    if new_email and reg_row.registration_status in ("submitted", "pending_review", "approved", "waitlisted", "rejected"):
        raise ValueError("Email address cannot be changed after registration.")

    # Update registration row JSONB
    reg_data = dict(reg_row.registration_data or {})
    for field_name in allowed_fields:
        if field_name in updates and updates[field_name] is not None:
            reg_data[field_name] = updates[field_name]
    if "name" in updates and updates["name"] is not None and "first_name" not in updates and "last_name" not in updates:
        parts = updates["name"].strip().split(" ", 1)
        reg_data["first_name"] = parts[0]
        reg_data["last_name"] = parts[1] if len(parts) > 1 else ""
        reg_data["name"] = updates["name"].strip()
    elif "first_name" in updates or "last_name" in updates:
        f = updates.get("first_name", reg_data.get("first_name", ""))
        l = updates.get("last_name", reg_data.get("last_name", ""))
        reg_data["name"] = f"{f} {l}".strip()

    if "custom_fields" in updates and updates["custom_fields"] is not None:
        reg_data["custom_fields"] = {
            **(reg_data.get("custom_fields") or {}),
            **updates["custom_fields"]
        }
    if new_email:
        reg_data["email"] = target_email

    reg_row.registration_data = reg_data
    await db.commit()
    await invalidate_event(organization_id, event_id)

    participant_details = {
        "regno": "",
        "name": reg_data.get("name", ""),
        "first_name": reg_data.get("first_name", ""),
        "last_name": reg_data.get("last_name", ""),
        "phone": reg_data.get("phone", ""),
        "company": reg_data.get("company", ""),
        "designation": reg_data.get("designation", ""),
        "country": reg_data.get("country", ""),
        "state": reg_data.get("state", ""),
        "title": reg_data.get("title", "Dr."),
        "custom_fields": reg_data.get("custom_fields", {}),
    }
    return target_email, participant_details


def normalize_phone(phone: Optional[str]) -> str:
    if not phone:
        return ""
    return re.sub(r"\D", "", str(phone))


def phone_numbers_match(phone1: Optional[str], phone2: Optional[str]) -> bool:
    dig1 = normalize_phone(phone1)
    dig2 = normalize_phone(phone2)
    if not dig1 or not dig2:
        return False
    suffix_len = min(7, len(dig1), len(dig2))
    if suffix_len < 7:
        return dig1 == dig2
    return dig1[-suffix_len:] == dig2[-suffix_len:]


async def verify_and_resolve_registration(
    db: AsyncSession,
    event_id: uuid.UUID,
    email: str,
    name: str,
    phone: Optional[str],
    confirm_merge: bool = False
) -> Optional[Participant]:
    """
    Validation helper to prevent duplicate registrations and handle profile merging:
    - If email (primary or secondary) is already registered: raises 400 Bad Request.
    - If same name + phone is found under a different email:
        - If confirm_merge is False: raises 409 Conflict with masked email and existing participant ID.
        - If confirm_merge is True: appends email to existing participant's additional_emails list and returns them.
    - Else: returns None (no conflict, can proceed with normal creation).
    """
    from fastapi import HTTPException, status

    # 1. Check if email exists (either primary or secondary)
    existing_by_email = await Participant.find_by_email(db, event_id, email)
    if existing_by_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This email address is already registered."
        )

    # 2. Check for Name + Phone match on a different email
    if not name or not phone:
        return None

    # Fetch all participants for this event to check name + phone matches
    stmt = select(Participant).where(Participant.event_id == event_id)
    result = await db.execute(stmt)
    all_participants = result.scalars().all()

    match_participant = None
    for p in all_participants:
        # Check Name Match (case-insensitive, trimmed)
        n1 = " ".join(name.strip().lower().split())
        n2 = " ".join((p.name or "").strip().lower().split())
        if n1 == n2:
            # Check Phone Match
            if phone_numbers_match(phone, p.phone):
                match_participant = p
                break

    if match_participant:
        if not confirm_merge:
            # Mask existing email (e.g. as***@example.com)
            existing_email = match_participant.email or ""
            parts = existing_email.split("@")
            if len(parts) == 2:
                local, domain = parts
                masked_local = local[:2] + "***" if len(local) > 2 else local + "***"
                masked_email = f"{masked_local}@{domain}"
            else:
                masked_email = "***"

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "PROFILE_MERGE_REQUIRED",
                    "message": f"An existing profile with the same name and phone was found under the email {masked_email}. Would you like to merge your registration?",
                    "existing_participant_id": str(match_participant.id),
                    "masked_email": masked_email
                }
            )
        else:
            # confirm_merge is True, link the new email as a secondary email
            custom = dict(match_participant.custom_fields or {})
            emails = list(custom.get("additional_emails") or [])
            lower_email = email.strip().lower()
            if lower_email not in emails:
                emails.append(lower_email)
            custom["additional_emails"] = emails
            match_participant.custom_fields = custom
            match_participant.updated_at = datetime.now(timezone.utc)

            # The application command owns the transaction. Callers commit
            # after composing any additional mutation/audit work.
            return match_participant

    return None
