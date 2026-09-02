from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.models.licensing import EntitlementGrant, GrantConsumption
from app.modules.billing.models.subscription import OrganizationSubscription
from app.modules.events.models.event import Event


class BillingActivationQueryService:
    """Bounded tenant-scoped reads for billing activation workspaces."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    @classmethod
    def _limit(cls, value: int) -> int:
        if value < 1 or value > cls.MAX_PAGE_SIZE:
            raise ValueError(f"limit must be between 1 and {cls.MAX_PAGE_SIZE}")
        return value

    async def list_activations(
        self, organization_id: uuid.UUID, *, limit: int = MAX_PAGE_SIZE
    ) -> list[EventActivation]:
        statement = (
            select(EventActivation)
            .where(EventActivation.organization_id == organization_id)
            .order_by(EventActivation.created_at.desc(), EventActivation.id.desc())
            .limit(self._limit(limit))
        )
        return list((await self.db.scalars(statement)).all())

    async def list_grants(
        self, organization_id: uuid.UUID, *, limit: int = MAX_PAGE_SIZE
    ) -> list[EntitlementGrant]:
        statement = (
            select(EntitlementGrant)
            .where(EntitlementGrant.organization_id == organization_id)
            .order_by(EntitlementGrant.created_at.desc(), EntitlementGrant.id.desc())
            .limit(self._limit(limit))
        )
        return list((await self.db.scalars(statement)).all())

    async def list_consumptions(
        self,
        organization_id: uuid.UUID,
        grant_id: uuid.UUID,
        *,
        limit: int = MAX_PAGE_SIZE,
    ) -> list[GrantConsumption]:
        statement = (
            select(GrantConsumption)
            .where(
                GrantConsumption.organization_id == organization_id,
                GrantConsumption.grant_id == grant_id,
            )
            .order_by(GrantConsumption.created_at.desc(), GrantConsumption.id.desc())
            .limit(self._limit(limit))
        )
        return list((await self.db.scalars(statement)).all())

    async def list_active_subscriptions(
        self, organization_id: uuid.UUID, *, limit: int = MAX_PAGE_SIZE
    ) -> list[dict]:
        """Return the small subscription projection used by the billing list route."""
        statement = (
            select(
                OrganizationSubscription.id.label("subscription_id"),
                OrganizationSubscription.plan_id,
                OrganizationSubscription.status,
                OrganizationSubscription.trial_ends_at,
                OrganizationSubscription.current_period_end,
            )
            .where(
                OrganizationSubscription.organization_id == organization_id,
                OrganizationSubscription.status.in_(("ACTIVE", "TRIAL")),
            )
            .order_by(
                OrganizationSubscription.created_at.desc(),
                OrganizationSubscription.id.desc(),
            )
            .limit(self._limit(limit))
        )
        return [dict(row) for row in (await self.db.execute(statement)).mappings().all()]

    async def get_latest_activation(
        self, organization_id: uuid.UUID, event_id: uuid.UUID
    ) -> EventActivation | None:
        statement = (
            select(EventActivation)
            .where(
                EventActivation.organization_id == organization_id,
                EventActivation.event_id == event_id,
            )
            .order_by(EventActivation.created_at.desc(), EventActivation.id.desc())
            .limit(1)
        )
        return await self.db.scalar(statement)

    async def event_exists(
        self, organization_id: uuid.UUID, event_id: uuid.UUID
    ) -> bool:
        statement = select(Event.id).where(
            Event.id == event_id,
            Event.organization_id == organization_id,
        )
        return (await self.db.scalar(statement)) is not None
