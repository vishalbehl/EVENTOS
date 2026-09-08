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
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.dependencies import DB, SuperAdminOnly, get_current_user
from app.modules.identity.models.user import User
from app.modules.audit.application.queries import AuditQueryService
from app.schemas.cursor_pagination import CursorPage, bounded_page_size, decode_cursor, encode_cursor

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
    logs, total = await AuditQueryService(db).list_worker_logs(page=page, page_size=page_size)

    return {
        "items": [WorkerLogOut.model_validate(l).model_dump() for l in logs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/worker-logs/page", response_model=CursorPage[WorkerLogOut])
async def list_worker_logs_cursor(
    _: SuperAdminOnly,
    db: DB,
    page_size: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = Query(None, max_length=512),
) -> CursorPage[WorkerLogOut]:
    position = decode_cursor(cursor) if cursor else None
    rows, has_next = await AuditQueryService(db).list_worker_logs_cursor(
        cursor_time=position.occurred_at if position else None,
        cursor_id=position.record_id if position else None,
        limit=bounded_page_size(page_size, maximum=100),
    )
    next_cursor = encode_cursor(rows[-1].queued_at, rows[-1].id) if has_next and rows else None
    return CursorPage(items=[WorkerLogOut.model_validate(row) for row in rows], next_cursor=next_cursor, has_next=has_next)


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
    del db, severity, page, page_size
    raise HTTPException(
        status_code=410,
        detail={
            "code": "SECURITY_LOG_TABLE_RETIRED",
            "message": "Legacy security_logs were removed from the revised audit schema.",
        },
    )


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
    changes, total = await AuditQueryService(db).list_system_changes(
        entity_type=entity_type, page=page, page_size=page_size
    )

    return {
        "items": [SystemChangeOut.model_validate(c).model_dump() for c in changes],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/system-changes/page", response_model=CursorPage[SystemChangeOut])
async def list_system_changes_cursor(
    _: SuperAdminOnly,
    db: DB,
    entity_type: Optional[str] = Query(None),
    page_size: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = Query(None, max_length=512),
) -> CursorPage[SystemChangeOut]:
    position = decode_cursor(cursor) if cursor else None
    rows, has_next = await AuditQueryService(db).list_system_changes_cursor(
        entity_type=entity_type,
        cursor_time=position.occurred_at if position else None,
        cursor_id=position.record_id if position else None,
        limit=bounded_page_size(page_size, maximum=100),
    )
    next_cursor = encode_cursor(rows[-1].created_at, rows[-1].id) if has_next and rows else None
    return CursorPage(items=[SystemChangeOut.model_validate(row) for row in rows], next_cursor=next_cursor, has_next=has_next)


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
    logs, total = await AuditQueryService(db).list_user_activity(
        actor_user_id=current_user.id,
        organization_id=current_user.organization_id,
        page=page,
        page_size=page_size,
    )

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


@router.get("/my-activity/page", response_model=CursorPage[dict])
async def get_my_activity_cursor(
    db: DB,
    current_user: User = Depends(get_current_user),
    page_size: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = Query(None, max_length=512),
) -> CursorPage[dict]:
    position = decode_cursor(cursor) if cursor else None
    rows, has_next = await AuditQueryService(db).list_user_activity_cursor(
        actor_user_id=current_user.id,
        organization_id=current_user.organization_id,
        cursor_time=position.occurred_at if position else None,
        cursor_id=position.record_id if position else None,
        limit=bounded_page_size(page_size, maximum=100),
    )
    items = [{
        "id": str(log.id), "request_id": str(log.request_id) if log.request_id else None,
        "correlation_id": str(log.correlation_id) if log.correlation_id else None,
        "organization_id": str(log.organization_id) if log.organization_id else None,
        "actor_user_id": str(log.actor_user_id) if log.actor_user_id else None,
        "resource_type": log.resource_type, "resource_id": str(log.resource_id) if log.resource_id else None,
        "action_type": log.action_type, "actor_role": log.actor_role, "actor_ip": log.actor_ip,
        "actor_user_agent": log.actor_user_agent, "geo_location": log.geo_location,
        "row_hash": log.row_hash, "occurred_at": log.occurred_at.isoformat() if log.occurred_at else None,
        "retention_until": log.retention_until.isoformat() if log.retention_until else None,
        "is_sensitive": log.is_sensitive, "impersonated_by": str(log.impersonated_by) if log.impersonated_by else None,
    } for log in rows]
    next_cursor = encode_cursor(rows[-1].occurred_at, rows[-1].id) if has_next and rows else None
    return CursorPage(items=items, next_cursor=next_cursor, has_next=has_next)
