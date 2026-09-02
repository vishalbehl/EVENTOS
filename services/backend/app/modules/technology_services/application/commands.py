"""Transaction-owning commands for technology service requests."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_event
from app.modules.events.models.event import Event
from app.modules.technology_services.models import ServiceRequest, ServiceRequestItem


class TechnologyServiceCommandService:
    """Own service-request mutations while keeping routers HTTP-oriented only."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _event_for_user(self, *, event_id: uuid.UUID, user) -> Event:
        event = await self.db.scalar(
            select(Event)
            .where(Event.id == event_id, Event.deleted_at.is_(None))
            .execution_options(skip_tenant_filter=True)
        )
        platform_admin = (
            getattr(user, "role", None) == "super_admin"
            or getattr(user, "platform_role", None) == "SUPER_ADMIN"
            or getattr(user, "is_platform_admin", False)
        )
        if event is None or (
            getattr(user, "organization_id", None) != event.organization_id
            and not platform_admin
        ):
            raise HTTPException(status_code=404, detail="Event not found.")
        return event

    async def create(
        self,
        *,
        event_id: uuid.UUID,
        user,
        title: str,
        description: str | None,
        priority: str,
        request_type: str,
        items: list[dict[str, Any]],
    ) -> ServiceRequest:
        event = await self._event_for_user(event_id=event_id, user=user)
        row = ServiceRequest(
            organization_id=event.organization_id,
            event_id=event.id,
            request_number=f"SR-{uuid.uuid4().hex[:10].upper()}",
            title=title,
            description=description,
            status="DRAFT",
            priority=priority,
            request_type=request_type,
            requested_by=user.id,
            version=1,
        )
        try:
            self.db.add(row)
            await self.db.flush()
            for item in items:
                self.db.add(
                    ServiceRequestItem(
                        request_id=row.id,
                        description=str(
                            item.get("notes")
                            or item.get("description")
                            or item.get("service_id")
                            or "Service item"
                        ),
                        quantity=max(1, int(item.get("quantity", 1))),
                    )
                )
            await self.db.commit()
            await invalidate_event(event.organization_id, event.id)
            await self.db.refresh(row)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def transition(
        self, *, request_id: uuid.UUID, target: str, organization_id: uuid.UUID
    ) -> ServiceRequest:
        try:
            row = await self.db.scalar(
                select(ServiceRequest)
                .where(
                    ServiceRequest.id == request_id,
                    ServiceRequest.organization_id == organization_id,
                )
                .with_for_update()
            )
            if row is None:
                raise HTTPException(status_code=404, detail="Service request not found.")
            row.status = target
            row.version = int(row.version or 1) + 1
            await self.db.commit()
            await invalidate_event(row.organization_id, row.event_id)
            await self.db.refresh(row)
            return row
        except HTTPException:
            raise
        except Exception:
            await self.db.rollback()
            raise
