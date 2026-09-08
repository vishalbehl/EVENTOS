"""Transaction-owning notification-settings commands."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization_console import OrganizationNotificationRule
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response


class OrganizerNotificationCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def toggle_rule(self, *, organization_id, rule_id, actor, is_enabled: bool, if_match: int, idempotency_key: str | None = None) -> OrganizationNotificationRule:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    self.db, organization_id=organization_id, actor_id=actor.id,
                    operation="organiser.organization.notification_rule.toggle", key=idempotency_key,
                    payload={"rule_id": str(rule_id), "is_enabled": is_enabled, "if_match": if_match},
                )
                if replay_response(idem) is not None:
                    row = await self.db.scalar(select(OrganizationNotificationRule).where(
                        OrganizationNotificationRule.id == rule_id,
                        OrganizationNotificationRule.organization_id == organization_id,
                    ).with_for_update())
                    if row is None:
                        raise RuntimeError("Completed notification-rule idempotency resource is missing.")
                    await self.db.commit()
                    return row
            row = await self.db.scalar(select(OrganizationNotificationRule).where(
                OrganizationNotificationRule.id == rule_id,
                OrganizationNotificationRule.organization_id == organization_id,
                OrganizationNotificationRule.deleted_at.is_(None),
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Notification rule not found")
            if row.version != if_match:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                    "code": "VERSION_CONFLICT", "current_version": row.version,
                })
            old_enabled = row.is_enabled
            row.is_enabled = is_enabled
            row.version = int(row.version or 1) + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="organization_notification_rule", resource_id=row.id,
                action_type="ORGANIZATION_NOTIFICATION_RULE_UPDATED",
                old_state={"is_enabled": old_enabled, "version": if_match},
                new_state={"is_enabled": row.is_enabled, "version": row.version},
                is_sensitive=False,
            ))
            if idem is not None:
                await complete_idempotent(
                    self.db, idem, response_status=200,
                    response_body={"id": str(row.id), "is_enabled": row.is_enabled, "version": row.version},
                    resource_id=row.id,
                )
            await self.db.commit()
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise
