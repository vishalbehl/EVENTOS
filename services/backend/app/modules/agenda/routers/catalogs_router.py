from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user
from app.modules.identity.models.user import User
from app.modules.agenda.application.queries import AgendaCatalogQueryService
from app.modules.agenda.schemas.agenda_schemas import (
    AgendaRoleResponse, SessionTypeResponse, RoomTypeResponse, TrackTypeResponse
)

router = APIRouter(prefix="/agenda-catalogs", tags=["agenda-catalogs"])


@router.get("/roles", response_model=List[AgendaRoleResponse])
async def list_agenda_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AgendaRoleResponse]:
    del current_user
    rows = await AgendaCatalogQueryService(db).list_roles()
    return [AgendaRoleResponse.model_validate(row) for row in rows]


@router.get("/session-types", response_model=List[SessionTypeResponse])
async def list_session_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[SessionTypeResponse]:
    rows = await AgendaCatalogQueryService(db).list_session_types(
        organization_id=current_user.organization_id
    )
    return [SessionTypeResponse.model_validate(row) for row in rows]


@router.get("/room-types", response_model=List[RoomTypeResponse])
async def list_room_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[RoomTypeResponse]:
    rows = await AgendaCatalogQueryService(db).list_room_types(
        organization_id=current_user.organization_id
    )
    return [RoomTypeResponse.model_validate(row) for row in rows]


@router.get("/track-types", response_model=List[TrackTypeResponse])
async def list_track_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[TrackTypeResponse]:
    rows = await AgendaCatalogQueryService(db).list_track_types(
        organization_id=current_user.organization_id
    )
    return [TrackTypeResponse.model_validate(row) for row in rows]
