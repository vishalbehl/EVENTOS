"""Transaction-owning organization branding commands."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import OrganizationBrandProfile
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response


class OrganizerBrandingCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def update(self, *, organization_id, actor, values: dict, if_match: int, idempotency_key: str | None = None) -> dict:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    self.db, organization_id=organization_id, actor_id=actor.id,
                    operation="organiser.organization.branding.update", key=idempotency_key,
                    payload={"values": values, "if_match": if_match},
                )
                if replay_response(idem) is not None:
                    row = await self.db.scalar(select(OrganizationBrandProfile).where(
                        OrganizationBrandProfile.organization_id == organization_id
                    ).with_for_update())
                    if row is None:
                        raise RuntimeError("Completed branding idempotency resource is missing.")
                    await self.db.commit()
                    return {"status": row.status, "assets": row.assets, "tokens": row.tokens,
                            "version": row.version, "published_version": row.published_version}
            organization = await self.db.scalar(select(Organization).where(
                Organization.id == organization_id,
            ).with_for_update())
            if organization is None:
                raise HTTPException(status_code=404, detail="Organization not found")
            row = await self.db.scalar(select(OrganizationBrandProfile).where(
                OrganizationBrandProfile.organization_id == organization_id,
            ).with_for_update())
            if row and row.version != if_match:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                    "code": "VERSION_CONFLICT", "current_version": row.version,
                })
            old = {
                "logo_url": organization.logo_url, "primary_color": organization.primary_color,
                "secondary_color": organization.secondary_color, "version": row.version if row else 0,
            }
            organization.logo_url = values["logo_url"]
            organization.primary_color = values["primary_color"].lower()
            organization.secondary_color = values["secondary_color"].lower()
            if row is None:
                row = OrganizationBrandProfile(
                    organization_id=organization_id, status="DRAFT",
                    assets={"logo_url": organization.logo_url},
                    tokens={"primary_color": organization.primary_color, "secondary_color": organization.secondary_color},
                    templates={},
                )
                self.db.add(row)
                await self.db.flush()
            else:
                row.assets = {**(row.assets or {}), "logo_url": organization.logo_url}
                row.tokens = {**(row.tokens or {}), "primary_color": organization.primary_color, "secondary_color": organization.secondary_color}
                row.status = "DRAFT"
                row.version = int(row.version or 0) + 1
            new_state = {
                "logo_url": organization.logo_url, "primary_color": organization.primary_color,
                "secondary_color": organization.secondary_color, "version": row.version,
            }
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="organization_brand_profile", resource_id=row.id,
                action_type="ORGANIZATION_BRAND_DRAFT_UPDATED", old_state=old,
                new_state=new_state, is_sensitive=False,
            ))
            response = {"status": row.status, "assets": row.assets, "tokens": row.tokens,
                        "version": row.version, "published_version": row.published_version}
            if idem is not None:
                await complete_idempotent(
                    self.db, idem, response_status=200, response_body=response, resource_id=row.id
                )
            await self.db.commit()
            await invalidate_organization(organization_id)
            return response
        except Exception:
            await self.db.rollback()
            raise
