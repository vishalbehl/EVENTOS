"""Transaction-owning platform branding commands."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.core.dependencies.feature_gate import enforce_org_operation
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization_console import OrganizationBrandProfile


class PlatformBrandingCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def update(self, *, organization_id, actor, assets: dict, tokens: dict,
                     templates: dict, version: int, if_match: str | None,
                     reason: str) -> dict:
        try:
            row = await self.db.scalar(select(OrganizationBrandProfile).where(
                OrganizationBrandProfile.organization_id == organization_id,
            ).with_for_update())
            if row:
                if if_match is None or if_match.strip('"') != str(version) or row.version != version:
                    raise HTTPException(status_code=412, detail="Brand profile version is stale")
                old = {"version": row.version, "status": row.status}
                row.assets, row.tokens, row.templates = assets, tokens, templates
                row.version = int(row.version or 1) + 1
                row.status = "DRAFT"
            else:
                if version != 1:
                    raise HTTPException(status_code=412, detail="Brand profile does not exist at the requested version")
                old = None
                row = OrganizationBrandProfile(
                    organization_id=organization_id, assets=assets,
                    tokens=tokens, templates=templates,
                )
                self.db.add(row)
                await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_brand_profile",
                resource_id=row.id, action_type="ORGANIZATION_BRAND_DRAFT_UPDATED",
                old_state=old,
                new_state={"version": row.version, "status": row.status, "reason": reason},
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return {"id": row.id, "version": row.version, "status": row.status,
                    "updated_at": row.updated_at}
        except Exception:
            await self.db.rollback()
            raise

    async def publish(self, *, organization_id, actor, if_match: str) -> dict:
        try:
            row = await self.db.scalar(select(OrganizationBrandProfile).where(
                OrganizationBrandProfile.organization_id == organization_id,
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=409, detail="No brand draft exists")
            if if_match.strip('"') != str(row.version):
                raise HTTPException(status_code=412, detail="Brand profile version is stale")
            templates = row.templates or {}
            white_label = templates.get("white_label")
            if isinstance(white_label, dict) and white_label.get("enabled"):
                await enforce_org_operation(db=self.db, organization_id=organization_id,
                                            operation="branding.white_label.publish", user_id=actor.id)
            login_page = templates.get("login_page")
            if isinstance(login_page, dict) and login_page.get("enabled"):
                await enforce_org_operation(db=self.db, organization_id=organization_id,
                                            operation="branding.custom_login.publish", user_id=actor.id)
            row.status = "PUBLISHED"
            row.published_version = row.version
            row.published_at = datetime.now(timezone.utc)
            row.published_by = actor.id
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_brand_profile",
                resource_id=row.id, action_type="ORGANIZATION_BRAND_PUBLISHED",
                new_state={"published_version": row.published_version}, is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return {"id": row.id, "published_version": row.published_version,
                    "published_at": row.published_at}
        except Exception:
            await self.db.rollback()
            raise
