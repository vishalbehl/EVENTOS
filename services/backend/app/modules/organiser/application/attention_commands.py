"""Transaction-owning commands for organiser attention-state transitions."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization_console import OrganizationAttentionState
from app.modules.rbac.models.organization_member import OrganizationMember


class OrganizerAttentionCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def assign(self, *, organization_id, task_id: str, actor, owner_user_id, if_match: int) -> dict:
        try:
            if owner_user_id and not await self.db.scalar(select(OrganizationMember.id).where(
                OrganizationMember.organization_id == organization_id,
                OrganizationMember.user_id == owner_user_id,
                OrganizationMember.is_active.is_(True),
            )):
                raise HTTPException(status_code=422, detail={"code": "OWNER_NOT_IN_ORGANIZATION"})
            row, created = await self._state(organization_id, task_id, actor.id)
            current_version = 0 if created else row.version
            if current_version != if_match:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                    "code": "VERSION_CONFLICT", "current_version": row.version,
                })
            row.owner_user_id = owner_user_id
            row.status = "ASSIGNED" if owner_user_id else "OPEN"
            row.updated_by = actor.id
            row.version = 1 if if_match == 0 else row.version + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="organization_attention", resource_id=row.id,
                action_type="ATTENTION_TASK_ASSIGNED",
                new_state={"task_id": task_id, "owner_user_id": str(owner_user_id) if owner_user_id else None, "version": row.version},
                is_sensitive=False,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return {"id": task_id, "status": row.status.lower(), "owner_user_id": str(row.owner_user_id) if row.owner_user_id else None, "version": row.version}
        except Exception:
            await self.db.rollback()
            raise

    async def resolve(self, *, organization_id, task_id: str, actor, resolution: str, if_match: int) -> dict:
        try:
            row, created = await self._state(organization_id, task_id, actor.id)
            current_version = 0 if created else row.version
            if current_version != if_match:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
            row.status = "RESOLVED"
            row.resolution = resolution
            row.snoozed_until = None
            row.updated_by = actor.id
            row.version = 1 if if_match == 0 else row.version + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="organization_attention", resource_id=row.id,
                action_type="ATTENTION_TASK_RESOLVED",
                new_state={"task_id": task_id, "resolution": resolution, "version": row.version},
                is_sensitive=False,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return {"id": task_id, "status": "resolved", "version": row.version}
        except Exception:
            await self.db.rollback()
            raise

    async def snooze(self, *, organization_id, task_id: str, actor, snoozed_until: datetime,
                     reason: str, if_match: int) -> dict:
        try:
            row, created = await self._state(organization_id, task_id, actor.id)
            current_version = 0 if created else row.version
            if current_version != if_match:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                    "code": "VERSION_CONFLICT", "current_version": row.version,
                })
            row.status = "SNOOZED"
            row.snoozed_until = snoozed_until
            row.resolution = reason
            row.updated_by = actor.id
            row.version = 1 if if_match == 0 else row.version + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="organization_attention", resource_id=row.id,
                action_type="ATTENTION_TASK_SNOOZED",
                new_state={"task_id": task_id, "until": snoozed_until.isoformat(),
                           "reason": reason, "version": row.version}, is_sensitive=False,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return {"id": task_id, "status": "snoozed", "snoozed_until": snoozed_until.isoformat(), "version": row.version}
        except Exception:
            await self.db.rollback()
            raise

    async def _state(self, organization_id, task_id: str, actor_id):
        row = await self.db.scalar(select(OrganizationAttentionState).where(
            OrganizationAttentionState.organization_id == organization_id,
            OrganizationAttentionState.task_key == task_id,
        ).with_for_update())
        if row is None:
            row = OrganizationAttentionState(organization_id=organization_id, task_key=task_id, updated_by=actor_id)
            self.db.add(row)
            await self.db.flush()
            return row, True
        return row, False
