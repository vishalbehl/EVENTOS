# backend/app/routers/capacity.py
from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent, AdminOrAbove
from app.models.capacity_rule import CapacityRule
from app.models.event import Event
from app.models.session import Session
from app.models.room import Room
from app.models.participant import Participant
from app.models.check_in import CheckIn
from app.models.participant_registration import ParticipantRegistration
from app.schemas.capacity import (
    CapacityRuleCreate,
    CapacityRuleUpdate,
    CapacityRuleResponse,
    CapacityStatusResponse,
)
from app.schemas.registration import ParticipantRegistrationResponse
from app.routers.registrations import helper_approve_registration

router = APIRouter(prefix="/events/{event_id}/capacity", tags=["capacity"])


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
    # Verify target exists if provided
    if payload.session_id:
        session = await db.get(Session, payload.session_id)
        if not session or session.event_id != event.id:
            raise HTTPException(status_code=404, detail="Session not found for this event")
    if payload.room_id:
        room = await db.get(Room, payload.room_id)
        if not room or room.event_id != event.id:
            raise HTTPException(status_code=404, detail="Room not found for this event")

    # Check for duplicate rule
    q_dup = select(CapacityRule).where(
        CapacityRule.event_id == event.id,
        CapacityRule.session_id == payload.session_id,
        CapacityRule.room_id == payload.room_id
    )
    dup = (await db.execute(q_dup)).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=400, detail="Capacity rule already exists for this target.")

    rule = CapacityRule(
        event_id=event.id,
        session_id=payload.session_id,
        room_id=payload.room_id,
        capacity=payload.capacity,
        waitlist_enabled=payload.waitlist_enabled,
        auto_promote=payload.auto_promote,
        priority_enabled=payload.priority_enabled
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
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
    q = select(CapacityRule).where(CapacityRule.id == id, CapacityRule.event_id == event.id)
    rule = (await db.execute(q)).scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Capacity rule not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)

    await db.commit()
    await db.refresh(rule)
    return rule


@router.get("/status", response_model=List[CapacityStatusResponse])
async def get_capacity_status(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db)
):
    """
    Get live capacity status and occupancy rates across all configured rules (Event, Session, Room levels).
    """
    q_rules = select(CapacityRule).where(CapacityRule.event_id == event.id)
    rules = (await db.execute(q_rules)).scalars().all()

    response_list = []

    for rule in rules:
        if rule.session_id is None and rule.room_id is None:
            # Event level
            q_occ = select(func.count(Participant.id)).where(Participant.event_id == event.id)
            occ = (await db.execute(q_occ)).scalar() or 0

            q_wl = select(func.count(ParticipantRegistration.id)).where(
                ParticipantRegistration.event_id == event.id,
                ParticipantRegistration.registration_status == "waitlisted"
            )
            wl = (await db.execute(q_wl)).scalar() or 0

            response_list.append(CapacityStatusResponse(
                id=rule.id,
                level="event",
                target_id=event.id,
                target_name=event.name,
                capacity=rule.capacity,
                current_occupancy=occ,
                waitlist_count=wl,
                occupancy_rate=float(occ / rule.capacity) if rule.capacity > 0 else 0.0
            ))
        elif rule.session_id is not None:
            # Session level
            session = await db.get(Session, rule.session_id)
            if not session:
                continue

            q_occ = select(func.count(CheckIn.id)).where(CheckIn.session_id == session.id)
            occ = (await db.execute(q_occ)).scalar() or 0

            response_list.append(CapacityStatusResponse(
                id=rule.id,
                level="session",
                target_id=session.id,
                target_name=session.name,
                capacity=rule.capacity,
                current_occupancy=occ,
                waitlist_count=0,
                occupancy_rate=float(occ / rule.capacity) if rule.capacity > 0 else 0.0
            ))
        elif rule.room_id is not None:
            # Room level
            room = await db.get(Room, rule.room_id)
            if not room:
                continue

            # Occupancy is check-ins to all sessions currently running in this room,
            # or simple count of active check-ins for active sessions.
            # For simplicity: count CheckIns for all sessions in this room.
            q_occ = select(func.count(CheckIn.id)).join(Session).where(
                Session.room_id == room.id
            )
            occ = (await db.execute(q_occ)).scalar() or 0

            response_list.append(CapacityStatusResponse(
                id=rule.id,
                level="room",
                target_id=room.id,
                target_name=room.name,
                capacity=rule.capacity,
                current_occupancy=occ,
                waitlist_count=0,
                occupancy_rate=float(occ / rule.capacity) if rule.capacity > 0 else 0.0
            ))

    return response_list


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

    return promoted
