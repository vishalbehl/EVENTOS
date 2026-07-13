from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.database import tenant_org_id


class TenantContextRequired(RuntimeError):
    pass


class TenantContextGuard:
    """Establish verified tenant context transaction-locally before tenant queries."""

    @staticmethod
    async def apply(session: AsyncSession, organization_id: uuid.UUID | None) -> None:
        if organization_id is None:
            await session.execute(text("SELECT set_config('app.current_organization_id', '', true)"))
            return
        if not isinstance(organization_id, uuid.UUID):
            raise TenantContextRequired("Verified tenant context must be a UUID.")
        await session.execute(
            text("SELECT set_config('app.current_organization_id', :org_id, true)"),
            {"org_id": str(organization_id)},
        )

    @staticmethod
    def current() -> uuid.UUID | None:
        return tenant_org_id.get()

    @staticmethod
    @asynccontextmanager
    async def scoped(
        session: AsyncSession, organization_id: uuid.UUID
    ) -> AsyncIterator[None]:
        """Temporarily switch to a verified tenant inside the current transaction."""
        if not isinstance(organization_id, uuid.UUID):
            raise TenantContextRequired("Verified tenant context must be a UUID.")
        previous = tenant_org_id.get()
        token = tenant_org_id.set(organization_id)
        try:
            await TenantContextGuard.apply(session, organization_id)
            yield
        finally:
            tenant_org_id.reset(token)
            await TenantContextGuard.apply(session, previous)


@event.listens_for(Session, "after_begin")
def _apply_tenant_context_on_transaction_begin(session, transaction, connection) -> None:
    """Reapply transaction-local tenant state after every commit or rollback."""
    if connection.dialect.name != "postgresql":
        return
    organization_id = tenant_org_id.get()
    value = str(organization_id) if isinstance(organization_id, uuid.UUID) else ""
    connection.execute(
        text("SELECT set_config('app.current_organization_id', :org_id, true)"),
        {"org_id": value},
    )
