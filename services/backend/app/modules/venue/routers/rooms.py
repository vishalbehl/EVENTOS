# backend/app/routers/rooms.py
from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent, OrganizerOrAbove, get_current_user
from app.modules.agenda.models import Room
from app.modules.identity.models.user import User
from app.modules.venue.schemas.room import RoomCreate, RoomUpdate, RoomResponse
from app.schemas.common import MessageResponse
from app.core.dependencies.feature_gate import require_event_operation
from app.core.concurrency import require_if_match
from app.modules.agenda.application.commands import RoomCommandService
from app.modules.agenda.application.queries import RoomQueryService

router = APIRouter(prefix="/events/{event_id}/rooms", tags=["rooms"], dependencies=[require_event_operation("venue.rooms.manage")])


@router.get("", response_model=List[RoomResponse])
async def list_rooms(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[RoomResponse]:
    access_predicate = None

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
        access_predicate = or_(
            event_assigned,
            Room.id.in_(room_assignments),
        )

    rooms = await RoomQueryService(db).list_for_event(
        organization_id=event.organization_id,
        event_id=event.id,
        access_predicate=access_predicate,
    )
    return [RoomResponse.model_validate(room) for room in rooms]


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

    room_id = await RoomCommandService.create_room(
        db,
        event=event,
        payload=payload,
        actor_user_id=current_user.id,
        idempotency_key=idempotency_key,
    )
    room = await _get_room_or_404(db, room_id, event.id, user=current_user, allow_inactive=True)
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
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> RoomResponse:
    await _get_room_or_404(
        db, room_id, event.id, user=current_user, allow_inactive=True
    )
    expected_version = require_if_match(if_match) if if_match is not None else None
    await RoomCommandService.update_room(
        db,
        event=event,
        room_id=room_id,
        payload=payload,
        actor_user_id=current_user.id,
        expected_version=expected_version,
        idempotency_key=idempotency_key,
    )
    return RoomResponse.model_validate(
        await _get_room_or_404(db, room_id, event.id, user=current_user, allow_inactive=True)
    )


@router.delete("/{room_id}", response_model=MessageResponse)
async def delete_room(
    room_id: uuid.UUID,
    event: CurrentEvent,
    user: OrganizerOrAbove,
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await _get_room_or_404(db, room_id, event.id, user=user)
    expected_version = require_if_match(if_match) if if_match is not None else None
    await RoomCommandService.archive_room(
        db,
        event=event,
        room_id=room_id,
        actor_user_id=user.id,
        expected_version=expected_version,
        idempotency_key=idempotency_key,
    )
    return MessageResponse(message="Room archived and remains recoverable.")


async def _get_room_or_404(
    db: AsyncSession, 
    room_id: uuid.UUID, 
    event_id: uuid.UUID,
    user: Optional[User] = None,
    allow_inactive: bool = False
) -> Room:
    query_service = RoomQueryService(db)
    r = await query_service.get_for_event(
        organization_id=getattr(user, "organization_id", None) or uuid.UUID(int=0),
        event_id=event_id,
        room_id=room_id,
        allow_inactive=allow_inactive,
    )
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found.")

    # Enforce assignments for restricted roles
    if user and user.role not in ["super_admin", "admin", "organiser"]:
        if not await query_service.user_can_access(
            user_id=user.id,
            event_id=event_id,
            room_id=room_id,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this room.",
            )

    return r
