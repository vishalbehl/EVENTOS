# backend/app/modules/analytics/routers/dashboard.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, case, or_, Date, distinct
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db, get_current_user
from app.modules.identity.models.user import User
from app.modules.events.models.event import Event
from app.modules.agenda.models import Session
from app.modules.events.models.speaker import Speaker
from app.modules.agenda.models import SessionPerson as SessionSpeaker
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.presentations.models.file_validation import FileValidation
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.venue.models.room_device import RoomDevice
from app.modules.analytics.application.queries import AnalyticsDashboardQueryService
from app.modules.agenda.models import Room

router = APIRouter(prefix="/dashboard", tags=["dashboard_analytics"])


async def _get_accessible_event(
    db: AsyncSession,
    current_user: User,
    event_id: uuid.UUID,
) -> Event:
    event = await AnalyticsDashboardQueryService(db).get_event_for_scope(
        event_id=event_id,
        organization_id=current_user.organization_id,
        is_platform_admin=current_user.role == "super_admin",
    )
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {event_id} not found",
        )

    return event


@router.get("/summary")
async def get_dashboard_summary(
    event_id: uuid.UUID = Query(..., description="The event ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Calculates all 5 pre-event readiness scorecards and dynamic overview stats."""
    event = await _get_accessible_event(db, current_user, event_id)
    return await AnalyticsDashboardQueryService(db).summary(event=event)


@router.get("/registrations/timeline")
async def get_registrations_timeline(
    event_id: uuid.UUID = Query(..., description="The event ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Daily cumulative registrations for the last 30 days plus linear projection to start date."""
    event = await _get_accessible_event(db, current_user, event_id)
    return await AnalyticsDashboardQueryService(db).registrations_timeline(event=event)


@router.get("/roles-breakdown")
async def get_roles_breakdown(
    event_id: uuid.UUID = Query(..., description="The event ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Role distribution count for DonutChart."""
    await _get_accessible_event(db, current_user, event_id)
    return await AnalyticsDashboardQueryService(db).roles_breakdown(event_id=event_id)


@router.get("/pending-actions")
async def get_pending_actions(
    event_id: uuid.UUID = Query(..., description="The event ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Auto-generates critical organizer tasks."""
    event = await _get_accessible_event(db, current_user, event_id)
    return await AnalyticsDashboardQueryService(db).pending_actions(event=event)


@router.get("/recent-activity")
async def get_recent_activity(
    event_id: uuid.UUID = Query(..., description="The event ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Activity counts grouped by hour for the last 24h."""
    await _get_accessible_event(db, current_user, event_id)
    return await AnalyticsDashboardQueryService(db).recent_activity(event_id=event_id)


@router.get("/deadlines")
async def get_upcoming_deadlines(
    event_id: uuid.UUID = Query(..., description="The event ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upcoming upload and custom deadlines."""
    event = await _get_accessible_event(db, current_user, event_id)
    return await AnalyticsDashboardQueryService(db).upcoming_deadlines(event=event)


# =============================================================
# Super Admin Platform Dashboard Endpoints
# Added below existing event-scoped routes.
# All three endpoints require SUPER_ADMIN via require_super_admin.
# =============================================================

from app.modules.superadmin.dependencies import require_super_admin
from app.modules.analytics.schemas.analytics import (
    PlatformOverviewResponse,
    MrrDataPoint,
    PlatformActivityItem,
)


@router.get(
    "/superadmin/overview",
    response_model=PlatformOverviewResponse,
    summary="Super Admin — Platform KPI Overview",
    tags=["superadmin-dashboard"],
)
async def get_superadmin_overview(
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return platform-wide KPIs through the analytics query service."""
    values = await AnalyticsDashboardQueryService(db).superadmin_overview()
    return PlatformOverviewResponse.model_validate(values)

@router.get(
    "/superadmin/mrr-history",
    response_model=List[MrrDataPoint],
    summary="Super Admin — MRR/ARR Monthly History",
    tags=["superadmin-dashboard"],
)
async def get_superadmin_mrr_history(
    months: int = Query(default=12, ge=1, le=36, description="Number of months of history"),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns monthly MRR and ARR history for the platform-level area chart.

    Strategy:
      1. Try commerce.revenue_metrics table first (pre-aggregated, accurate).
      2. If empty, compute from commerce.subscription_transactions grouped by month.
    """
    rows = await AnalyticsDashboardQueryService(db).superadmin_mrr_history(months=months)
    return [MrrDataPoint.model_validate(row) for row in rows]


@router.get(
    "/superadmin/activity-feed",
    response_model=List[PlatformActivityItem],
    summary="Super Admin — Platform Activity Feed",
    tags=["superadmin-dashboard"],
)
async def get_superadmin_activity_feed(
    limit: int = Query(default=20, ge=1, le=100, description="Number of activity items"),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return recent platform activity from the authoritative timeline."""
    rows = await AnalyticsDashboardQueryService(db).superadmin_activity_feed(limit=limit)
    return [PlatformActivityItem.model_validate(row) for row in rows]
