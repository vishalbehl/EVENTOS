"""Read-only, bounded query services for technology service requests."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.modules.events.models.event import Event
from app.modules.technology_services.models import ServiceRequest


class TechnologyServiceQueryService:
    """Keep service-request reads explicit and free of transaction ownership."""

    _columns = (
        ServiceRequest.id,
        ServiceRequest.organization_id,
        ServiceRequest.event_id,
        ServiceRequest.request_number,
        ServiceRequest.title,
        ServiceRequest.description,
        ServiceRequest.status,
        ServiceRequest.priority,
        ServiceRequest.request_type,
        ServiceRequest.requested_by,
        ServiceRequest.version,
    )

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_event_for_scope(
        self,
        *,
        event_id: uuid.UUID,
        organization_id: uuid.UUID,
        is_platform_admin: bool = False,
    ) -> Event | None:
        """Load only event scope data needed by the route authorization check."""
        statement = (
            select(Event)
            .options(load_only(Event.id, Event.organization_id))
            .where(Event.id == event_id, Event.deleted_at.is_(None))
        )
        if not is_platform_admin:
            statement = statement.where(Event.organization_id == organization_id)
        return await self.db.scalar(statement)

    async def get(self, *, request_id: uuid.UUID, organization_id: uuid.UUID) -> ServiceRequest | None:
        return await self.db.scalar(
            select(ServiceRequest)
            .options(load_only(*self._columns))
            .where(
                ServiceRequest.id == request_id,
                ServiceRequest.organization_id == organization_id,
            )
        )

    async def list(self, *, event_id: uuid.UUID, organization_id: uuid.UUID, limit: int = 100) -> list[ServiceRequest]:
        bounded_limit = max(1, min(limit, 200))
        result = await self.db.scalars(
            select(ServiceRequest)
            .options(load_only(*self._columns))
            .where(
                ServiceRequest.event_id == event_id,
                ServiceRequest.organization_id == organization_id,
            )
            .order_by(ServiceRequest.id.desc())
            .limit(bounded_limit)
        )
        return list(result.all())

    async def kpis(self, *, event_id: uuid.UUID, organization_id: uuid.UUID) -> dict[str, Any]:
        rows = (
            await self.db.execute(
                select(ServiceRequest.status, func.count(ServiceRequest.id))
                .where(
                    ServiceRequest.event_id == event_id,
                    ServiceRequest.organization_id == organization_id,
                )
                .group_by(ServiceRequest.status)
            )
        ).all()
        counts = {str(status): int(count) for status, count in rows}
        return {
            "total": sum(counts.values()),
            "open": sum(v for k, v in counts.items() if k not in {"COMPLETED", "CANCELLED"}),
            "status_counts": counts,
        }

    async def kanban(self, *, event_id: uuid.UUID, organization_id: uuid.UUID, limit: int = 50, offset: int = 0) -> list[ServiceRequest]:
        bounded_limit = max(1, min(limit, 200))
        bounded_offset = max(0, offset)
        result = await self.db.scalars(
            select(ServiceRequest)
            .options(load_only(*self._columns))
            .where(
                ServiceRequest.event_id == event_id,
                ServiceRequest.organization_id == organization_id,
            )
            .order_by(ServiceRequest.id.desc())
            .offset(bounded_offset)
            .limit(bounded_limit)
        )
        return list(result.all())
