from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.database import AsyncSessionLocal, tenant_org_id


class TenantJobScopeRequired(RuntimeError):
    """Raised when a worker job tries to touch tenant data without scope."""


def parse_required_organization_id(organization_id_str: str | uuid.UUID | None) -> uuid.UUID:
    if isinstance(organization_id_str, uuid.UUID):
        return organization_id_str
    try:
        return uuid.UUID(str(organization_id_str))
    except (TypeError, ValueError) as exc:
        raise TenantJobScopeRequired("Tenant-scoped jobs require organization_id_str.") from exc


@asynccontextmanager
async def tenant_job_session(organization_id: uuid.UUID) -> AsyncIterator[AsyncSession]:
    token = tenant_org_id.set(organization_id)
    try:
        async with AsyncSessionLocal() as db:
            await TenantContextGuard.apply(db, organization_id)
            yield db
    finally:
        tenant_org_id.reset(token)
