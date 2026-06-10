# =============================================================
# Conference Platform — Audit Router
# app/modules/audit/routers/audit.py
#
# Super Admin read-only endpoints for the platform audit trail.
# Includes: worker error logs, security events, system changes.
# =============================================================

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import DB, SuperAdminOnly, get_current_user
from app.modules.identity.models.user import User
from app.modules.audit.models.audit_extensions import WorkerJobLog
from app.modules.audit.models.audit_domain_tables import (
    SecurityLog,
    SystemChange,
    DataExport,
)

router = APIRouter(prefix="/audit", tags=["audit"])


# ── Pydantic Response Schemas ─────────────────────────────────

class WorkerLogOut(BaseModel):
    id: uuid.UUID
    job_id: str                    # Celery task ID
    task_name: str
    queue: str
    status: str
    exception: Optional[str] = None
    stack_trace: Optional[str] = None
    retry_count: int = 0
    queued_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SecurityLogOut(BaseModel):
    id: uuid.UUID
    event_type: str
    severity: str
    log_metadata: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class SystemChangeOut(BaseModel):
    id: uuid.UUID
    entity_type: str
    change_type: str
    changes: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int


# ── Worker Error Logs ─────────────────────────────────────────

@router.get(
    "/worker-logs",
    summary="Background job error audit logs (Super Admin)",
)
async def list_worker_logs(
    _: SuperAdminOnly,
    db: DB,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    """
    Returns background worker job failure records from the audit trail.
    These are written when Celery tasks fail after all retries.
    """
    total = await db.scalar(
        select(func.count()).select_from(WorkerJobLog)
    ) or 0

    result = await db.execute(
        select(WorkerJobLog)
        .order_by(WorkerJobLog.logged_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    logs = result.scalars().all()

    return {
        "items": [WorkerLogOut.model_validate(l).model_dump() for l in logs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ── Security Logs ─────────────────────────────────────────────

@router.get(
    "/security-logs",
    summary="Security event timeline (Super Admin)",
)
async def list_security_logs(
    _: SuperAdminOnly,
    db: DB,
    severity: Optional[str] = Query(None, description="Filter by severity: info | warning | critical"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    """
    Returns platform security events (login anomalies, failed auth attempts,
    permission violations) for the Super Admin security dashboard.
    """
    filters = []
    if severity:
        filters.append(SecurityLog.severity == severity)

    total = await db.scalar(
        select(func.count()).select_from(SecurityLog).where(*filters)
    ) or 0

    result = await db.execute(
        select(SecurityLog)
        .where(*filters)
        .order_by(SecurityLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    logs = result.scalars().all()

    return {
        "items": [SecurityLogOut.model_validate(l).model_dump() for l in logs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ── System Change Logs ────────────────────────────────────────

@router.get(
    "/system-changes",
    summary="Platform configuration change history (Super Admin)",
)
async def list_system_changes(
    _: SuperAdminOnly,
    db: DB,
    entity_type: Optional[str] = Query(None, description="Filter by entity type e.g. organization, plan, user"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    """
    Returns platform configuration changes: organization creation/deletion,
    plan modifications, feature flag overrides, etc.
    """
    filters = []
    if entity_type:
        filters.append(SystemChange.entity_type == entity_type)

    total = await db.scalar(
        select(func.count()).select_from(SystemChange).where(*filters)
    ) or 0

    result = await db.execute(
        select(SystemChange)
        .where(*filters)
        .order_by(SystemChange.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    changes = result.scalars().all()

    return {
        "items": [SystemChangeOut.model_validate(c).model_dump() for c in changes],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ── Organizer/User Activity Log ────────────────────────────────

@router.get(
    "/my-activity",
    summary="Get current user's audit activity (Organizer/User dashboard)",
)
async def get_my_activity(
    db: DB,
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    """
    Returns the audit logs associated with the current user (actor_user_id) within the last 90 days.
    Does not expose old_state, new_state, or diff.
    """
    from app.modules.audit.models.audit_log import AuditLog
    from datetime import datetime, timezone, timedelta

    ninety_days_ago = datetime.now(timezone.utc) - timedelta(days=90)

    filters = [
        AuditLog.actor_user_id == current_user.id,
        AuditLog.occurred_at >= ninety_days_ago
    ]

    total = await db.scalar(
        select(func.count()).select_from(AuditLog).where(*filters)
    ) or 0

    result = await db.execute(
        select(AuditLog)
        .where(*filters)
        .order_by(AuditLog.occurred_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    logs = result.scalars().all()

    items = []
    for log in logs:
        items.append({
            "id": str(log.id),
            "request_id": str(log.request_id) if log.request_id else None,
            "correlation_id": str(log.correlation_id) if log.correlation_id else None,
            "organization_id": str(log.organization_id) if log.organization_id else None,
            "actor_user_id": str(log.actor_user_id) if log.actor_user_id else None,
            "resource_type": log.resource_type,
            "resource_id": str(log.resource_id) if log.resource_id else None,
            "action_type": log.action_type,
            "actor_role": log.actor_role,
            "actor_ip": log.actor_ip,
            "actor_user_agent": log.actor_user_agent,
            "geo_location": log.geo_location,
            "row_hash": log.row_hash,
            "occurred_at": log.occurred_at.isoformat() if log.occurred_at else None,
            "retention_until": log.retention_until.isoformat() if log.retention_until else None,
            "is_sensitive": log.is_sensitive,
            "impersonated_by": str(log.impersonated_by) if log.impersonated_by else None,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }
