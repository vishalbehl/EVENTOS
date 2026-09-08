import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, CurrentEvent, get_current_user
from app.modules.identity.models.user import User
from app.modules.agenda.models.agenda import Agenda
from app.modules.agenda.models.agenda_day import AgendaDay
from app.modules.agenda.schemas.agenda_schemas import (
    AgendaResponse, AgendaCreate, AgendaUpdate,
    AgendaDayResponse, AgendaDayCreate, AgendaDayUpdate,
    AgendaSnapshotResponse
)
from app.modules.agenda.application.queries import AgendaQueryService
from app.modules.agenda.application.commands import AgendaCommandService
from app.core.concurrency import require_if_match

router = APIRouter(prefix="/events/{event_id}", tags=["agenda"])


# ── FULL AGENDA SNAPSHOT ─────────────────────────────────────────────────────
@router.get("/agenda/snapshot", response_model=AgendaSnapshotResponse)
@router.get("/agenda-builder-snapshot", response_model=AgendaSnapshotResponse)
async def get_agenda_snapshot(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgendaSnapshotResponse:
    # Reads must not create or commit agenda state.
    return await AgendaQueryService(db).full_snapshot(
        organization_id=event.organization_id, event_id=event.id
    )


# ── MASTER AGENDAS CRUD ──────────────────────────────────────────────────────
@router.get("/agendas", response_model=List[AgendaResponse])
async def list_agendas(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AgendaResponse]:
    agendas = await AgendaQueryService(db).list_for_event(
        organization_id=event.organization_id, event_id=event.id
    )
    return [AgendaResponse.model_validate(a) for a in agendas]


@router.post("/agendas", response_model=AgendaResponse, status_code=status.HTTP_201_CREATED)
async def create_agenda(
    payload: AgendaCreate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> AgendaResponse:
    return await AgendaCommandService.create_agenda(
        db, event=event, payload=payload, actor_user_id=current_user.id,
        idempotency_key=idempotency_key or f"agenda-create:{uuid.uuid4()}",
    )


# ── AGENDA DAYS CRUD ─────────────────────────────────────────────────────────
@router.get("/agenda-days", response_model=List[AgendaDayResponse])
async def list_agenda_days(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AgendaDayResponse]:
    days = await AgendaQueryService(db).list_days_for_event(
        organization_id=event.organization_id, event_id=event.id
    )
    return [AgendaDayResponse.model_validate(d) for d in days]


@router.post("/agenda-days", response_model=AgendaDayResponse, status_code=status.HTTP_201_CREATED)
async def create_agenda_day(
    payload: AgendaDayCreate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> AgendaDayResponse:
    return await AgendaCommandService.create_day(
        db, event=event, payload=payload, actor_user_id=current_user.id,
        idempotency_key=idempotency_key or f"agenda-day-create:{uuid.uuid4()}",
    )


@router.patch("/agenda-days/{day_id}", response_model=AgendaDayResponse)
async def update_agenda_day(
    day_id: uuid.UUID,
    payload: AgendaDayUpdate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> AgendaDayResponse:
    expected_version = require_if_match(if_match) if if_match is not None else None
    return await AgendaCommandService.update_day(
        db, event=event, day_id=day_id, payload=payload,
        actor_user_id=current_user.id, expected_version=expected_version,
        idempotency_key=idempotency_key,
    )


@router.delete("/agenda-days/{day_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agenda_day(
    day_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
):
    expected_version = require_if_match(if_match) if if_match is not None else None
    await AgendaCommandService.delete_day(
        db, event=event, day_id=day_id, actor_user_id=current_user.id,
        expected_version=expected_version, idempotency_key=idempotency_key,
    )
    return None
