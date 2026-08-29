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

from app.core.tenant_context import TenantContextGuard
from app.dependencies import get_db
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.search.models.search import SearchJob
from app.modules.superadmin.dependencies import require_super_admin


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
    stmt = select(SearchJob).execution_options(skip_tenant_filter=True)
    count_stmt = select(func.count(SearchJob.id)).execution_options(skip_tenant_filter=True)

    if organization_id is not None:
        stmt = stmt.where(SearchJob.organization_id == organization_id)
        count_stmt = count_stmt.where(SearchJob.organization_id == organization_id)

    total = (await db.scalar(count_stmt)) or 0

    stmt = (
        stmt.order_by(desc(SearchJob.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    jobs = list((await db.scalars(stmt)).all())

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
    # Validate organization exists
    org = await db.scalar(
        select(Organization)
        .where(Organization.id == body.organization_id)
        .execution_options(skip_tenant_filter=True)
    )

    if org is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "ORGANIZATION_NOT_FOUND", "message": "Organization not found."},
        )

    # Check idempotency
    existing = await db.scalar(
        select(SearchJob)
        .where(
            SearchJob.organization_id == body.organization_id,
            SearchJob.idempotency_key == idempotency_key,
        )
        .execution_options(skip_tenant_filter=True)
    )
    if existing is not None:
        return SearchJobOut.model_validate(existing)

    async with TenantContextGuard.scoped(db, body.organization_id):
        job = SearchJob(
            id=uuid.uuid4(),
            organization_id=body.organization_id,
            status="pending",
            entity_types=body.entity_types,
            records_processed=0,
            requested_by=actor.id,
            request_reason=body.reason,
            idempotency_key=idempotency_key,
            queued_at=datetime.now(timezone.utc),
        )
        db.add(job)
        await db.flush()

        _audit(
            db=db,
            actor=actor,
            org_id=body.organization_id,
            resource_type="search_job",
            resource_id=job.id,
            action="SEARCH_REINDEX_REQUESTED",
            reason=body.reason,
            state={
                "idempotency_key": idempotency_key,
                "entity_types": body.entity_types,
            },
        )

        await db.commit()
        await db.refresh(job)

        # Attempt to dispatch Celery worker task if available
        try:
            from app.worker import celery_app
            celery_app.send_task(
                "workers.tasks.search_tasks.reindex_organization",
                kwargs={
                    "org_id": str(body.organization_id),
                    "job_id": str(job.id),
                    "entity_types": body.entity_types,
                },
                queue="search",
            )
            logger.info(f"Dispatched search reindex task for job {job.id}")
        except Exception as exc:
            logger.warning(f"Could not dispatch async Celery search task (recorded in DB): {exc}")

        return SearchJobOut.model_validate(job)
