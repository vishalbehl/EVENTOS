"""Transaction-owning privileged organization-location commands."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import OrganizationLocation


class OrganizationLocationCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, *, organization_id, actor: User, values: dict) -> OrganizationLocation:
        try:
            organization = await self.db.scalar(
                select(Organization).where(Organization.id == organization_id).with_for_update()
            )
            if organization is None:
                raise HTTPException(status_code=404, detail="Organization not found")
            if values.get("manager_user_id"):
                manager = await self.db.scalar(
                    select(User.id).where(
                        User.id == values["manager_user_id"],
                        User.organization_id == organization_id,
                    )
                )
                if manager is None:
                    raise HTTPException(status_code=404, detail="Location manager not found")
            name = values["name"].strip()
            duplicate = await self.db.scalar(select(OrganizationLocation.id).where(
                OrganizationLocation.organization_id == organization_id,
                func.lower(OrganizationLocation.name) == name.lower(),
            ))
            if duplicate:
                raise HTTPException(status_code=409, detail={"code": "LOCATION_NAME_EXISTS"})
            row = OrganizationLocation(organization_id=organization_id, **{**values, "name": name})
            self.db.add(row)
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="organization_location", resource_id=row.id,
                action_type="ORGANIZATION_LOCATION_CREATED",
                new_state={"name": row.name, "location_type": row.location_type},
                is_sensitive=False,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def update(self, *, organization_id, location_id, actor: User, values: dict, if_match: int) -> OrganizationLocation:
        try:
            row = await self.db.scalar(select(OrganizationLocation).where(
                OrganizationLocation.id == location_id,
                OrganizationLocation.organization_id == organization_id,
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Location not found")
            if row.version != if_match:
                raise HTTPException(status_code=status.HTTP_412_PRECONDITION_FAILED, detail="Location version is stale")
            if values.get("manager_user_id"):
                manager = await self.db.scalar(select(User.id).where(
                    User.id == values["manager_user_id"], User.organization_id == organization_id,
                ))
                if manager is None:
                    raise HTTPException(status_code=404, detail="Location manager not found")
            name = values["name"].strip()
            duplicate = await self.db.scalar(select(OrganizationLocation.id).where(
                OrganizationLocation.organization_id == organization_id,
                OrganizationLocation.id != location_id,
                func.lower(OrganizationLocation.name) == name.lower(),
            ))
            if duplicate:
                raise HTTPException(status_code=409, detail={"code": "LOCATION_NAME_EXISTS"})
            old = {"name": row.name, "status": row.status, "version": row.version}
            for key, value in values.items():
                setattr(row, key, value)
            row.name = name
            row.version = int(row.version or 1) + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="organization_location", resource_id=row.id,
                action_type="ORGANIZATION_LOCATION_UPDATED", old_state=old,
                new_state={"name": row.name, "status": row.status, "version": row.version},
                is_sensitive=False,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise
