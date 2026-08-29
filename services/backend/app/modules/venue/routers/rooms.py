# backend/app/routers/rooms.py
from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent, OrganizerOrAbove, get_current_user
from app.modules.agenda.models import Room
from app.modules.identity.models.user import User
from app.modules.venue.schemas.room import RoomCreate, RoomUpdate, RoomResponse
from app.schemas.common import MessageResponse
from app.core.dependencies.feature_gate import require_event_operation
from app.modules.events.services.event_resource_mutation_service import (
    EventResourceMutationService,
)

router = APIRouter(prefix="/events/{event_id}/rooms", tags=["rooms"], dependencies=[require_event_operation("venue.rooms.manage")])


@router.get("", response_model=List[RoomResponse])
async def list_rooms(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[RoomResponse]:
    q = select(Room).options(selectinload(Room.event)).where(
        Room.event_id == event.id,
        Room.is_active.is_(True),
    )

    # Restricted roles (NOT super_admin, admin, or organiser) must have specific room assignments
    if current_user.role not in ["super_admin", "admin", "organiser", "organizer"]:
        from app.modules.rbac.models.rbac import UserAccessNode
        from sqlalchemy import or_, exists

        # Check if user is assigned to the WHOLE EVENT (which grants access to all rooms in it)
        event_assigned = exists().where(
            UserAccessNode.user_id == current_user.id,
            UserAccessNode.node_id == event.id,
            UserAccessNode.node_type == 'EVENT'
        )
        
        # Check specific ROOM assignments
        room_assignments = select(UserAccessNode.node_id).where(
            UserAccessNode.user_id == current_user.id,
            UserAccessNode.node_type == 'ROOM'
        )

        # A user can see a room if they own the event OR are specifically assigned to that room
        q = q.where(
            or_(
                event_assigned,
                Room.id.in_(room_assignments)
            )
        )

    result = await db.execute(q.order_by(Room.name))
    return [RoomResponse.model_validate(r) for r in result.scalars().all()]


@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    payload: RoomCreate,
    event: CurrentEvent,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RoomResponse:
    if not idempotency_key:
        idempotency_key = f"room-create:{uuid.uuid4()}"

    room = await EventResourceMutationService.create_room(
        db,
        event=event,
        payload=payload,
        actor_user_id=current_user.id,
        idempotency_key=idempotency_key,
        source="organizer_portal",
    )
    await db.commit()
    await db.refresh(room)
    return RoomResponse.model_validate(room)


@router.get("/{room_id}", response_model=RoomResponse)
async def get_room(
    room_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RoomResponse:
    return RoomResponse.model_validate(
        await _get_room_or_404(db, room_id, event.id, user=current_user)
    )


@router.patch("/{room_id}", response_model=RoomResponse)
async def update_room(
    room_id: uuid.UUID,
    payload: RoomUpdate,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RoomResponse:
    await _get_room_or_404(
        db, room_id, event.id, user=current_user, allow_inactive=True
    )
    room, _, _ = await EventResourceMutationService.update_room(
        db,
        event=event,
        room_id=room_id,
        payload=payload,
        actor_user_id=current_user.id,
    )
    await db.commit()
    await db.refresh(room)
    return RoomResponse.model_validate(room)


@router.delete("/{room_id}", response_model=MessageResponse)
async def delete_room(
    room_id: uuid.UUID,
    event: CurrentEvent,
    user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await _get_room_or_404(db, room_id, event.id, user=user)
    await EventResourceMutationService.archive_room(
        db,
        event=event,
        room_id=room_id,
        actor_user_id=user.id,
        source="organizer_portal",
    )
    await db.commit()
    return MessageResponse(message="Room archived and remains recoverable.")


async def _get_room_or_404(
    db: AsyncSession, 
    room_id: uuid.UUID, 
    event_id: uuid.UUID,
    user: Optional[User] = None,
    allow_inactive: bool = False
) -> Room:
    query = select(Room).options(selectinload(Room.event)).where(Room.id == room_id, Room.event_id == event_id)
    if not allow_inactive:
        query = query.where(Room.is_active == True)

    result = await db.execute(query)
    r = result.scalar_one_or_none()
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found.")

    # Enforce assignments for restricted roles
    if user and user.role not in ["super_admin", "admin", "organiser"]:
        from app.modules.rbac.models.rbac import UserAccessNode
        from sqlalchemy import or_, and_

        # Check if assigned to the event, or the specific room
        assignment_check = await db.execute(
            select(UserAccessNode).where(
                UserAccessNode.user_id == user.id,
                or_(
                    and_(UserAccessNode.node_id == event_id, UserAccessNode.node_type == 'EVENT'),
                    and_(UserAccessNode.node_id == room_id, UserAccessNode.node_type == 'ROOM')
                )
            )
        )
        if not assignment_check.scalars().first():
            # Check legacy assignments as fallback
            from app.modules.rbac.models.user_assignment import UserEventAssignment
            legacy_check = await db.execute(
                select(UserEventAssignment).where(
                    UserEventAssignment.user_id == user.id,
                    UserEventAssignment.event_id == event_id
                )
            )
            if not legacy_check.scalars().first():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, 
                    detail="You do not have permission to access this room."
                )

    return r
