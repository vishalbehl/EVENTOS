"""Transaction-owning commands for search operations."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.search.models.search import SearchJob


class SearchCommandService:
    """Create and dispatch durable search indexing commands."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def trigger_reindex(self, *, organization_id, entity_types: list[str] | None, reason: str, idempotency_key: str, actor: User) -> SearchJob:
        org = await self.db.scalar(
            select(Organization).where(Organization.id == organization_id).execution_options(skip_tenant_filter=True)
        )
        if org is None:
            raise HTTPException(status_code=404, detail={"code": "ORGANIZATION_NOT_FOUND", "message": "Organization not found."})

        existing = await self.db.scalar(
            select(SearchJob).where(
                SearchJob.organization_id == organization_id,
                SearchJob.idempotency_key == idempotency_key,
            ).execution_options(skip_tenant_filter=True)
        )
        if existing is not None:
            return existing

        try:
            async with TenantContextGuard.scoped(self.db, organization_id):
                job = SearchJob(
                    id=uuid.uuid4(),
                    organization_id=organization_id,
                    status="pending",
                    entity_types=entity_types,
                    records_processed=0,
                    requested_by=actor.id,
                    request_reason=reason,
                    idempotency_key=idempotency_key,
                    queued_at=datetime.now(timezone.utc),
                )
                self.db.add(job)
                await self.db.flush()
                self.db.add(AuditLog(
                    organization_id=organization_id,
                    actor_user_id=actor.id,
                    actor_role=actor.platform_role or actor.role,
                    resource_type="search_job",
                    resource_id=job.id,
                    action_type="SEARCH_REINDEX_REQUESTED",
                    new_state={"reason": reason, "idempotency_key": idempotency_key, "entity_types": entity_types},
                    is_sensitive=True,
                ))
                await self.db.commit()
                await self.db.refresh(job)

            try:
                from app.worker import celery_app
                celery_app.send_task(
                    "workers.tasks.search_tasks.reindex_organization",
                    kwargs={"org_id": str(organization_id), "job_id": str(job.id), "entity_types": entity_types},
                    queue="search",
                )
            except Exception:
                # Durable job state remains authoritative if dispatch is temporarily unavailable.
                pass
            return job
        except Exception:
            await self.db.rollback()
            raise
