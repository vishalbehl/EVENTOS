"""Transaction-owning organization team commands."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.core.concurrency import raise_version_conflict
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.platform.models.organization_console import (
    OrganizationTeam,
    OrganizationTeamEvent,
    OrganizationTeamMember,
)


class OrganizationTeamCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, *, organization_id, actor, name: str, description: str | None, owner_member_id=None, reason: str, idempotency_key: str | None = None) -> OrganizationTeam:
        try:
            if idempotency_key:
                replay = await self.db.scalar(select(AuditLog).where(
                    AuditLog.organization_id == organization_id,
                    AuditLog.action_type == "ORGANIZATION_TEAM_CREATED",
                    AuditLog.new_state["idempotency_key"].astext == idempotency_key,
                ))
                if replay:
                    row = await self.db.get(OrganizationTeam, replay.resource_id)
                    if row and row.deleted_at is None:
                        return row
            duplicate = await self.db.scalar(
                select(OrganizationTeam.id).where(
                    OrganizationTeam.organization_id == organization_id,
                    func.lower(OrganizationTeam.name) == name.strip().lower(),
                    OrganizationTeam.deleted_at.is_(None),
                ).with_for_update()
            )
            if duplicate:
                raise HTTPException(status_code=409, detail={"code": "ORGANIZATION_TEAM_NAME_EXISTS"})
            if owner_member_id and not await self.db.scalar(select(OrganizationMember.id).where(
                OrganizationMember.id == owner_member_id,
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.is_active.is_(True),
            )):
                raise HTTPException(status_code=422, detail={"code": "TEAM_OWNER_NOT_ACTIVE_MEMBER"})
            row = OrganizationTeam(
                organization_id=organization_id,
                name=name.strip(),
                description=description,
                owner_member_id=owner_member_id,
                created_by=actor.id,
            )
            self.db.add(row)
            await self.db.flush()
            new_state = {"name": row.name, "description": row.description, "reason": reason}
            if idempotency_key:
                new_state["idempotency_key"] = idempotency_key
            self._audit(organization_id, actor, "ORGANIZATION_TEAM_CREATED", row.id, None, new_state)
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def update(self, *, organization_id, team_id, actor, name: str, description: str | None, owner_member_id=None, if_match: int, reason: str) -> OrganizationTeam:
        try:
            row = await self.db.scalar(
                select(OrganizationTeam).where(
                    OrganizationTeam.id == team_id,
                    OrganizationTeam.organization_id == organization_id,
                    OrganizationTeam.deleted_at.is_(None),
                ).with_for_update()
            )
            if row is None:
                raise HTTPException(status_code=404, detail={"code": "ORGANIZATION_TEAM_NOT_FOUND"})
            if row.version != if_match:
                raise_version_conflict(row.version)
            duplicate = await self.db.scalar(
                select(OrganizationTeam.id).where(
                    OrganizationTeam.organization_id == organization_id,
                    OrganizationTeam.id != team_id,
                    func.lower(OrganizationTeam.name) == name.strip().lower(),
                    OrganizationTeam.deleted_at.is_(None),
                )
            )
            if duplicate:
                raise HTTPException(status_code=409, detail={"code": "ORGANIZATION_TEAM_NAME_EXISTS"})
            if owner_member_id and not await self.db.scalar(select(OrganizationMember.id).where(
                OrganizationMember.id == owner_member_id,
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.is_active.is_(True),
            )):
                raise HTTPException(status_code=422, detail={"code": "TEAM_OWNER_NOT_ACTIVE_MEMBER"})
            old = {"name": row.name, "description": row.description,
                   "owner_member_id": str(row.owner_member_id) if row.owner_member_id else None,
                   "version": row.version}
            row.name = name.strip()
            row.description = description
            row.owner_member_id = owner_member_id
            row.version = int(row.version or 1) + 1
            self._audit(organization_id, actor, "ORGANIZATION_TEAM_UPDATED", row.id, old,
                        {"name": row.name, "description": row.description, "version": row.version, "reason": reason})
            await self.db.commit()
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def archive(self, *, organization_id, team_id, actor, if_match: int, reason: str, audit_action: str = "ORGANIZATION_TEAM_ARCHIVED") -> OrganizationTeam:
        try:
            row = await self.db.scalar(
                select(OrganizationTeam).where(
                    OrganizationTeam.id == team_id,
                    OrganizationTeam.organization_id == organization_id,
                    OrganizationTeam.deleted_at.is_(None),
                ).with_for_update()
            )
            if row is None:
                raise HTTPException(status_code=404, detail={"code": "ORGANIZATION_TEAM_NOT_FOUND"})
            if row.version != if_match:
                raise_version_conflict(row.version)
            row.deleted_at = datetime.now(timezone.utc)
            row.status = "ARCHIVED"
            row.version = int(row.version or 1) + 1
            self._audit(organization_id, actor, audit_action, row.id,
                        {"deleted_at": None, "version": if_match},
                        {"deleted_at": row.deleted_at.isoformat(), "version": row.version, "reason": reason})
            await self.db.commit()
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def assign_member(self, *, organization_id, team_id, member_id, actor, reason: str) -> OrganizationTeam:
        try:
            team = await self._active_team(organization_id, team_id)
            member = await self.db.scalar(
                select(OrganizationMember).where(
                    OrganizationMember.id == member_id,
                    OrganizationMember.organization_id == organization_id,
                    OrganizationMember.is_active.is_(True),
                ).with_for_update()
            )
            if team is None or member is None:
                raise HTTPException(status_code=404, detail="Team or member not found")
            existing = await self.db.scalar(
                select(OrganizationTeamMember).where(
                    OrganizationTeamMember.organization_id == organization_id,
                    OrganizationTeamMember.team_id == team_id,
                    OrganizationTeamMember.organization_member_id == member_id,
                ).with_for_update()
            )
            if existing is None:
                self.db.add(OrganizationTeamMember(
                    organization_id=organization_id,
                    team_id=team_id,
                    organization_member_id=member_id,
                    created_by=actor.id,
                ))
            self._audit(organization_id, actor, "ORGANIZATION_TEAM_MEMBER_ASSIGNED", team.id, None,
                        {"member_id": str(member_id), "reason": reason}, resource_type="organization_team_member")
            await self.db.commit()
            return team
        except Exception:
            await self.db.rollback()
            raise

    async def unassign_member(self, *, organization_id, team_id, member_id, actor, reason: str, audit_action: str = "ORGANIZATION_TEAM_MEMBER_UNASSIGNED") -> OrganizationTeam:
        try:
            team = await self._active_team(organization_id, team_id)
            if team is None:
                raise HTTPException(status_code=404, detail="Team not found")
            membership = await self.db.scalar(
                select(OrganizationTeamMember).where(
                    OrganizationTeamMember.organization_id == organization_id,
                    OrganizationTeamMember.team_id == team_id,
                    OrganizationTeamMember.organization_member_id == member_id,
                ).with_for_update()
            )
            if membership is None:
                raise HTTPException(status_code=404, detail="Team membership not found")
            await self.db.delete(membership)
            self._audit(organization_id, actor, audit_action, team.id,
                        {"member_id": str(member_id)}, {"reason": reason}, resource_type="organization_team_member")
            await self.db.commit()
            return team
        except Exception:
            await self.db.rollback()
            raise

    async def assign_event(self, *, organization_id, team_id, event_id, actor, permissions: dict, reason: str) -> OrganizationTeam:
        try:
            team = await self._active_team(organization_id, team_id)
            event_id_found = await self.db.scalar(
                select(Event.id).where(Event.id == event_id, Event.organization_id == organization_id).with_for_update()
            )
            if team is None or event_id_found is None:
                raise HTTPException(status_code=404, detail="Team or event not found")
            row = await self.db.scalar(
                select(OrganizationTeamEvent).where(
                    OrganizationTeamEvent.organization_id == organization_id,
                    OrganizationTeamEvent.team_id == team_id,
                    OrganizationTeamEvent.event_id == event_id,
                ).with_for_update()
            )
            if row is None:
                self.db.add(OrganizationTeamEvent(
                    organization_id=organization_id,
                    team_id=team_id,
                    event_id=event_id,
                    permissions=permissions,
                    created_by=actor.id,
                ))
            else:
                row.permissions = permissions
            self._audit(organization_id, actor, "ORGANIZATION_TEAM_EVENT_ASSIGNED", team.id, None,
                        {"event_id": str(event_id), "permissions": permissions, "reason": reason})
            await self.db.commit()
            return team
        except Exception:
            await self.db.rollback()
            raise

    async def unassign_event(self, *, organization_id, team_id, event_id, actor, reason: str) -> OrganizationTeam:
        try:
            team = await self._active_team(organization_id, team_id)
            if team is None:
                raise HTTPException(status_code=404, detail="Team not found")
            row = await self.db.scalar(
                select(OrganizationTeamEvent).where(
                    OrganizationTeamEvent.organization_id == organization_id,
                    OrganizationTeamEvent.team_id == team_id,
                    OrganizationTeamEvent.event_id == event_id,
                ).with_for_update()
            )
            if row is None:
                raise HTTPException(status_code=404, detail="Team event assignment not found")
            await self.db.delete(row)
            self._audit(organization_id, actor, "ORGANIZATION_TEAM_EVENT_UNASSIGNED", team.id,
                        {"event_id": str(event_id)}, {"reason": reason})
            await self.db.commit()
            return team
        except Exception:
            await self.db.rollback()
            raise

    async def _active_team(self, organization_id, team_id):
        return await self.db.scalar(
            select(OrganizationTeam).where(
                OrganizationTeam.id == team_id,
                OrganizationTeam.organization_id == organization_id,
                OrganizationTeam.deleted_at.is_(None),
            ).with_for_update()
        )

    def _audit(self, organization_id, actor, action: str, resource_id, old_state, new_state, resource_type: str = "organization_team") -> None:
        self.db.add(AuditLog(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action_type=action,
            resource_type=resource_type,
            resource_id=resource_id,
            old_state=old_state,
            new_state=new_state,
            change_diff={},
            is_sensitive=True,
            occurred_at=datetime.now(timezone.utc),
        ))
