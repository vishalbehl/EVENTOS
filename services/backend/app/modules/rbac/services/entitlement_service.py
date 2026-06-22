import uuid
from typing import List, Set
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.models.subscription import OrganizationAddon


class EntitlementService:
    @staticmethod
    async def resolve_entitlements(db: AsyncSession, organization_id: uuid.UUID) -> Set[str]:
        """
        Resolve the complete set of feature keys the organization is entitled to.
        Delegates to EntitlementResolver.
        """
        return await EntitlementResolver.resolve_entitlements(db, organization_id)

    @staticmethod
    async def has_feature(db: AsyncSession, organization_id: uuid.UUID, feature_key: str) -> bool:
        """Check if an organization has a specific feature."""
        return await EntitlementResolver.has_feature(db, organization_id, feature_key)

    @staticmethod
    async def has_addon(db: AsyncSession, organization_id: uuid.UUID, addon_name: str) -> bool:
        """Check if an organization has a specific add-on active."""
        from app.modules.billing.models.subscription import Addon
        stmt = select(OrganizationAddon.id).join(Addon).where(
            and_(
                OrganizationAddon.organization_id == organization_id,
                OrganizationAddon.status == "ACTIVE",
                Addon.name == addon_name
            )
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none() is not None

    @staticmethod
    async def can_access(db: AsyncSession, organization_id: uuid.UUID, feature_keys: List[str]) -> bool:
        """Check if organization has ANY of the requested features."""
        entitlements = await EntitlementResolver.resolve_entitlements(db, organization_id)
        return any(key in entitlements for key in feature_keys)
