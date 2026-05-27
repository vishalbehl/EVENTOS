"""
Portal Service
app/modules/registration/services/portal_service.py

Business logic for the attendee self-service portal:
- Load dashboard data (registration, participant, payment, event info)
- Check edit lock
- Apply detail updates
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.rbac.models.event import Event
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.speakers.models.speaker import Speaker


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
    faqs: Optional[list] = None
    include_default_faqs: Optional[bool] = True



@dataclass
class RegistrationInfo:
    status: str  # not_registered | submitted | pending_review | approved | waitlisted | rejected | closed
    registration_id: Optional[str]
    submitted_at: Optional[datetime]
    waitlist_position: Optional[int]
    rejection_reason: Optional[str]


@dataclass
class ParticipantInfo:
    regno: str
    name: str
    email: str
    phone: str
    company: str
    designation: str
    country: str
    role: str
    paid_status: str
    custom_fields: dict
    registered_at: Optional[datetime]


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
class DashboardData:
    event: EventInfo
    registration: RegistrationInfo
    participant: Optional[ParticipantInfo]
    payment: Optional[PaymentInfo]
    edits_locked: bool
    is_speaker: bool
    speaker_portal_url: str


from app.modules.registration.models.registration_form_config import RegistrationFormConfig


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


async def get_dashboard_data(
    email: str,
    event_id: uuid.UUID,
    db: AsyncSession,
) -> DashboardData:
    """Aggregate all portal dashboard data for an attendee."""

    # 1 — Load event
    event_result = await db.execute(select(Event).where(Event.id == event_id))
    event = event_result.scalar_one_or_none()
    if not event:
        raise ValueError("Event not found.")

    config_stmt = select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event_id)
    config = (await db.execute(config_stmt)).scalar_one_or_none()
    is_live = config.is_live if config else True

    reg_settings = event.registration_settings or {}
    event_info = EventInfo(
        name=event.name,
        start_date=event.start_date,
        end_date=event.end_date,
        venue=event.venue_name or event.location or "",
        support_email=reg_settings.get("support_email", ""),
        announcements=reg_settings.get("announcements", ""),
        program_url=reg_settings.get("program_url", ""),
        terms_and_conditions=reg_settings.get("terms_and_conditions", ""),
        faqs=reg_settings.get("faqs", None),
        include_default_faqs=reg_settings.get("include_default_faqs", True),
    )

    # 2 — Load confirmed participant by email
    p_stmt = (
        select(Participant)
        .where(
            Participant.event_id == event_id,
            Participant.email == email.lower(),
        )
        .limit(1)
    )
    p_result = await db.execute(p_stmt)
    p: Optional[Participant] = p_result.scalar_one_or_none()

    reg_row = None
    if p:
        # Check if there is a linked registration row
        reg_stmt = (
            select(ParticipantRegistration)
            .where(
                ParticipantRegistration.event_id == event_id,
                ParticipantRegistration.participant_id == p.id,
            )
            .limit(1)
        )
        reg_result = await db.execute(reg_stmt)
        reg_row = reg_result.scalar_one_or_none()
        if not reg_row:
            reg_email_stmt = (
                select(ParticipantRegistration)
                .where(
                    ParticipantRegistration.event_id == event_id,
                    text("registration_data->>'email' = :email").bindparams(email=email.lower()),
                )
                .order_by(ParticipantRegistration.submitted_at.desc())
                .limit(1)
            )
            reg_row = (await db.execute(reg_email_stmt)).scalar_one_or_none()
            if reg_row:
                reg_row.participant_id = p.id
                await db.commit()
            else:
                reg_row = ParticipantRegistration(
                    event_id=event_id,
                    participant_id=p.id,
                    registration_status="approved",
                    registration_data={
                        "name": p.name,
                        "email": p.email,
                        "phone": p.phone or "",
                        "company": p.company or "",
                        "designation": p.designation or "",
                        "country": p.country or "",
                        "role": p.role,
                        "paid_status": p.paid_status,
                        "custom_fields": p.custom_fields or {},
                    },
                    submitted_at=p.registered_at or datetime.now(timezone.utc),
                )
                db.add(reg_row)
                await db.commit()
                await db.refresh(reg_row)

        reg_info = RegistrationInfo(
            status="approved",
            registration_id=str(reg_row.id) if reg_row else None,
            submitted_at=reg_row.submitted_at if reg_row else p.registered_at,
            waitlist_position=None,
            rejection_reason=None,
        )
        participant_info = ParticipantInfo(
            regno=p.regno or "",
            name=p.name,
            email=p.email or "",
            phone=p.phone or "",
            company=p.company or "",
            designation=p.designation or "",
            country=p.country or "",
            role=p.role,
            paid_status=p.paid_status,
            custom_fields=p.custom_fields or {},
            registered_at=p.registered_at,
        )
    else:
        # No confirmed participant, check for an unapproved registration workflow submission
        reg_stmt = (
            select(ParticipantRegistration)
            .where(
                ParticipantRegistration.event_id == event_id,
                text("registration_data->>'email' = :email").bindparams(email=email.lower()),
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
            return DashboardData(
                event=event_info,
                registration=reg_info,
                participant=None,
                payment=None,
                edits_locked=True,
                is_speaker=False,
                speaker_portal_url=f"/speaker/{event_id}",
            )

        if not reg_row:
            reg_info = RegistrationInfo(
                status="not_registered",
                registration_id=None,
                submitted_at=None,
                waitlist_position=None,
                rejection_reason=None,
            )
            return DashboardData(
                event=event_info,
                registration=reg_info,
                participant=None,
                payment=None,
                edits_locked=_check_edits_locked(event, is_live=is_live),
                is_speaker=False,
                speaker_portal_url=f"/speaker/{event_id}",
            )

        reg_info = RegistrationInfo(
            status=reg_row.registration_status,
            registration_id=str(reg_row.id),
            submitted_at=reg_row.submitted_at,
            waitlist_position=reg_row.waitlist_position,
            rejection_reason=reg_row.rejection_reason,
        )
        reg_data = reg_row.registration_data or {}
        participant_info = ParticipantInfo(
            regno="",
            name=reg_data.get("name", ""),
            email=reg_data.get("email", ""),
            phone=reg_data.get("phone", ""),
            company=reg_data.get("company", ""),
            designation=reg_data.get("designation", ""),
            country=reg_data.get("country", ""),
            role=reg_data.get("role", "Delegate"),
            paid_status=reg_data.get("paid_status", "Unpaid"),
            custom_fields=reg_data.get("custom_fields", {}),
            registered_at=reg_row.submitted_at,
        )

    # 4 — Latest payment transaction (load for any registration status if reg_row exists)
    pay = None
    payment_info = None
    if reg_row:
        pay_result = await db.execute(
            select(PaymentTransaction)
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
        select(Speaker).where(
            Speaker.event_id == event_id,
            Speaker.email == email.lower(),
        ).limit(1)
    )
    speaker_rec = sp_result.scalar_one_or_none()
    is_speaker = speaker_rec is not None

    # Check if participant's role belongs to "Presentation Related" category
    from app.modules.registration.models.participant_role import ParticipantRole
    is_speaker_category = False
    if participant_info and participant_info.role:
        role_stmt = select(ParticipantRole).where(
            ParticipantRole.event_id == event_id,
            ParticipantRole.name == participant_info.role
        ).limit(1)
        role_res = await db.execute(role_stmt)
        role_row = role_res.scalar_one_or_none()
        if role_row and role_row.category == "Presentation Related":
            is_speaker_category = True

    if is_speaker_category:
        is_speaker = True

    from app.config import settings
    speaker_portal_url = ""
    if speaker_rec:
        speaker_portal_url = f"{settings.SPEAKER_PORTAL_BASE_URL}/{speaker_rec.speaker_code}"
    elif is_speaker_category:
        speaker_portal_url = settings.SPEAKER_PORTAL_BASE_URL

    return DashboardData(
        event=event_info,
        registration=reg_info,
        participant=participant_info,
        payment=payment_info,
        edits_locked=_check_edits_locked(event, is_live=is_live),
        is_speaker=is_speaker,
        speaker_portal_url=speaker_portal_url,
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
    allowed_fields = {"name", "phone", "company", "designation", "country"}
    target_email = new_email.lower() if new_email else email.lower()

    # Check if a confirmed Participant exists first
    p_stmt = (
        select(Participant)
        .where(
            Participant.event_id == event_id,
            Participant.email == email.lower(),
        )
        .limit(1)
    )
    p_result = await db.execute(p_stmt)
    participant = p_result.scalar_one_or_none()

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

        for field_name in allowed_fields:
            if field_name in updates and updates[field_name] is not None:
                setattr(participant, field_name, updates[field_name])
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
            if "custom_fields" in updates and updates["custom_fields"] is not None:
                reg_data["custom_fields"] = {
                    **(reg_data.get("custom_fields") or {}),
                    **updates["custom_fields"]
                }
            if new_email:
                reg_data["email"] = target_email
            reg_row.registration_data = reg_data

        await db.commit()

        participant_details = {
            "regno": participant.regno or "",
            "name": participant.name,
            "phone": participant.phone or "",
            "company": participant.company or "",
            "designation": participant.designation or "",
            "country": participant.country or "",
            "custom_fields": participant.custom_fields or {},
        }
        return target_email, participant_details

    # No confirmed participant, search for an unapproved registration workflow submission
    reg_stmt = (
        select(ParticipantRegistration)
        .where(
            ParticipantRegistration.event_id == event_id,
            text("registration_data->>'email' = :email").bindparams(email=email.lower()),
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
    if "custom_fields" in updates and updates["custom_fields"] is not None:
        reg_data["custom_fields"] = {
            **(reg_data.get("custom_fields") or {}),
            **updates["custom_fields"]
        }
    if new_email:
        reg_data["email"] = target_email

    reg_row.registration_data = reg_data
    await db.commit()

    participant_details = {
        "regno": "",
        "name": reg_data.get("name", ""),
        "phone": reg_data.get("phone", ""),
        "company": reg_data.get("company", ""),
        "designation": reg_data.get("designation", ""),
        "country": reg_data.get("country", ""),
        "custom_fields": reg_data.get("custom_fields", {}),
    }
    return target_email, participant_details
