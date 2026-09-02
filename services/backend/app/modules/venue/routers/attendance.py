# backend/app/routers/attendance.py
from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, CurrentEvent
from app.core.dependencies.feature_gate import require_event_operation
from app.modules.identity.models.user import User
from app.modules.analytics.services.projection_dispatch import enqueue_event_attendance_projection_refresh
from app.modules.venue.application.commands import AttendanceCommandService
from app.modules.venue.application.queries import AttendanceQueryService
from app.modules.venue.schemas.attendance import (
    CheckInRequest,
    CheckOutRequest,
    AttendanceLogResponse,
    AttendanceMetricsResponse,
)

router = APIRouter(prefix="/events/{event_id}/attendance", tags=["attendance"], dependencies=[require_event_operation("registration.checkin")])


@router.post("/checkin", response_model=AttendanceLogResponse, status_code=status.HTTP_201_CREATED)
async def check_in_participant(
    payload: CheckInRequest,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db)
):
    """
    Check in a participant to a session. Enforces session and room capacity constraints,
    updates both legacy check_ins and new attendance_logs.
    """
    log = await AttendanceCommandService(db).check_in(
        event=event, actor=actor, payload=payload, idempotency_key=idempotency_key
    )
    enqueue_event_attendance_projection_refresh(
        organization_id=event.organization_id, event_id=event.id
    )
    return log


@router.post("/checkout", response_model=AttendanceLogResponse)
async def check_out_participant(
    payload: CheckOutRequest,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db)
):
    """
    Check out a participant from a session, logging duration.
    """
    log = await AttendanceCommandService(db).check_out(
        event=event, actor=actor, payload=payload, idempotency_key=idempotency_key
    )
    enqueue_event_attendance_projection_refresh(
        organization_id=event.organization_id, event_id=event.id
    )
    return log


@router.get("", response_model=List[AttendanceLogResponse])
async def list_attendance_logs(
    event: CurrentEvent,
    session_id: Optional[uuid.UUID] = Query(None),
    participant_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    List all attendance logs, optionally filtered by session or participant.
    """
    return await AttendanceQueryService(db).list_logs(
        organization_id=event.organization_id,
        event_id=event.id,
        session_id=session_id,
        participant_id=participant_id,
    )


@router.get("/metrics", response_model=AttendanceMetricsResponse)
async def get_attendance_metrics(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve attendance metrics, rate percentages, no-show rates, and session occupancies.
    """
    return AttendanceMetricsResponse(**await AttendanceQueryService(db).metrics(
        organization_id=event.organization_id,
        event_id=event.id,
    ))
