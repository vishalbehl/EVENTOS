from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user
from app.modules.identity.models.user import User
from app.modules.agenda.models.agenda_role import AgendaRole
from app.modules.agenda.models.session_type import SessionType
from app.modules.agenda.models.room_type import RoomType
from app.modules.agenda.models.track_type import TrackType
from app.modules.agenda.schemas.agenda_schemas import (
    AgendaRoleResponse, SessionTypeResponse, RoomTypeResponse, TrackTypeResponse
)

router = APIRouter(prefix="/agenda-catalogs", tags=["agenda-catalogs"])


@router.get("/roles", response_model=List[AgendaRoleResponse])
async def list_agenda_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AgendaRoleResponse]:
    res = await db.execute(
        select(AgendaRole).where(AgendaRole.is_active.is_(True)).order_by(AgendaRole.sort_order)
    )
    return [AgendaRoleResponse.model_validate(r) for r in res.scalars().all()]


@router.get("/session-types", response_model=List[SessionTypeResponse])
async def list_session_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[SessionTypeResponse]:
    res = await db.execute(
        select(SessionType).where(SessionType.is_active.is_(True)).order_by(SessionType.name)
    )
    return [SessionTypeResponse.model_validate(r) for r in res.scalars().all()]


@router.get("/room-types", response_model=List[RoomTypeResponse])
async def list_room_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[RoomTypeResponse]:
    res = await db.execute(
        select(RoomType).where(RoomType.is_active.is_(True)).order_by(RoomType.name)
    )
    return [RoomTypeResponse.model_validate(r) for r in res.scalars().all()]


@router.get("/track-types", response_model=List[TrackTypeResponse])
async def list_track_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[TrackTypeResponse]:
    res = await db.execute(
        select(TrackType).where(TrackType.is_active.is_(True)).order_by(TrackType.name)
    )
    return [TrackTypeResponse.model_validate(r) for r in res.scalars().all()]
