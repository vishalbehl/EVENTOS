"""Bounded, explicit-projection operations-control queries."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.operations_control.models import TaskFailure
from app.modules.events.models.event import Event
from app.modules.technology_services.models import ServiceRequest
from app.modules.files.models.file import Asset
from app.modules.operations_control.models import SourceApiKey
from app.modules.platform.models.organization import Organization
from app.modules.venue.models.room_device import RoomDevice
from app.modules.venue.models.venue_sync_job import VenueSyncJob


class TaskFailureQueryService:
    """Read-only task-failure projection for operational recovery screens."""

    _columns = (
        TaskFailure.id,
        TaskFailure.task_id,
        TaskFailure.task_name,
        TaskFailure.organization_id,
        TaskFailure.status,
        TaskFailure.retry_count,
        TaskFailure.exception_type,
        TaskFailure.error_message,
        TaskFailure.args_hash,
        TaskFailure.replay_queue,
        TaskFailure.replay_args,
        TaskFailure.replay_count,
        TaskFailure.created_at,
        TaskFailure.resolved_at,
        TaskFailure.last_replayed_at,
    )

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_page(
        self,
        *,
        organization_id: uuid.UUID | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        bounded_limit = max(1, min(limit, 100))
        statement = select(*self._columns).order_by(
            TaskFailure.created_at.desc(), TaskFailure.id.desc()
        ).limit(bounded_limit)
        if organization_id is not None:
            statement = statement.where(TaskFailure.organization_id == organization_id)

        rows = (await self.db.execute(statement)).mappings().all()
        return [
            {
                "id": str(row[TaskFailure.id]),
                "task_id": row[TaskFailure.task_id],
                "task_name": row[TaskFailure.task_name],
                "organization_id": (
                    str(row[TaskFailure.organization_id])
                    if row[TaskFailure.organization_id]
                    else None
                ),
                "status": row[TaskFailure.status],
                "retry_count": row[TaskFailure.retry_count],
                "exception_type": row[TaskFailure.exception_type],
                "error_message": row[TaskFailure.error_message],
                "args_hash": row[TaskFailure.args_hash],
                "replay_available": bool(row[TaskFailure.replay_queue] and row[TaskFailure.replay_args]),
                "replay_queue": row[TaskFailure.replay_queue],
                "replay_count": row[TaskFailure.replay_count],
                "created_at": row[TaskFailure.created_at],
                "resolved_at": row[TaskFailure.resolved_at],
                "last_replayed_at": row[TaskFailure.last_replayed_at],
            }
            for row in rows
        ]


class OperationsControlQueryService:
    """Own bounded operational projections without router-owned SQL."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def event_for_scope(
        self, *, event_id: uuid.UUID, organization_id: uuid.UUID | None
    ) -> Event | None:
        statement = select(Event).where(
            Event.id == event_id,
            Event.deleted_at.is_(None),
        ).execution_options(skip_tenant_filter=True)
        if organization_id:
            statement = statement.where(Event.organization_id == organization_id)
        return await self.db.scalar(statement)

    async def list_requests(
        self,
        *,
        organization_id: uuid.UUID | None,
        event_id: uuid.UUID | None,
        source_type: str | None = None,
        limit: int,
    ) -> list[ServiceRequest]:
        statement = select(ServiceRequest).order_by(
            ServiceRequest.created_at.desc(), ServiceRequest.id.desc()
        ).limit(min(max(limit, 1), 200))
        if organization_id:
            statement = statement.where(ServiceRequest.organization_id == organization_id)
        if event_id:
            statement = statement.where(ServiceRequest.event_id == event_id)
        return list((await self.db.scalars(statement)).all())

    async def list_risks(
        self,
        *,
        organization_id: uuid.UUID | None,
        event_id: uuid.UUID | None,
    ) -> list[ServiceRequest]:
        statement = select(ServiceRequest).where(
            ServiceRequest.status.in_(["FAILED", "BLOCKED", "ESCALATED"])
        ).order_by(ServiceRequest.created_at.desc(), ServiceRequest.id.desc()).limit(200)
        if organization_id:
            statement = statement.where(ServiceRequest.organization_id == organization_id)
        if event_id:
            statement = statement.where(ServiceRequest.event_id == event_id)
        return list((await self.db.scalars(statement)).all())

    async def storage_totals(
        self, *, organization_id: uuid.UUID | None
    ) -> tuple[int, int, list[tuple[str | None, int, int]]]:
        base = select(Asset)
        if organization_id:
            base = base.where(Asset.organization_id == organization_id)
        scoped = base.subquery()
        total_row = (
            await self.db.execute(
                select(
                    func.count(scoped.c.id),
                    func.coalesce(func.sum(scoped.c.file_size_bytes), 0),
                )
            )
        ).one()
        status_rows = (
            await self.db.execute(
                select(
                    scoped.c.processing_status,
                    func.count(scoped.c.id),
                    func.coalesce(func.sum(scoped.c.file_size_bytes), 0),
                ).group_by(scoped.c.processing_status)
            )
        ).all()
        return int(total_row[0] or 0), int(total_row[1] or 0), [
            (row[0], int(row[1] or 0), int(row[2] or 0)) for row in status_rows
        ]

    async def list_source_access(
        self,
        *,
        organization_id: uuid.UUID | None,
        event_id: uuid.UUID | None,
        source_type: str | None,
        limit: int = 200,
    ) -> list[tuple[SourceApiKey, Organization, Event]]:
        statement = (
            select(SourceApiKey, Organization, Event)
            .join(Event, Event.id == SourceApiKey.event_id)
            .join(Organization, Organization.id == SourceApiKey.organization_id)
            .where(Event.deleted_at.is_(None))
            .order_by(SourceApiKey.created_at.desc(), SourceApiKey.id.desc())
            .limit(min(max(limit, 1), 200))
            .execution_options(skip_tenant_filter=True)
        )
        if organization_id:
            statement = statement.where(SourceApiKey.organization_id == organization_id)
        if event_id:
            statement = statement.where(SourceApiKey.event_id == event_id)
        if source_type:
            statement = statement.where(SourceApiKey.source_type == source_type)
        return list((await self.db.execute(statement)).all())

    async def venue_readiness_rows(
        self,
        *,
        organization_id: uuid.UUID | None,
        event_id: uuid.UUID | None,
        source_type: str | None = None,
    ) -> tuple[list[VenueSyncJob], list[SourceApiKey], list[RoomDevice]]:
        sync_statement = (
            select(VenueSyncJob)
            .order_by(VenueSyncJob.created_at.desc(), VenueSyncJob.id.desc())
            .limit(100)
            .execution_options(skip_tenant_filter=True)
        )
        if event_id:
            sync_statement = sync_statement.where(VenueSyncJob.event_id == event_id)

        key_statement = (
            select(SourceApiKey)
            .order_by(SourceApiKey.created_at.desc(), SourceApiKey.id.desc())
            .limit(200)
            .execution_options(skip_tenant_filter=True)
        )
        if organization_id:
            key_statement = key_statement.where(SourceApiKey.organization_id == organization_id)
        if event_id:
            key_statement = key_statement.where(SourceApiKey.event_id == event_id)
        if source_type in {"registration_server", "venue_server"}:
            key_statement = key_statement.where(SourceApiKey.source_type == source_type)

        device_statement = (
            select(RoomDevice)
            .limit(200)
            .execution_options(skip_tenant_filter=True)
        )
        if organization_id:
            device_statement = device_statement.where(RoomDevice.organization_id == organization_id)
        if event_id:
            device_statement = device_statement.where(RoomDevice.event_id == event_id)

        sync_jobs = list((await self.db.scalars(sync_statement)).all())
        source_keys = list((await self.db.scalars(key_statement)).all())
        devices = list((await self.db.scalars(device_statement)).all())
        return sync_jobs, source_keys, devices

    async def overview_rows(
        self,
        *,
        organization_id: uuid.UUID | None,
        event_id: uuid.UUID | None,
        source_type: str | None,
    ) -> dict[str, object | None]:
        """Collect bounded operational inputs while preserving fail-soft telemetry."""
        result: dict[str, object | None] = {}
        try:
            result["db"] = (await self.db.execute(text("""
                SELECT COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE state='active') AS active,
                       COUNT(*) FILTER (WHERE wait_event_type='Lock') AS waiting
                FROM pg_stat_activity WHERE datname=current_database()
            """))).one()
        except Exception:
            result["db"] = None

        try:
            statement = select(
                func.count(Asset.id),
                func.coalesce(func.sum(Asset.file_size_bytes), 0),
            )
            if organization_id:
                statement = statement.where(Asset.organization_id == organization_id)
            result["assets"] = (await self.db.execute(statement)).one()
        except Exception:
            result["assets"] = None

        try:
            statement = select(
                VenueSyncJob.status,
                func.count(VenueSyncJob.id),
                func.max(VenueSyncJob.created_at),
            ).group_by(VenueSyncJob.status)
            if event_id:
                statement = statement.where(VenueSyncJob.event_id == event_id)
            result["sync_jobs"] = (await self.db.execute(statement)).all()
        except Exception:
            result["sync_jobs"] = None

        try:
            statement = select(SourceApiKey)
            if organization_id:
                statement = statement.where(SourceApiKey.organization_id == organization_id)
            if event_id:
                statement = statement.where(SourceApiKey.event_id == event_id)
            if source_type in {"registration_server", "venue_server"}:
                statement = statement.where(SourceApiKey.source_type == source_type)
            result["source_keys"] = list((await self.db.scalars(statement)).all())
        except Exception:
            result["source_keys"] = None

        try:
            statement = select(RoomDevice)
            if organization_id:
                statement = statement.where(RoomDevice.organization_id == organization_id)
            if event_id:
                statement = statement.where(RoomDevice.event_id == event_id)
            result["devices"] = list((await self.db.scalars(statement)).all())
        except Exception:
            result["devices"] = None
        return result
