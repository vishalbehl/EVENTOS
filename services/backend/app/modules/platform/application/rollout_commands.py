"""Transaction-owning organizer-console rollout commands."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.platform_domain_tables import FeatureFlag
from app.worker import celery_app


class OrganizationRolloutCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def update(self, *, organization_id, actor, shadow_enabled: bool,
                     enforcement_enabled: bool, missing_contract_count: int,
                     reason: str) -> dict:
        try:
            old = {}
            for key, enabled in (
                ("organizer_console_entitlement_shadow", shadow_enabled),
                ("organizer_console_entitlement_enforce", enforcement_enabled),
            ):
                row = await self.db.scalar(select(FeatureFlag).where(
                    FeatureFlag.organization_id == organization_id,
                    FeatureFlag.flag_key == key,
                ).with_for_update())
                old[key] = row.is_enabled if row else None
                if row:
                    row.is_enabled = enabled
                else:
                    self.db.add(FeatureFlag(
                        organization_id=organization_id, flag_key=key,
                        is_enabled=enabled,
                    ))
            backfill_queued = bool(shadow_enabled and not enforcement_enabled and missing_contract_count)
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization",
                resource_id=organization_id, action_type="ORGANIZER_CONSOLE_ROLLOUT_UPDATED",
                old_state=old,
                new_state={"shadow_enabled": shadow_enabled,
                           "enforcement_enabled": enforcement_enabled,
                           "reason": reason}, is_sensitive=True,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            if backfill_queued:
                try:
                    celery_app.send_task(
                        "app.tasks.organization_console_rollout_tasks.backfill_organization_console",
                        args=[str(organization_id), True],
                    )
                except Exception:
                    # The durable flag update succeeded; the scheduled repair can be retried.
                    backfill_queued = False
            return {
                "shadow_enabled": shadow_enabled,
                "enforcement_enabled": enforcement_enabled,
                "backfill_queued": backfill_queued,
                "missing_contracts": missing_contract_count,
            }
        except Exception:
            await self.db.rollback()
            raise
