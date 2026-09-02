"""Transaction-owning organization administration commands."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.subscription import ActivityTimeline, OrganizationFeature, OrganizationSubscription
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.platform.models.platform_domain_tables import OrganizationDomain


class OrganizationCommandService:
    """Manage organization-owned configuration with explicit transactions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def set_feature_override(self, *, organization_id, feature_id, actor, is_enabled: bool, reason: str, expires_at=None) -> None:
        try:
            organization = await self.db.scalar(
                select(Organization).where(Organization.id == organization_id).with_for_update()
            )
            if organization is None:
                raise HTTPException(status_code=404, detail="Organization not found")
            feature = await self.db.scalar(
                select(FeatureCatalog).where(FeatureCatalog.id == feature_id).with_for_update()
            )
            if feature is None:
                raise HTTPException(status_code=404, detail="Feature not found")
            override = await self.db.scalar(
                select(OrganizationFeature)
                .where(
                    OrganizationFeature.organization_id == organization_id,
                    OrganizationFeature.feature_id == feature_id,
                )
                .with_for_update()
            )
            previous_override = override.is_enabled if override else None
            now = datetime.now(timezone.utc)
            if override is None:
                self.db.add(OrganizationFeature(
                    organization_id=organization_id,
                    feature_id=feature_id,
                    is_enabled=is_enabled,
                    override_by=actor.id,
                    effective_from=now,
                    expires_at=expires_at,
                    reason=reason,
                ))
            else:
                override.is_enabled = is_enabled
                override.effective_from = now
                override.expires_at = expires_at
                override.reason = reason
                override.override_by = actor.id
                override.override_at = now
                override.version = int(override.version or 1) + 1
            self.db.add(ActivityTimeline(
                organization_id=organization_id,
                actor_id=actor.id,
                action_type="FEATURE_OVERRIDE_CHANGED",
                metadata_data={"feature_id": str(feature_id), "feature_key": feature.key, "previous_override": previous_override, "enabled": is_enabled, "reason": reason},
            ))
            self._audit(organization_id, actor, "FEATURE_OVERRIDE_CHANGED", organization_id,
                        {"feature_id": str(feature_id), "feature_key": feature.key, "override": previous_override},
                        {"feature_id": str(feature_id), "feature_key": feature.key, "override": is_enabled}, reason)
            await self.db.commit()
            await invalidate_organization(organization_id)
        except Exception:
            await self.db.rollback()
            raise

    async def remove_feature_override(self, *, organization_id, feature_id, actor, reason: str) -> None:
        try:
            organization = await self.db.scalar(
                select(Organization).where(Organization.id == organization_id).with_for_update()
            )
            if organization is None:
                raise HTTPException(status_code=404, detail="Organization not found")
            feature = await self.db.scalar(
                select(FeatureCatalog).where(FeatureCatalog.id == feature_id).with_for_update()
            )
            if feature is None:
                raise HTTPException(status_code=404, detail="Feature not found")
            override = await self.db.scalar(
                select(OrganizationFeature)
                .where(
                    OrganizationFeature.organization_id == organization_id,
                    OrganizationFeature.feature_id == feature_id,
                )
                .with_for_update()
            )
            previous_override = override.is_enabled if override else None
            if override is not None:
                await self.db.delete(override)
            self.db.add(ActivityTimeline(
                organization_id=organization_id,
                actor_id=actor.id,
                action_type="FEATURE_OVERRIDE_REMOVED",
                metadata_data={"feature_id": str(feature_id), "feature_key": feature.key, "previous_override": previous_override, "reason": reason, "by": str(actor.id)},
            ))
            self._audit(organization_id, actor, "FEATURE_OVERRIDE_REMOVED", organization_id,
                        {"feature_id": str(feature_id), "feature_key": feature.key, "override": previous_override},
                        {"feature_id": str(feature_id), "feature_key": feature.key, "override": None}, reason)
            await self.db.commit()
            await invalidate_organization(organization_id)
        except Exception:
            await self.db.rollback()
            raise

    async def update_status(self, *, organization_id, actor, is_active: bool, suspension_reason: str) -> None:
        try:
            organization = await self.db.scalar(
                select(Organization).where(Organization.id == organization_id).with_for_update()
            )
            if organization is None:
                raise HTTPException(status_code=404, detail="Organization not found")

            old_state = {
                "is_active": organization.is_active,
                "suspended_at": organization.suspended_at.isoformat() if organization.suspended_at else None,
                "suspension_reason": organization.suspension_reason,
            }
            organization.is_active = is_active
            if is_active:
                organization.suspended_at = None
                organization.suspension_reason = None
            else:
                organization.suspended_at = datetime.now(timezone.utc)
                organization.suspension_reason = suspension_reason

            subscription = await self.db.scalar(
                select(OrganizationSubscription)
                .where(OrganizationSubscription.organization_id == organization_id)
                .where(OrganizationSubscription.status.in_(["ACTIVE", "TRIAL"]))
                .order_by(OrganizationSubscription.created_at.desc())
                .limit(1)
                .with_for_update()
            )
            if subscription:
                subscription.status = "ACTIVE" if is_active else "SUSPENDED"

            action = "ORG_ACTIVATED" if is_active else "ORG_SUSPENDED"
            self.db.add(ActivityTimeline(
                organization_id=organization_id,
                actor_id=actor.id,
                action_type=action,
                metadata_data={"reason": suspension_reason, "by": str(actor.id)},
            ))
            self._audit(
                organization_id,
                actor,
                action,
                organization_id,
                old_state,
                {
                    "is_active": organization.is_active,
                    "suspended_at": organization.suspended_at.isoformat() if organization.suspended_at else None,
                    "suspension_reason": organization.suspension_reason,
                    "subscription_status": subscription.status if subscription else None,
                },
                suspension_reason,
            )
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

    async def add_domain(self, *, organization_id, actor, domain: str, reason: str) -> OrganizationDomain:
        try:
            organization = await self.db.scalar(select(Organization).where(Organization.id == organization_id).with_for_update())
            if organization is None:
                raise HTTPException(status_code=404, detail="Organization not found")
            record = OrganizationDomain(organization_id=organization_id, domain=domain, is_verified=False)
            self.db.add(record)
            await self.db.flush()
            self._audit(organization_id, actor, "ORG_DOMAIN_ADDED", record.id, None, {"domain": domain, "is_verified": False}, reason)
            self.db.add(ActivityTimeline(organization_id=organization_id, actor_id=actor.id, action_type="ORG_DOMAIN_ADDED", metadata_data={"domain": domain, "reason": reason, "by": str(actor.id)}))
            await self.db.commit()
            await self.db.refresh(record)
            return record
        except Exception:
            await self.db.rollback()
            raise

    async def delete_domain(self, *, organization_id, domain_id, actor, reason: str) -> None:
        try:
            record = await self.db.scalar(select(OrganizationDomain).where(
                OrganizationDomain.organization_id == organization_id,
                OrganizationDomain.id == domain_id,
            ).with_for_update())
            if record is None:
                raise HTTPException(status_code=404, detail="Domain mapping not found")
            old = {"domain_id": str(domain_id), "domain": record.domain, "is_verified": record.is_verified}
            self._audit(organization_id, actor, "ORG_DOMAIN_DELETED", domain_id, old, None, reason)
            self.db.add(ActivityTimeline(organization_id=organization_id, actor_id=actor.id, action_type="ORG_DOMAIN_DELETED", metadata_data={"domain_id": str(domain_id), "domain": record.domain, "reason": reason, "by": str(actor.id)}))
            await self.db.delete(record)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

    async def verify_domain(self, *, organization_id, domain_id, actor, reason: str) -> OrganizationDomain:
        try:
            record = await self.db.scalar(select(OrganizationDomain).where(
                OrganizationDomain.organization_id == organization_id,
                OrganizationDomain.id == domain_id,
            ).with_for_update())
            if record is None:
                raise HTTPException(status_code=404, detail="Domain mapping not found")
            organization = await self.db.scalar(select(Organization).where(Organization.id == organization_id).with_for_update())
            if organization is None:
                raise HTTPException(status_code=404, detail="Organization not found")
            old = {"domain_id": str(domain_id), "domain": record.domain, "is_verified": record.is_verified, "custom_domain": organization.custom_domain}
            record.is_verified = True
            organization.custom_domain = record.domain
            new = {"domain_id": str(domain_id), "domain": record.domain, "is_verified": True, "custom_domain": organization.custom_domain}
            self._audit(organization_id, actor, "ORG_DOMAIN_VERIFIED", domain_id, old, new, reason)
            self.db.add(ActivityTimeline(organization_id=organization_id, actor_id=actor.id, action_type="ORG_DOMAIN_VERIFIED", metadata_data={"domain_id": str(domain_id), "domain": record.domain, "reason": reason, "by": str(actor.id)}))
            await self.db.commit()
            return record
        except Exception:
            await self.db.rollback()
            raise

    def _audit(self, organization_id, actor, action: str, resource_id, old_state, new_state, reason: str) -> None:
        self.db.add(AuditLog(
            actor_user_id=actor.id,
            organization_id=organization_id,
            action_type=action,
            resource_type="organization_domain",
            resource_id=resource_id,
            old_state=old_state,
            new_state=new_state,
            change_diff={"reason": reason},
            is_sensitive=True,
            occurred_at=datetime.now(timezone.utc),
        ))
