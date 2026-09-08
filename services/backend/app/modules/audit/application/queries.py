"""Read-only query services for the audit and operations screens."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, load_only

from app.modules.audit.models.api_request_log import WorkerJobLog
from app.modules.audit.models.audit_domain_tables import SystemChange
from app.modules.audit.models.audit_log import AuditLog
from app.modules.audit.models.audit_domain_tables import ImpersonationLog
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization


class AuditQueryService:
    """Bounded audit reads; this service never mutates or commits."""

    MAX_PAGE_SIZE = 100
    MAX_EXPORT_ROWS = 10_000

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

    async def list_worker_logs_cursor(
        self, *, cursor_time: datetime | None, cursor_id: uuid.UUID | None, limit: int
    ) -> tuple[list[WorkerJobLog], bool]:
        """Return one bounded, deterministically ordered worker-log page."""
        bounded = min(max(limit, 1), self.MAX_PAGE_SIZE)
        filters = []
        if cursor_time is not None and cursor_id is not None:
            filters.append(or_(
                WorkerJobLog.queued_at < cursor_time,
                and_(WorkerJobLog.queued_at == cursor_time, WorkerJobLog.id < cursor_id),
            ))
        rows = list((await self.db.scalars(
            select(WorkerJobLog).options(load_only(
                WorkerJobLog.id, WorkerJobLog.job_id, WorkerJobLog.task_name,
                WorkerJobLog.queue, WorkerJobLog.status, WorkerJobLog.exception,
                WorkerJobLog.stack_trace, WorkerJobLog.retry_count,
                WorkerJobLog.queued_at, WorkerJobLog.started_at, WorkerJobLog.finished_at,
            )).where(*filters)
            .order_by(WorkerJobLog.queued_at.desc(), WorkerJobLog.id.desc())
            .limit(bounded + 1)
        )).all())
        return rows[:bounded], len(rows) > bounded

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

    async def list_system_changes_cursor(
        self, *, entity_type: str | None, cursor_time: datetime | None,
        cursor_id: uuid.UUID | None, limit: int
    ) -> tuple[list[SystemChange], bool]:
        """Return one bounded, deterministically ordered system-change page."""
        bounded = min(max(limit, 1), self.MAX_PAGE_SIZE)
        filters = [SystemChange.entity_type == entity_type] if entity_type else []
        if cursor_time is not None and cursor_id is not None:
            filters.append(or_(
                SystemChange.created_at < cursor_time,
                and_(SystemChange.created_at == cursor_time, SystemChange.id < cursor_id),
            ))
        rows = list((await self.db.scalars(
            select(SystemChange).options(load_only(
                SystemChange.id, SystemChange.entity_type, SystemChange.change_type,
                SystemChange.changes, SystemChange.created_at,
            )).where(*filters)
            .order_by(SystemChange.created_at.desc(), SystemChange.id.desc())
            .limit(bounded + 1)
        )).all())
        return rows[:bounded], len(rows) > bounded

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

    async def list_user_activity_cursor(
        self, *, actor_user_id: uuid.UUID, organization_id: uuid.UUID | None,
        cursor_time: datetime | None, cursor_id: uuid.UUID | None, limit: int,
        since: datetime | None = None,
    ) -> tuple[list[AuditLog], bool]:
        """Return a bounded cursor page for the current user's recent activity."""
        bounded = min(max(limit, 1), self.MAX_PAGE_SIZE)
        cutoff = since or (datetime.now(timezone.utc) - timedelta(days=90))
        filters = [AuditLog.actor_user_id == actor_user_id, AuditLog.occurred_at >= cutoff]
        if organization_id is not None:
            filters.append(AuditLog.organization_id == organization_id)
        if cursor_time is not None and cursor_id is not None:
            filters.append(or_(
                AuditLog.occurred_at < cursor_time,
                and_(AuditLog.occurred_at == cursor_time, AuditLog.id < cursor_id),
            ))
        rows = list((await self.db.scalars(
            select(AuditLog).options(load_only(
                AuditLog.id, AuditLog.request_id, AuditLog.correlation_id,
                AuditLog.organization_id, AuditLog.actor_user_id,
                AuditLog.resource_type, AuditLog.resource_id, AuditLog.action_type,
                AuditLog.actor_role, AuditLog.actor_ip, AuditLog.actor_user_agent,
                AuditLog.geo_location, AuditLog.row_hash, AuditLog.occurred_at,
                AuditLog.retention_until, AuditLog.is_sensitive, AuditLog.impersonated_by,
            )).where(*filters)
            .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
            .limit(bounded + 1)
        )).all())
        return rows[:bounded], len(rows) > bounded

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

    async def list_organization_export(
        self, *, organization_id: uuid.UUID, resource_types: list[str] | None = None
    ) -> list[AuditLog]:
        """Return a bounded explicit audit projection for synchronous CSV export."""
        filters = [AuditLog.organization_id == organization_id]
        if resource_types:
            filters.append(AuditLog.resource_type.in_(resource_types))
        return list((await self.db.scalars(
            select(AuditLog)
            .options(load_only(
                AuditLog.id,
                AuditLog.occurred_at,
                AuditLog.action_type,
                AuditLog.resource_type,
                AuditLog.resource_id,
                AuditLog.actor_role,
                AuditLog.is_sensitive,
            ))
            .where(*filters)
            .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
            .limit(self.MAX_EXPORT_ROWS)
        )).all())

    async def list_organization_actions(
        self, *, organization_id: uuid.UUID, action_type: str,
        page: int, page_size: int,
    ) -> tuple[list[AuditLog], int]:
        """Return a bounded action-specific organization audit projection."""
        bounded = self._page_size(page_size)
        filters = [
            AuditLog.organization_id == organization_id,
            AuditLog.action_type == action_type,
        ]
        total = int(await self.db.scalar(
            select(func.count()).select_from(AuditLog).where(*filters)
        ) or 0)
        rows = list((await self.db.scalars(
            select(AuditLog).options(load_only(
                AuditLog.id, AuditLog.resource_id, AuditLog.action_type,
                AuditLog.new_state, AuditLog.occurred_at,
            )).where(*filters)
            .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
            .offset((max(1, page) - 1) * bounded)
            .limit(bounded)
        )).all())
        return rows, total

    async def list_organization_cursor(
        self,
        *,
        organization_id: uuid.UUID,
        cursor_time: datetime | None,
        cursor_id: uuid.UUID | None,
        limit: int,
        action_type: str | None = None,
        resource_type: str | None = None,
        actor_user_id: uuid.UUID | None = None,
        resource_id: uuid.UUID | None = None,
        sensitive: bool | None = None,
    ) -> tuple[list[AuditLog], bool]:
        """Return one bounded, tenant-scoped organization audit cursor page."""
        bounded = min(max(limit, 1), self.MAX_PAGE_SIZE)
        filters = [AuditLog.organization_id == organization_id]
        if action_type:
            filters.append(AuditLog.action_type == action_type)
        if resource_type:
            filters.append(AuditLog.resource_type == resource_type)
        if actor_user_id:
            filters.append(AuditLog.actor_user_id == actor_user_id)
        if resource_id:
            filters.append(AuditLog.resource_id == resource_id)
        if sensitive is not None:
            filters.append(AuditLog.is_sensitive.is_(sensitive))
        if cursor_time is not None and cursor_id is not None:
            filters.append(or_(
                AuditLog.occurred_at < cursor_time,
                and_(AuditLog.occurred_at == cursor_time, AuditLog.id < cursor_id),
            ))
        rows = list((await self.db.scalars(
            select(AuditLog).options(load_only(
                AuditLog.id, AuditLog.request_id, AuditLog.correlation_id,
                AuditLog.organization_id,
                AuditLog.actor_user_id, AuditLog.impersonated_by,
                AuditLog.actor_role, AuditLog.resource_type, AuditLog.resource_id,
                AuditLog.action_type, AuditLog.old_state, AuditLog.new_state,
                AuditLog.change_diff, AuditLog.actor_ip, AuditLog.is_sensitive,
                AuditLog.occurred_at, AuditLog.row_hash, AuditLog.hash_version,
            )).where(*filters)
            .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
            .limit(bounded + 1)
        )).all())
        return rows[:bounded], len(rows) > bounded

    async def get_organization_action(
        self, *, organization_id: uuid.UUID, resource_id: uuid.UUID, action_type: str
    ) -> AuditLog | None:
        """Load one tenant-owned audited resource snapshot for a download/read path."""
        return await self.db.scalar(
            select(AuditLog).options(load_only(
                AuditLog.id, AuditLog.resource_id, AuditLog.action_type,
                AuditLog.new_state, AuditLog.occurred_at,
            )).where(
                AuditLog.organization_id == organization_id,
                AuditLog.resource_id == resource_id,
                AuditLog.action_type == action_type,
            ).order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc()).limit(1)
        )

    async def list_organization_entitlement_history(
        self, *, organization_id: uuid.UUID, page: int, page_size: int
    ) -> tuple[list[AuditLog], int]:
        """Return the immutable commercial/entitlement history for one tenant."""
        resource_types = (
            "commercial_access_request", "organization_subscription", "organization_addon",
            "entitlement_grant", "entitlement_override", "plan_feature", "organization_feature",
        )
        condition = and_(
            AuditLog.organization_id == organization_id,
            or_(
                AuditLog.resource_type.in_(resource_types),
                AuditLog.action_type.ilike("%ENTITLEMENT%"),
                AuditLog.action_type.ilike("%SUBSCRIPTION%"),
                AuditLog.action_type.ilike("%ADDON%"),
                AuditLog.action_type.ilike("%COMMERCIAL_ACCESS%"),
            ),
        )
        bounded = self._page_size(page_size)
        total = int(await self.db.scalar(
            select(func.count()).select_from(AuditLog).where(condition)
        ) or 0)
        rows = list((await self.db.scalars(
            select(AuditLog).options(load_only(
                AuditLog.id, AuditLog.action_type, AuditLog.resource_type,
                AuditLog.resource_id, AuditLog.actor_user_id, AuditLog.actor_role,
                AuditLog.new_state, AuditLog.occurred_at,
            )).where(condition)
            .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
            .offset((max(1, page) - 1) * bounded)
            .limit(bounded)
        )).all())
        return rows, total

    async def list_platform_audit(
        self,
        *,
        action_type: str | None = None,
        resource_type: str | None = None,
        actor_user_id: uuid.UUID | None = None,
        organization_id: uuid.UUID | None = None,
        is_sensitive: bool | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        cursor_time: datetime | None = None,
        cursor_id: uuid.UUID | None = None,
        skip: int = 0,
        limit: int = 50,
        include_state: bool = False,
    ) -> tuple[list[dict], int, dict[str, int], bool]:
        """Return the platform audit feed as a bounded explicit projection."""
        bounded = self._page_size(limit)
        filters = []
        if action_type:
            filters.append(AuditLog.action_type == action_type)
        if resource_type:
            filters.append(AuditLog.resource_type == resource_type)
        if actor_user_id:
            filters.append(AuditLog.actor_user_id == actor_user_id)
        if organization_id:
            filters.append(AuditLog.organization_id == organization_id)
        if is_sensitive is not None:
            filters.append(AuditLog.is_sensitive.is_(is_sensitive))
        if date_from:
            filters.append(AuditLog.occurred_at >= date_from)
        if date_to:
            filters.append(AuditLog.occurred_at <= date_to)
        if cursor_time is not None:
            if cursor_id is not None:
                filters.append(
                    or_(
                        AuditLog.occurred_at < cursor_time,
                        and_(AuditLog.occurred_at == cursor_time, AuditLog.id < cursor_id),
                    )
                )
            else:
                filters.append(AuditLog.occurred_at < cursor_time)

        total = int(
            await self.db.scalar(select(func.count()).select_from(AuditLog).where(*filters))
            or 0
        )
        columns = [
            AuditLog.id,
            AuditLog.organization_id,
            Organization.name.label("organization_name"),
            AuditLog.actor_user_id,
            User.first_name,
            User.last_name,
            User.email,
            AuditLog.action_type,
            AuditLog.resource_type,
            AuditLog.resource_id,
            AuditLog.change_diff,
            AuditLog.request_id,
            AuditLog.correlation_id,
            AuditLog.actor_ip,
            AuditLog.actor_user_agent,
            AuditLog.is_sensitive,
            AuditLog.row_hash,
            AuditLog.occurred_at,
            AuditLog.actor_role,
        ]
        if include_state:
            columns.extend((AuditLog.old_state, AuditLog.new_state))
        rows = (
            await self.db.execute(
                select(*columns)
                .select_from(AuditLog)
                .outerjoin(Organization, Organization.id == AuditLog.organization_id)
                .outerjoin(User, User.id == AuditLog.actor_user_id)
                .where(*filters)
                .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
                .offset(max(0, skip))
                .limit(bounded + 1)
            )
        ).mappings().all()
        page_rows = rows[:bounded]
        results = []
        for row in page_rows:
            item = {
                "id": str(row["id"]),
                "org_name": row["organization_name"],
                "organization_id": str(row["organization_id"]) if row["organization_id"] else None,
                "actor_name": " ".join(filter(None, (row["first_name"], row["last_name"]))) or "System",
                "actor_email": row["email"],
                "actor_role": row["actor_role"],
                "actor_ip": row["actor_ip"],
                "actor_user_agent": row["actor_user_agent"],
                "action_type": row["action_type"],
                "resource_type": row["resource_type"],
                "resource_id": str(row["resource_id"]) if row["resource_id"] else None,
                "is_sensitive": row["is_sensitive"],
                "row_hash": row["row_hash"],
                "occurred_at": row["occurred_at"].isoformat(),
                "request_id": str(row["request_id"]) if row["request_id"] else None,
                "correlation_id": str(row["correlation_id"]) if row["correlation_id"] else None,
            }
            if include_state:
                item.update(
                    {
                        "old_state": row["old_state"],
                        "new_state": row["new_state"],
                        "change_diff": row["change_diff"],
                    }
                )
            results.append(item)

        count_rows = (
            await self.db.execute(
                select(AuditLog.action_type, func.count(AuditLog.id))
                .group_by(AuditLog.action_type)
                .order_by(func.count(AuditLog.id).desc(), AuditLog.action_type.asc())
            )
        ).all()
        action_counts = {str(action or ""): int(count or 0) for action, count in count_rows}
        return results, total, action_counts, len(rows) > bounded

    async def list_impersonation_logs(
        self, *, skip: int = 0, limit: int = 20
    ) -> tuple[list[dict], int, dict[str, float | int]]:
        """Return a bounded impersonation history and its 30-day summary."""
        bounded = self._page_size(limit)
        offset = max(0, skip)
        impersonator = aliased(User)
        target = aliased(User)
        duration = func.extract(
            "epoch",
            func.coalesce(ImpersonationLog.terminated_at, func.now())
            - ImpersonationLog.started_at,
        )
        rows = (
            await self.db.execute(
                select(
                    ImpersonationLog.id,
                    ImpersonationLog.started_at,
                    ImpersonationLog.terminated_at.label("ended_at"),
                    ImpersonationLog.ip_address,
                    ImpersonationLog.reason,
                    impersonator.email.label("impersonator_email"),
                    impersonator.first_name.label("impersonator_first_name"),
                    impersonator.last_name.label("impersonator_last_name"),
                    target.email.label("target_email"),
                    target.first_name.label("target_first_name"),
                    target.last_name.label("target_last_name"),
                    Organization.name.label("organization_name"),
                    duration.label("duration_seconds"),
                    case(
                        (ImpersonationLog.terminated_at.is_(None), "ACTIVE"),
                        else_="ENDED",
                    ).label("status"),
                )
                .select_from(ImpersonationLog)
                .join(impersonator, impersonator.id == ImpersonationLog.super_admin_id)
                .join(target, target.id == ImpersonationLog.target_user_id)
                .outerjoin(Organization, Organization.id == target.organization_id)
                # This is an intentionally global platform-admin feed. The
                # route enforces platform-admin authorization before reaching
                # this service, and the aliases must not receive a malformed
                # unaliased tenant-hook predicate.
                .execution_options(skip_tenant_filter=True)
                .order_by(ImpersonationLog.started_at.desc(), ImpersonationLog.id.desc())
                .offset(offset)
                .limit(bounded)
            )
        ).mappings().all()
        total = int(await self.db.scalar(select(func.count(ImpersonationLog.id))) or 0)
        summary_row = (
            await self.db.execute(
                select(
                    func.count(ImpersonationLog.id)
                    .filter(ImpersonationLog.terminated_at.is_(None))
                    .label("active_sessions"),
                    func.count(ImpersonationLog.id).label("total_sessions"),
                    func.avg(duration).label("avg_duration"),
                    func.max(duration).label("max_duration"),
                    func.count(func.distinct(ImpersonationLog.super_admin_id)).label("unique_impersonators"),
                ).where(
                    ImpersonationLog.started_at >= datetime.now(timezone.utc) - timedelta(days=30)
                )
            )
        ).mappings().one()
        items = []
        for row in rows:
            items.append(
                {
                    "id": str(row["id"]),
                    "started_at": row["started_at"],
                    "ended_at": row["ended_at"],
                    "ip_address": row["ip_address"],
                    "reason": row["reason"],
                    "impersonator_email": row["impersonator_email"],
                    "impersonator_name": " ".join(
                        filter(None, (row["impersonator_first_name"], row["impersonator_last_name"]))
                    ),
                    "target_email": row["target_email"],
                    "target_name": " ".join(
                        filter(None, (row["target_first_name"], row["target_last_name"]))
                    ),
                    "org_name": row["organization_name"],
                    "duration_seconds": float(row["duration_seconds"] or 0),
                    "status": row["status"],
                }
            )
        return items, total, {
            "active_sessions": int(summary_row["active_sessions"] or 0),
            "total_sessions_30d": int(summary_row["total_sessions"] or 0),
            "avg_duration_seconds": float(summary_row["avg_duration"] or 0),
            "max_duration_seconds": float(summary_row["max_duration"] or 0),
            "unique_impersonators": int(summary_row["unique_impersonators"] or 0),
        }
