"""Transaction-owning organization location commands."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.platform.models.organization_console import (
    OrganizationLocation,
    OrganizationTeam,
)
from app.modules.rbac.models.organization_member import OrganizationMember


class OrganizerLocationCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _view(row: OrganizationLocation) -> dict:
        return {
            "id": str(row.id),
            "name": row.name,
            "location_type": row.location_type,
            "address": row.address,
            "timezone": row.timezone,
            "contact": row.contact,
            "manager_user_id": str(row.manager_user_id) if row.manager_user_id else None,
            "team_id": str(row.team_id) if row.team_id else None,
            "status": row.status,
            "version": row.version,
        }

    async def _validate_references(self, *, organization_id, manager_user_id, team_id) -> None:
        if manager_user_id and not await self.db.scalar(
            select(OrganizationMember.id).where(
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.user_id == manager_user_id,
                OrganizationMember.is_active.is_(True),
            )
        ):
            raise HTTPException(status_code=422, detail={"code": "BRANCH_OWNER_NOT_ACTIVE_MEMBER"})
        if team_id and not await self.db.scalar(
            select(OrganizationTeam.id).where(
                OrganizationTeam.organization_id == organization_id,
                OrganizationTeam.id == team_id,
                OrganizationTeam.deleted_at.is_(None),
                OrganizationTeam.status == "ACTIVE",
            )
        ):
            raise HTTPException(status_code=422, detail={"code": "BRANCH_TEAM_NOT_ACTIVE"})

    async def create(self, *, organization_id, actor: User, values: dict) -> dict:
        try:
            name = values["name"].strip()
            duplicate = await self.db.scalar(
                select(OrganizationLocation.id).where(
                    OrganizationLocation.organization_id == organization_id,
                    func.lower(OrganizationLocation.name) == name.lower(),
                )
            )
            if duplicate:
                raise HTTPException(status_code=409, detail={"code": "LOCATION_NAME_EXISTS"})
            await self._validate_references(
                organization_id=organization_id,
                manager_user_id=values.get("manager_user_id"),
                team_id=values.get("team_id"),
            )
            row = OrganizationLocation(
                organization_id=organization_id,
                version=1,
                **{**values, "name": name},
            )
            self.db.add(row)
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id,
                actor_user_id=actor.id,
                actor_role=actor.role,
                resource_type="organization_location",
                resource_id=row.id,
                action_type="ORGANIZATION_LOCATION_CREATED",
                new_state=self._view(row),
                is_sensitive=False,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return self._view(row)
        except Exception:
            await self.db.rollback()
            raise

    async def update(self, *, organization_id, location_id, actor: User, values: dict, if_match: int) -> dict:
        try:
            row = await self.db.scalar(
                select(OrganizationLocation).where(
                    OrganizationLocation.id == location_id,
                    OrganizationLocation.organization_id == organization_id,
                ).with_for_update()
            )
            if row is None:
                raise HTTPException(status_code=404, detail="Location not found")
            if row.version != if_match:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                    "code": "VERSION_CONFLICT", "current_version": row.version,
                })
            name = values["name"].strip()
            duplicate = await self.db.scalar(
                select(OrganizationLocation.id).where(
                    OrganizationLocation.organization_id == organization_id,
                    OrganizationLocation.id != location_id,
                    func.lower(OrganizationLocation.name) == name.lower(),
                )
            )
            if duplicate:
                raise HTTPException(status_code=409, detail={"code": "LOCATION_NAME_EXISTS"})
            await self._validate_references(
                organization_id=organization_id,
                manager_user_id=values.get("manager_user_id"),
                team_id=values.get("team_id"),
            )
            old = self._view(row)
            for key, value in values.items():
                setattr(row, key, value)
            row.name = name
            row.version = int(row.version or 1) + 1
            self.db.add(AuditLog(
                organization_id=organization_id,
                actor_user_id=actor.id,
                actor_role=actor.role,
                resource_type="organization_location",
                resource_id=row.id,
                action_type="ORGANIZATION_LOCATION_UPDATED",
                old_state=old,
                new_state=self._view(row),
                is_sensitive=False,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return self._view(row)
        except Exception:
            await self.db.rollback()
            raise
