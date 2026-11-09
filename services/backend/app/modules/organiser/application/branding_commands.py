"""Transaction-owning organization branding commands."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import OrganizationBrandProfile
from app.modules.files.models.file import Asset, AssetTag
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
                raise HTTPException(status_code=status.HTTP_412_PRECONDITION_FAILED, detail={
                    "code": "VERSION_CONFLICT", "current_version": row.version,
                })
            if row is None and if_match != 0:
                raise HTTPException(status_code=status.HTTP_412_PRECONDITION_FAILED, detail={
                    "code": "VERSION_CONFLICT", "current_version": 0,
                })
            asset_ids = [values.get("logo_asset_id"), values.get("favicon_asset_id")]
            requested_ids = [asset_id for asset_id in asset_ids if asset_id is not None]
            owned_assets: dict = {}
            if requested_ids:
                assets = list((await self.db.scalars(select(Asset).where(
                    Asset.organization_id == organization_id,
                    Asset.id.in_(requested_ids),
                ).with_for_update())).all())
                owned_assets = {asset.id: asset for asset in assets}
                if len(owned_assets) != len(set(requested_ids)):
                    raise HTTPException(status_code=404, detail={"code": "BRAND_ASSET_NOT_FOUND"})
                sanitized_svg_ids = set((await self.db.scalars(select(AssetTag.asset_id).where(
                    AssetTag.asset_id.in_(requested_ids),
                    AssetTag.tag == "system:sanitized-svg-v1",
                ))).all())
                for asset in assets:
                    if not asset.mime_type.startswith("image/"):
                        raise HTTPException(status_code=422, detail={"code": "BRAND_ASSET_TYPE_INVALID"})
                    if asset.processing_status != "READY":
                        raise HTTPException(status_code=423, detail={
                            "code": "BRAND_ASSET_NOT_READY", "asset_id": str(asset.id),
                            "status": asset.processing_status,
                        })
                    if asset.mime_type == "image/svg+xml" and asset.id not in sanitized_svg_ids:
                        raise HTTPException(status_code=422, detail={"code": "BRAND_SVG_SANITIZATION_REQUIRED"})
            assets_state = {
                "logo_asset_id": str(values["logo_asset_id"]) if values.get("logo_asset_id") else None,
                "favicon_asset_id": str(values["favicon_asset_id"]) if values.get("favicon_asset_id") else None,
            }
            old = {
                "logo_url": organization.logo_url, "primary_color": organization.primary_color,
                "secondary_color": organization.secondary_color,
                "assets": dict(row.assets or {}) if row else {}, "version": row.version if row else 0,
            }
            organization.logo_url = (
                f"/api/v1/organiser/public-brand-assets/{organization_id}/logo"
                if values.get("logo_asset_id") else None
            )
            organization.primary_color = values["primary_color"].lower()
            organization.secondary_color = values["secondary_color"].lower()
            if row is None:
                row = OrganizationBrandProfile(
                    organization_id=organization_id, status="DRAFT",
                    assets={**assets_state, "logo_url": organization.logo_url,
                            "favicon_url": f"/api/v1/organiser/public-brand-assets/{organization_id}/favicon" if values.get("favicon_asset_id") else None},
                    tokens={"primary_color": organization.primary_color, "secondary_color": organization.secondary_color},
                    templates={},
                )
                self.db.add(row)
                await self.db.flush()
            else:
                row.assets = {**(row.assets or {}), **assets_state, "logo_url": organization.logo_url,
                              "favicon_url": f"/api/v1/organiser/public-brand-assets/{organization_id}/favicon" if values.get("favicon_asset_id") else None}
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
