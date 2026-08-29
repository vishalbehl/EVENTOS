import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
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
from app.modules.agenda.services.agenda_service import AgendaService

router = APIRouter(prefix="/events/{event_id}", tags=["agenda"])


# ── FULL AGENDA SNAPSHOT ─────────────────────────────────────────────────────
@router.get("/agenda/snapshot", response_model=AgendaSnapshotResponse)
@router.get("/agenda-builder-snapshot", response_model=AgendaSnapshotResponse)
async def get_agenda_snapshot(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgendaSnapshotResponse:
    # Ensure default agenda exists for the event
    await AgendaService.get_or_create_default_agenda(db, event)
    return await AgendaService.get_full_snapshot(db, event.id)


# ── MASTER AGENDAS CRUD ──────────────────────────────────────────────────────
@router.get("/agendas", response_model=List[AgendaResponse])
async def list_agendas(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AgendaResponse]:
    # Ensure at least default agenda exists
    await AgendaService.get_or_create_default_agenda(db, event)
    res = await db.execute(select(Agenda).where(Agenda.event_id == event.id).order_by(Agenda.created_at))
    return [AgendaResponse.model_validate(a) for a in res.scalars().all()]


@router.post("/agendas", response_model=AgendaResponse, status_code=status.HTTP_201_CREATED)
async def create_agenda(
    payload: AgendaCreate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgendaResponse:
    agenda = Agenda(
        id=uuid.uuid4(),
        event_id=event.id,
        name=payload.name,
        code=payload.code or f"AGENDA-{str(event.id)[:4].upper()}",
        description=payload.description,
        timezone=payload.timezone or event.timezone or "UTC",
        status=payload.status,
    )
    db.add(agenda)
    await db.commit()
    await db.refresh(agenda)
    return AgendaResponse.model_validate(agenda)


# ── AGENDA DAYS CRUD ─────────────────────────────────────────────────────────
@router.get("/agenda-days", response_model=List[AgendaDayResponse])
async def list_agenda_days(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AgendaDayResponse]:
    agenda = await AgendaService.get_or_create_default_agenda(db, event)
    res = await db.execute(
        select(AgendaDay)
        .where(AgendaDay.agenda_id == agenda.id)
        .order_by(AgendaDay.sort_order, AgendaDay.date)
    )
    return [AgendaDayResponse.model_validate(d) for d in res.scalars().all()]


@router.post("/agenda-days", response_model=AgendaDayResponse, status_code=status.HTTP_201_CREATED)
async def create_agenda_day(
    payload: AgendaDayCreate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgendaDayResponse:
    agenda = await AgendaService.get_or_create_default_agenda(db, event)
    day = AgendaDay(
        id=uuid.uuid4(),
        agenda_id=payload.agenda_id or agenda.id,
        day_number=payload.day_number,
        name=payload.name,
        date=payload.date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        timezone=payload.timezone,
        status=payload.status,
        sort_order=payload.sort_order,
    )
    db.add(day)
    await db.commit()
    await db.refresh(day)
    return AgendaDayResponse.model_validate(day)


@router.patch("/agenda-days/{day_id}", response_model=AgendaDayResponse)
async def update_agenda_day(
    day_id: uuid.UUID,
    payload: AgendaDayUpdate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgendaDayResponse:
    res = await db.execute(select(AgendaDay).where(AgendaDay.id == day_id))
    day = res.scalar_one_or_none()
    if not day:
        raise HTTPException(status_code=404, detail="Agenda day not found.")

    update_data = payload.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(day, k, v)

    await db.commit()
    await db.refresh(day)
    return AgendaDayResponse.model_validate(day)


@router.delete("/agenda-days/{day_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agenda_day(
    day_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(AgendaDay).where(AgendaDay.id == day_id))
    day = res.scalar_one_or_none()
    if not day:
        raise HTTPException(status_code=404, detail="Agenda day not found.")

    await db.delete(day)
    await db.commit()
    return None
