import uuid
from typing import List, Set
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.models.cloud_commercial import CommercialAccount, CommercialContract, CommercialContractItem, CommercialOffer


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
        """Check canonical capacity offers on an active commercial contract."""
        stmt = select(CommercialContractItem.id).join(
            CommercialContract, CommercialContract.id == CommercialContractItem.contract_id
        ).join(
            CommercialAccount, CommercialAccount.id == CommercialContract.commercial_account_id
        ).join(
            CommercialOffer, CommercialOffer.id == CommercialContractItem.offer_id
        ).where(
            CommercialAccount.owner_organization_id == organization_id,
            CommercialContract.status == "ACTIVE",
            CommercialOffer.product_family == "CAPACITY_ADDON",
            (CommercialOffer.name == addon_name) | (CommercialOffer.display_name == addon_name) | (CommercialOffer.code == addon_name),
        )
        return (await db.scalar(stmt)) is not None

    @staticmethod
    async def can_access(db: AsyncSession, organization_id: uuid.UUID, feature_keys: List[str]) -> bool:
        """Check if organization has ANY of the requested features."""
        entitlements = await EntitlementResolver.resolve_entitlements(db, organization_id)
        return any(key in entitlements for key in feature_keys)
