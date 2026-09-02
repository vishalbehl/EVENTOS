"""Transaction-owning approval-rule commands for the organiser portal."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event
from app.modules.platform.models.organization_console import OrganizationApprovalRule


class OrganizerApprovalRuleCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, *, organization_id, actor, values: dict) -> OrganizationApprovalRule:
        try:
            await self._verify_event(organization_id, values.get("event_id"))
            row = OrganizationApprovalRule(organization_id=organization_id, created_by=actor.id, **values)
            self.db.add(row)
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="organization_approval_rule", resource_id=row.id,
                action_type="ORGANIZATION_APPROVAL_RULE_CREATED",
                new_state={"name": row.name, "domain": row.domain, "version": row.version},
                is_sensitive=True,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def update(self, *, organization_id, rule_id, actor, values: dict, if_match: int) -> OrganizationApprovalRule:
        try:
            await self._verify_event(organization_id, values.get("event_id"))
            row = await self.db.scalar(select(OrganizationApprovalRule).where(
                OrganizationApprovalRule.id == rule_id,
                OrganizationApprovalRule.organization_id == organization_id,
                OrganizationApprovalRule.archived_at.is_(None),
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail={"code": "APPROVAL_RULE_NOT_FOUND"})
            if row.version != if_match:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                    "code": "VERSION_CONFLICT", "current_version": row.version,
                })
            for key, value in values.items():
                setattr(row, key, value)
            row.version = int(row.version or 1) + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="organization_approval_rule", resource_id=row.id,
                action_type="ORGANIZATION_APPROVAL_RULE_UPDATED",
                old_state={"version": if_match},
                new_state={"version": row.version}, is_sensitive=True,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def _verify_event(self, organization_id, event_id) -> None:
        if event_id and not await self.db.scalar(select(Event.id).where(
            Event.id == event_id, Event.organization_id == organization_id,
        )):
            raise HTTPException(status_code=404, detail={"code": "EVENT_NOT_FOUND"})
