"""Transaction-owning organization usage commands."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.services.metering_service import MeteringService


class OrganizationUsageCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def reconcile(self, *, organization_id, event_id, actor) -> dict:
        try:
            rows = await MeteringService.reconcile_event(self.db, organization_id, event_id)
            drifted = [row for row in rows if row.status == "DRIFTED"]
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="event", resource_id=event_id,
                action_type="USAGE_RECONCILIATION_COMPLETED",
                new_state={"metric_count": len(rows),
                           "drifted_metrics": [row.metric_key for row in drifted]},
                is_sensitive=bool(drifted),
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return {
                "event_id": event_id,
                "status": "DRIFTED" if drifted else "MATCHED",
                "items": [{"metric_key": row.metric_key, "ledger_value": row.ledger_value,
                            "authoritative_value": row.authoritative_value, "drift": row.drift,
                            "status": row.status, "source": row.source} for row in rows],
            }
        except Exception:
            await self.db.rollback()
            raise
