"""Transaction-owning organization notification-rule commands."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization_console import OrganizationNotificationRule


class OrganizationNotificationRuleCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, *, organization_id, actor, values: dict, reason: str):
        try:
            name = values["name"].strip()
            duplicate = await self.db.scalar(select(OrganizationNotificationRule.id).where(
                OrganizationNotificationRule.organization_id == organization_id,
                func.lower(OrganizationNotificationRule.name) == name.lower(),
                OrganizationNotificationRule.deleted_at.is_(None),
            ))
            if duplicate:
                raise HTTPException(status_code=409, detail="An active notification rule with this name already exists")
            values["name"] = name
            row = OrganizationNotificationRule(organization_id=organization_id, **values)
            self.db.add(row)
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_notification_rule",
                resource_id=row.id, action_type="ORGANIZATION_NOTIFICATION_RULE_CREATED",
                new_state={**values, "reason": reason}, is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def update(self, *, organization_id, rule_id, actor, values: dict,
                     if_match: int, reason: str):
        try:
            row = await self.db.scalar(select(OrganizationNotificationRule).where(
                OrganizationNotificationRule.id == rule_id,
                OrganizationNotificationRule.organization_id == organization_id,
                OrganizationNotificationRule.deleted_at.is_(None),
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Notification rule not found")
            if row.version != if_match:
                raise HTTPException(status_code=409, detail="VERSION_CONFLICT")
            old = {
                "name": row.name, "trigger_key": row.trigger_key,
                "channel": row.channel, "version": row.version,
            }
            for key, value in values.items():
                setattr(row, key, value)
            row.version = int(row.version or 1) + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_notification_rule",
                resource_id=row.id, action_type="ORGANIZATION_NOTIFICATION_RULE_UPDATED",
                old_state=old, new_state={**values, "version": row.version, "reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def archive(self, *, organization_id, rule_id, actor, if_match: int,
                      reason: str):
        try:
            row = await self.db.scalar(select(OrganizationNotificationRule).where(
                OrganizationNotificationRule.id == rule_id,
                OrganizationNotificationRule.organization_id == organization_id,
                OrganizationNotificationRule.deleted_at.is_(None),
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Notification rule not found")
            if row.version != if_match:
                raise HTTPException(status_code=409, detail="VERSION_CONFLICT")
            row.deleted_at = datetime.now(timezone.utc)
            row.is_enabled = False
            row.version = int(row.version or 1) + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_notification_rule",
                resource_id=row.id, action_type="ORGANIZATION_NOTIFICATION_RULE_ARCHIVED",
                new_state={"deleted_at": row.deleted_at.isoformat(), "reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise
