# =============================================================
# Conference Platform — Search Operations Router
# app/modules/search/router.py
# =============================================================

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.search.models.search import SearchJob
from app.modules.superadmin.dependencies import require_super_admin
from app.modules.search.application.commands import SearchCommandService
from app.modules.search.application.queries import SearchJobQueryService


router = APIRouter(prefix="/search", tags=["search"])


# ── Pydantic Schemas ──────────────────────────────────────────

class SearchJobOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    status: str
    entity_types: Optional[List[str]] = None
    records_processed: int = 0
    requested_by: Optional[uuid.UUID] = None
    request_reason: Optional[str] = None
    idempotency_key: Optional[str] = None
    predecessor_job_id: Optional[uuid.UUID] = None
    error_code: Optional[str] = None
    error_detail: Optional[str] = None
    queued_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedSearchJobs(BaseModel):
    items: List[SearchJobOut]
    total: int
    page: int
    page_size: int


class ReindexTriggerIn(BaseModel):
    organization_id: uuid.UUID
    entity_types: Optional[List[str]] = None
    reason: str = Field(min_length=12, max_length=1000)


def _audit(
    db: AsyncSession,
    actor: User,
    org_id: uuid.UUID,
    resource_type: str,
    resource_id: uuid.UUID,
    action: str,
    reason: str,
    state: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditLog(
            organization_id=org_id,
            actor_user_id=actor.id,
            actor_role=actor.platform_role or actor.role,
            resource_type=resource_type,
            resource_id=resource_id,
            action_type=action,
            new_state={"reason": reason, **(state or {})},
            is_sensitive=True,
        )
    )


# ── Search Indexing Jobs Endpoints ────────────────────────────

@router.get(
    "/jobs",
    response_model=PaginatedSearchJobs,
    summary="List search indexing jobs (Super Admin)",
    description="Super Admin only. Returns the history of all search reindex jobs, optionally filtered by organization.",
)
async def list_search_jobs(
    organization_id: Optional[uuid.UUID] = Query(None, description="Filter by organization"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
) -> PaginatedSearchJobs:
    total, jobs = await SearchJobQueryService(db).list_page(
        organization_id=organization_id,
        page=page,
        page_size=page_size,
    )

    return PaginatedSearchJobs(
        items=[SearchJobOut.model_validate(job) for job in jobs],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/reindex",
    response_model=SearchJobOut,
    status_code=202,
    summary="Trigger a full search reindex for an organization (Super Admin)",
    description="Super Admin only. Enqueues a full reindex job for the specified organization.",
)
async def trigger_reindex(
    body: ReindexTriggerIn,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_super_admin),
) -> SearchJobOut:
    job = await SearchCommandService(db).trigger_reindex(
        organization_id=body.organization_id,
        entity_types=body.entity_types,
        reason=body.reason,
        idempotency_key=idempotency_key,
        actor=actor,
    )
    return SearchJobOut.model_validate(job)
