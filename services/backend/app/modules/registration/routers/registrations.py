# backend/app/routers/registrations.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent, AdminOrAbove
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.badge_models import Badge, BadgeHistory
from app.modules.registration.models.print_template import PrintTemplate
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.events.models.event import Event
from app.core.dependencies.feature_gate import enforce_event_operation, require_event_operation
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.platform.services.metering_service import MeteringService
from app.modules.registration.schemas.registration import (
    ParticipantRegistrationCreate,
    ParticipantRegistrationUpdate,
    ParticipantRegistrationResponse,
    RegistrationApprovalRequest,
    RegistrationRejectionRequest,
)
from app.modules.registration.routers.participants import generate_next_regno
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/events/{event_id}/registrations", tags=["registrations"])


@router.post("/submit", response_model=ParticipantRegistrationResponse, status_code=status.HTTP_201_CREATED)
async def submit_registration(
    event_id: uuid.UUID,
    payload: ParticipantRegistrationCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Submit registration data. If event-level capacity is reached and waitlist is enabled,
    automatically waitlists the registration.
    """
    event = await db.scalar(select(Event).where(Event.id == event_id, Event.deleted_at.is_(None)))
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")
    await enforce_event_operation(db, event.organization_id, event.id, "registration.submit")
    q_rule = select(CapacityRule).where(
        CapacityRule.event_id == event_id,
        CapacityRule.session_id.is_(None),
        CapacityRule.room_id.is_(None)
    )
    rule = (await db.execute(q_rule)).scalar_one_or_none()

    # Get current approved count (participants registered)
    q_count = select(func.count(Participant.id)).where(Participant.event_id == event_id)
    current_approved = (await db.execute(q_count)).scalar() or 0

    status_str = "submitted"
    waitlist_pos = None

    if rule and current_approved >= rule.capacity:
        if rule.waitlist_enabled:
            status_str = "waitlisted"
            # Determine next waitlist position
            q_wl = select(func.max(ParticipantRegistration.waitlist_position)).where(
                ParticipantRegistration.event_id == event_id,
                ParticipantRegistration.registration_status == "waitlisted"
            )
            max_pos = (await db.execute(q_wl)).scalar()
            waitlist_pos = (max_pos or 0) + 1
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This event is at full capacity and waitlisting is disabled."
            )

    reg = ParticipantRegistration(
        event_id=event_id,
        registration_status=status_str,
        registration_data=payload.registration_data,
        approval_source=payload.approval_source,
        waitlist_position=waitlist_pos
    )
    db.add(reg)
    await db.flush()
    await MeteringService.record(db, organization_id=event.organization_id, event_id=event.id, metric_key="registration_submissions", quantity=1, unit="count", source="registration.submit", idempotency_key=f"registration-submit:{reg.id}", metadata={"registration_id": str(reg.id), "status": status_str})
    await db.commit()
    await db.refresh(reg)
    return reg


@router.get("", response_model=List[ParticipantRegistrationResponse])
async def list_registrations(
    event: CurrentEvent,
    registration_status: Optional[str] = Query(None, description="Filter by status (submitted, approved, waitlisted, rejected)"),
    db: AsyncSession = Depends(get_db)
):
    """
    List all registrations for the current event, optionally filtered by status.
    """
    q = select(ParticipantRegistration).where(ParticipantRegistration.event_id == event.id)
    if registration_status:
        q = q.where(ParticipantRegistration.registration_status == registration_status)
    q = q.order_by(ParticipantRegistration.submitted_at.desc())
    
    result = await db.execute(q)
    return list(result.scalars().all())


async def helper_approve_registration(
    db: AsyncSession,
    reg: ParticipantRegistration,
    reviewer_id: uuid.UUID,
    review_notes: Optional[str] = None
) -> ParticipantRegistration:
    """
    Internal helper to execute the approval process:
    1. Update registration status to approved.
    2. Split names and create Participant.
    3. Generate Badge.
    """
    if reg.registration_status == "approved":
        return reg

    # Extract name info from registration_data
    reg_data = reg.registration_data or {}
    full_name = reg_data.get("name", "Unnamed Participant").strip()
    first_name = reg_data.get("first_name", "").strip()
    last_name = reg_data.get("last_name", "").strip()

    if not first_name and not last_name:
        parts = full_name.split(" ", 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""

    if not full_name:
        full_name = f"{first_name} {last_name}".strip()

    role = (reg_data.get("role") or "Delegate").strip()
    email = (reg_data.get("email") or "").strip() or None
    phone = (reg_data.get("phone") or "").strip() or None
    company = (reg_data.get("company") or "").strip() or None
    designation = (reg_data.get("designation") or "").strip() or None
    country = (reg_data.get("country") or "").strip() or None
    paid_status = (reg_data.get("paid_status") or "Unpaid").strip()

    # Create participant regno based on ticket pricing rules
    from app.modules.events.models.event import Event
    from app.modules.registration.services.pricing_service import get_active_prices_for_event

    event_stmt = select(Event).where(Event.id == reg.event_id)
    event_res = await db.execute(event_stmt)
    event_obj = event_res.scalar_one_or_none()
    if not event_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")
    await enforce_event_operation(db, event_obj.organization_id, event_obj.id, "registration.approve", user_id=reviewer_id)
    reservation = await UsageReservationService.reserve(db, organization_id=event_obj.organization_id, event_id=reg.event_id, limit_key="max_registrations", quantity=1, unit="registration", idempotency_key=f"registration-approval:{reg.id}", metadata={"registration_id": str(reg.id)})

    role_price = 0.0
    if event_obj and event_obj.registration_settings and event_obj.registration_settings.get("payment_enabled", False):
        prices = await get_active_prices_for_event(db, event_obj)
        role_price = prices.get(role, 0.0)

    should_generate_regno = False
    if role_price <= 0.0:
        should_generate_regno = True
        paid_status = "Paid"
    elif paid_status == "Paid":
        should_generate_regno = True

    regno = None
    if should_generate_regno:
        regno = await generate_next_regno(db, reg.event_id, role)

    participant = Participant(
        event_id=reg.event_id,
        regno=regno,
        name=full_name,
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone,
        role=role,
        company=company,
        designation=designation,
        country=country,
        paid_status=paid_status,
        source="online_registration",
        custom_fields=reg_data.get("custom_fields", {})
    )
    db.add(participant)
    await db.flush()  # populate participant.id
    await UsageReservationService.consume(db, reservation.id, source="registration.approval", actor_user_id=reviewer_id)

    # Find default badge template
    q_tmpl = select(PrintTemplate).where(
        PrintTemplate.event_id == reg.event_id,
        PrintTemplate.template_type == "badge"
    ).limit(1)
    template = (await db.execute(q_tmpl)).scalar_one_or_none()
    template_id = template.id if template else None

    # Generate Badge
    badge_code = f"BDG-{uuid.uuid4().hex[:8].upper()}"
    qr_token = f"qr_{uuid.uuid4().hex}"
    barcode = f"BC-{uuid.uuid4().hex[:10].upper()}"

    badge = Badge(
        participant_id=participant.id,
        badge_code=badge_code,
        qr_token=qr_token,
        barcode=barcode,
        template_id=template_id,
        status="created"
    )
    db.add(badge)
    await db.flush()

    # Log Badge History
    history = BadgeHistory(
        badge_id=badge.id,
        action="created",
        performed_by=reviewer_id,
        metadata={"source": "registration_approval"}
    )
    db.add(history)

    # Update registration record
    reg.registration_status = "approved"
    reg.participant_id = participant.id
    reg.reviewed_by = reviewer_id
    reg.reviewed_at = datetime.now(timezone.utc)
    reg.review_notes = review_notes
    reg.waitlist_position = None

    await db.flush()
    return reg


@router.patch("/{id}/approve", response_model=ParticipantRegistrationResponse)
async def approve_registration(
    id: uuid.UUID,
    event: CurrentEvent,
    payload: RegistrationApprovalRequest,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db)
):
    """
    Approve a registration. Generates Participant and Badge records.
    """
    q = select(ParticipantRegistration).where(
        ParticipantRegistration.id == id,
        ParticipantRegistration.event_id == event.id
    )
    reg = (await db.execute(q)).scalar_one_or_none()
    if not reg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")

    if reg.registration_status == "approved":
        return reg

    # Enforce capacity checks
    q_rule = select(CapacityRule).where(
        CapacityRule.event_id == event.id,
        CapacityRule.session_id.is_(None),
        CapacityRule.room_id.is_(None)
    )
    rule = (await db.execute(q_rule)).scalar_one_or_none()

    if rule:
        q_count = select(func.count(Participant.id)).where(Participant.event_id == event.id)
        current_approved = (await db.execute(q_count)).scalar() or 0
        if current_approved >= rule.capacity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot approve. Event is at capacity ({rule.capacity})."
            )

    approved = await helper_approve_registration(db, reg, current_user.id, payload.review_notes)
    await db.commit()
    await db.refresh(approved)
    return approved


@router.patch("/{id}/reject", response_model=ParticipantRegistrationResponse, dependencies=[require_event_operation("registration.approve")])
async def reject_registration(
    id: uuid.UUID,
    event: CurrentEvent,
    payload: RegistrationRejectionRequest,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db)
):
    """
    Reject a registration submission.
    """
    q = select(ParticipantRegistration).where(
        ParticipantRegistration.id == id,
        ParticipantRegistration.event_id == event.id
    )
    reg = (await db.execute(q)).scalar_one_or_none()
    if not reg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")

    if reg.registration_status == "rejected":
        return reg

    old_status = reg.registration_status
    old_position = reg.waitlist_position

    reg.registration_status = "rejected"
    reg.rejection_reason = payload.rejection_reason
    reg.reviewed_by = current_user.id
    reg.reviewed_at = datetime.now(timezone.utc)
    reg.review_notes = payload.review_notes
    reg.waitlist_position = None

    # Shift waitlist positions if rejected from waitlist
    if old_status == "waitlisted" and old_position is not None:
        await db.execute(
            update(ParticipantRegistration)
            .where(
                and_(
                    ParticipantRegistration.event_id == event.id,
                    ParticipantRegistration.registration_status == "waitlisted",
                    ParticipantRegistration.waitlist_position > old_position
                )
            )
            .values(waitlist_position=ParticipantRegistration.waitlist_position - 1)
        )

    await db.commit()
    await db.refresh(reg)
    return reg


@router.patch("/{id}/waitlist", response_model=ParticipantRegistrationResponse, dependencies=[require_event_operation("registration.approve")])
async def waitlist_registration(
    id: uuid.UUID,
    event: CurrentEvent,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db)
):
    """
    Manually put a registration on the waitlist.
    """
    q = select(ParticipantRegistration).where(
        ParticipantRegistration.id == id,
        ParticipantRegistration.event_id == event.id
    )
    reg = (await db.execute(q)).scalar_one_or_none()
    if not reg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")

    if reg.registration_status == "waitlisted":
        return reg

    # Calculate next waitlist position
    q_wl = select(func.max(ParticipantRegistration.waitlist_position)).where(
        ParticipantRegistration.event_id == event.id,
        ParticipantRegistration.registration_status == "waitlisted"
    )
    max_pos = (await db.execute(q_wl)).scalar()
    waitlist_pos = (max_pos or 0) + 1

    reg.registration_status = "waitlisted"
    reg.waitlist_position = waitlist_pos
    reg.reviewed_by = current_user.id
    reg.reviewed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(reg)
    return reg


@router.patch("/{id}/promote", response_model=ParticipantRegistrationResponse)
async def promote_registration(
    id: uuid.UUID,
    event: CurrentEvent,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db)
):
    """
    Manually promote a registration from the waitlist.
    """
    q = select(ParticipantRegistration).where(
        ParticipantRegistration.id == id,
        ParticipantRegistration.event_id == event.id
    )
    reg = (await db.execute(q)).scalar_one_or_none()
    if not reg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")

    if reg.registration_status != "waitlisted":
        raise HTTPException(status_code=400, detail="Only waitlisted registrations can be promoted.")

    old_position = reg.waitlist_position

    # Run approval
    approved_reg = await helper_approve_registration(db, reg, current_user.id, "Promoted from waitlist")

    # Shift waitlist positions
    if old_position is not None:
        await db.execute(
            update(ParticipantRegistration)
            .where(
                and_(
                    ParticipantRegistration.event_id == event.id,
                    ParticipantRegistration.registration_status == "waitlisted",
                    ParticipantRegistration.waitlist_position > old_position
                )
            )
            .values(waitlist_position=ParticipantRegistration.waitlist_position - 1)
        )
    await db.commit()
    await db.refresh(approved_reg)

    return approved_reg


@router.post("/reset-data", response_model=MessageResponse)
async def reset_registration_data(
    event: CurrentEvent,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db)
) -> MessageResponse:
    """
    Legacy endpoint retained as an explicit denial. Registration history is
    financial and audit evidence and may only be purged by the governed
    Command Center lifecycle workflow.
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "GOVERNED_LIFECYCLE_REQUIRED",
            "message": "Permanent registration-data deletion must be requested and approved in Command Center.",
        },
    )
