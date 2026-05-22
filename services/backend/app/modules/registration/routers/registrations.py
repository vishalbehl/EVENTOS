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
from app.modules.venue.models.capacity_rule import CapacityRule
from app.modules.registration.schemas.registration import (
    ParticipantRegistrationCreate,
    ParticipantRegistrationUpdate,
    ParticipantRegistrationResponse,
    RegistrationApprovalRequest,
    RegistrationRejectionRequest,
)
from app.modules.registration.routers.participants import generate_next_regno

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
    # Verify event exists
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

    role = reg_data.get("role", "Delegate").strip()
    email = reg_data.get("email", "").strip() or None
    phone = reg_data.get("phone", "").strip() or None
    company = reg_data.get("company", "").strip() or None
    designation = reg_data.get("designation", "").strip() or None
    country = reg_data.get("country", "").strip() or None
    paid_status = reg_data.get("paid_status", "Unpaid").strip()

    # Create participant regno
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

    await db.commit()
    await db.refresh(reg)
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

    return await helper_approve_registration(db, reg, current_user.id, payload.review_notes)


@router.patch("/{id}/reject", response_model=ParticipantRegistrationResponse)
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


@router.patch("/{id}/waitlist", response_model=ParticipantRegistrationResponse)
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

    return approved_reg
