# backend/app/routers/capacity.py
from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent, AdminOrAbove
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.events.models.event import Event
from app.modules.agenda.models import Session
from app.modules.agenda.models import Room
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.check_in import CheckIn
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.venue.schemas.capacity import (
    CapacityRuleCreate,
    CapacityRuleUpdate,
    CapacityRuleResponse,
    CapacityStatusResponse,
)
from app.modules.registration.schemas.registration import ParticipantRegistrationResponse
from app.modules.registration.routers.registrations import helper_approve_registration
from app.core.dependencies.feature_gate import require_event_operation
from app.modules.venue.application.capacity_commands import CapacityRuleCommandService
from app.modules.venue.application.capacity_queries import CapacityQueryService
from app.modules.analytics.services.projection_dispatch import (
    enqueue_event_registration_projection_refresh,
)

router = APIRouter(
    prefix="/events/{event_id}/capacity",
    tags=["capacity"],
    dependencies=[require_event_operation("registration.manage")],
)


@router.post("", response_model=CapacityRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_capacity_rule(
    payload: CapacityRuleCreate,
    event: CurrentEvent,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new capacity rule for an Event, Session, or Room.
    """
    rule = await CapacityRuleCommandService(db).create(
        event_id=event.id,
        data=payload.model_dump(),
    )
    return rule


@router.patch("/{id}", response_model=CapacityRuleResponse)
async def update_capacity_rule(
    id: uuid.UUID,
    payload: CapacityRuleUpdate,
    event: CurrentEvent,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db)
):
    """
    Update a capacity rule.
    """
    rule = await CapacityRuleCommandService(db).update(
        event_id=event.id,
        rule_id=id,
        data=payload.model_dump(exclude_unset=True),
    )
    return rule


@router.get("/status", response_model=List[CapacityStatusResponse])
async def get_capacity_status(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db)
):
    """
    Get live capacity status and occupancy rates across all configured rules (Event, Session, Room levels).
    """
    return await CapacityQueryService(db).get_status(
        event_id=event.id,
        event_name=event.name,
    )


@router.post("/promote", response_model=List[ParticipantRegistrationResponse])
async def trigger_waitlist_promotions(
    event: CurrentEvent,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db)
):
    """
    Trigger automatic promotions from waitlist based on available capacity.
    Promotes waitlisted registrations in FIFO order (waitlist_position ascending).
    """
    # 1. Get Event level rule
    q_rule = select(CapacityRule).where(
        CapacityRule.event_id == event.id,
        CapacityRule.session_id.is_(None),
        CapacityRule.room_id.is_(None)
    )
    rule = (await db.execute(q_rule)).scalar_one_or_none()
    if not rule:
        return []

    # 2. Get current occupancy (approved count)
    q_count = select(func.count(Participant.id)).where(Participant.event_id == event.id)
    current_approved = (await db.execute(q_count)).scalar() or 0

    available_slots = rule.capacity - current_approved
    if available_slots <= 0:
        return []

    # 3. Fetch waitlisted registrations in FIFO order
    q_wl = select(ParticipantRegistration).where(
        ParticipantRegistration.event_id == event.id,
        ParticipantRegistration.registration_status == "waitlisted"
    ).order_by(ParticipantRegistration.waitlist_position.asc()).limit(available_slots)
    
    to_promote = (await db.execute(q_wl)).scalars().all()
    promoted = []

    for reg in to_promote:
        old_position = reg.waitlist_position
        approved_reg = await helper_approve_registration(db, reg, current_user.id, "Auto-promoted from waitlist")
        promoted.append(approved_reg)

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

    if promoted:
        await db.commit()
        enqueue_event_registration_projection_refresh(
            organization_id=event.organization_id, event_id=event.id
        )

    return promoted
