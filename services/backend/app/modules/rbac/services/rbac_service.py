"""Compatibility facade: customer checks use the single scoped resolver."""
from __future__ import annotations

import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.rbac.services.permission_service import get_user_permissions
from app.modules.rbac.services.permission_catalogue import canonical_action


class RBACService:
    @staticmethod
    async def get_user_permissions(db: AsyncSession, user_id: uuid.UUID, organization_id: uuid.UUID | None = None,
                                   event_id: uuid.UUID | None = None, workspace_id: uuid.UUID | None = None) -> set[str]:
        if organization_id is None:
            from app.database import tenant_org_id
            if tenant_org_id.get() is None:
                from app.modules.identity.models.user import User
                user = await db.get(User, user_id)
                if user is not None:
                    organization_id = user.organization_id
        return set(await get_user_permissions(db, user_id, event_id, organization_id, workspace_id))

    @staticmethod
    async def validate_access(db: AsyncSession, user_id: uuid.UUID, required_permission: str,
                              scope_id: uuid.UUID | None = None) -> bool:
        action = canonical_action(required_permission)
        return action is not None and action in await RBACService.get_user_permissions(db, user_id, event_id=scope_id)
