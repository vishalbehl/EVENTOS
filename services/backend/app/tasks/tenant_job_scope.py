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


@asynccontextmanager
async def reauthorize_job_actor(
    db: AsyncSession,
    actor_id: uuid.UUID,
    organization_id: uuid.UUID,
    *,
    workspace_id: uuid.UUID | None = None,
    event_id: uuid.UUID | None = None,
    action: str | None = None,
    access_mode: str = "DIRECT",
    relationship_id: uuid.UUID | None = None,
    emc_organization_id: uuid.UUID | None = None,
) -> AsyncIterator[None]:
    """Re-authorise jobs at execution and before publishing results.

    Validates active user identity, authentication revision, membership status,
    and scoped action permissions under live revision locks.
    """
    from types import SimpleNamespace
    from sqlalchemy import select
    from app.modules.identity.models.user import User
    from app.modules.rbac.services.access_contexts import direct_request_context
    from app.modules.rbac.services.permission_service import get_user_permissions

    identity = User.__table__
    user_row = (await db.execute(select(identity.c.id, identity.c.role, identity.c.is_active, identity.c.deleted_at).where(
        identity.c.id == actor_id
    ))).first()
    if user_row is None or not user_row.is_active or user_row.deleted_at is not None:
        raise TenantJobScopeRequired("Job actor account is unavailable or deactivated.")

    user = SimpleNamespace(id=actor_id, organization_id=organization_id, role=user_row.role)

    if access_mode == "DIRECT":
        async with direct_request_context(db, user, organization_id, workspace_id=workspace_id):
            if action:
                perms = await get_user_permissions(db, actor_id, event_id=event_id, organization_id=organization_id, workspace_id=workspace_id)
                if action.upper() not in perms and action.lower() not in perms:
                    raise TenantJobScopeRequired(f"Job actor lacks required permission: {action}")
            yield
    elif access_mode == "DELEGATED":
        from app.modules.rbac.services.delegated_access import delegated_request_context
        if not relationship_id or not emc_organization_id:
            raise TenantJobScopeRequired("Delegated job execution requires relationship_id and emc_organization_id.")
        async with delegated_request_context(
            db, user,
            emc_organization_id=emc_organization_id,
            client_organization_id=organization_id,
            relationship_id=relationship_id,
            workspace_id=workspace_id,
            event_id=event_id,
            action=action,
        ):
            yield
    else:
        raise TenantJobScopeRequired(f"Unsupported job access mode: {access_mode}")
