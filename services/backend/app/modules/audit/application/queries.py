"""Read-only query services for the audit and operations screens."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.modules.audit.models.api_request_log import WorkerJobLog
from app.modules.audit.models.audit_domain_tables import SystemChange
from app.modules.audit.models.audit_log import AuditLog


class AuditQueryService:
    """Bounded audit reads; this service never mutates or commits."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    @classmethod
    def _page_size(cls, page_size: int) -> int:
        return max(1, min(page_size, cls.MAX_PAGE_SIZE))

    async def list_worker_logs(self, *, page: int, page_size: int) -> tuple[list[WorkerJobLog], int]:
        bounded = self._page_size(page_size)
        total = int(await self.db.scalar(select(func.count()).select_from(WorkerJobLog)) or 0)
        logs = list((await self.db.scalars(
            select(WorkerJobLog)
            .options(load_only(
                WorkerJobLog.id,
                WorkerJobLog.job_id,
                WorkerJobLog.task_name,
                WorkerJobLog.queue,
                WorkerJobLog.status,
                WorkerJobLog.exception,
                WorkerJobLog.stack_trace,
                WorkerJobLog.retry_count,
                WorkerJobLog.queued_at,
                WorkerJobLog.started_at,
                WorkerJobLog.finished_at,
            ))
            .order_by(WorkerJobLog.queued_at.desc(), WorkerJobLog.id.desc())
            .offset((max(1, page) - 1) * bounded)
            .limit(bounded)
        )).all())
        return logs, total

    async def list_system_changes(
        self, *, entity_type: str | None, page: int, page_size: int
    ) -> tuple[list[SystemChange], int]:
        bounded = self._page_size(page_size)
        filters = [SystemChange.entity_type == entity_type] if entity_type else []
        total = int(await self.db.scalar(
            select(func.count()).select_from(SystemChange).where(*filters)
        ) or 0)
        changes = list((await self.db.scalars(
            select(SystemChange)
            .options(load_only(
                SystemChange.id,
                SystemChange.entity_type,
                SystemChange.change_type,
                SystemChange.changes,
                SystemChange.created_at,
            ))
            .where(*filters)
            .order_by(SystemChange.created_at.desc(), SystemChange.id.desc())
            .offset((max(1, page) - 1) * bounded)
            .limit(bounded)
        )).all())
        return changes, total

    async def list_user_activity(
        self,
        *,
        actor_user_id: uuid.UUID,
        organization_id: uuid.UUID | None,
        page: int,
        page_size: int,
        since: datetime | None = None,
    ) -> tuple[list[AuditLog], int]:
        bounded = self._page_size(page_size)
        cutoff = since or (datetime.now(timezone.utc) - timedelta(days=90))
        filters = [AuditLog.actor_user_id == actor_user_id, AuditLog.occurred_at >= cutoff]
        if organization_id is not None:
            filters.append(AuditLog.organization_id == organization_id)
        total = int(await self.db.scalar(
            select(func.count()).select_from(AuditLog).where(*filters)
        ) or 0)
        logs = list((await self.db.scalars(
            select(AuditLog)
            .options(load_only(
                AuditLog.id,
                AuditLog.request_id,
                AuditLog.correlation_id,
                AuditLog.organization_id,
                AuditLog.actor_user_id,
                AuditLog.resource_type,
                AuditLog.resource_id,
                AuditLog.action_type,
                AuditLog.actor_role,
                AuditLog.actor_ip,
                AuditLog.actor_user_agent,
                AuditLog.geo_location,
                AuditLog.row_hash,
                AuditLog.occurred_at,
                AuditLog.retention_until,
                AuditLog.is_sensitive,
                AuditLog.impersonated_by,
            ))
            .where(*filters)
            .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
            .offset((max(1, page) - 1) * bounded)
            .limit(bounded)
        )).all())
        return logs, total

    async def list_organization_activity(
        self,
        *,
        organization_id: uuid.UUID,
        resource_type: str | None,
        resource_types: list[str] | None,
        page: int,
        page_size: int,
    ) -> tuple[list[AuditLog], int]:
        """Return a bounded organization audit page with stable ordering."""
        bounded = self._page_size(page_size)
        filters = [AuditLog.organization_id == organization_id]
        if resource_type:
            filters.append(AuditLog.resource_type == resource_type)
        elif resource_types:
            filters.append(AuditLog.resource_type.in_(resource_types))
        total = int(await self.db.scalar(
            select(func.count()).select_from(AuditLog).where(*filters)
        ) or 0)
        logs = list((await self.db.scalars(
            select(AuditLog)
            .options(load_only(
                AuditLog.id,
                AuditLog.resource_type,
                AuditLog.resource_id,
                AuditLog.action_type,
                AuditLog.actor_role,
                AuditLog.occurred_at,
                AuditLog.is_sensitive,
            ))
            .where(*filters)
            .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
            .offset((max(1, page) - 1) * bounded)
            .limit(bounded)
        )).all())
        return logs, total
