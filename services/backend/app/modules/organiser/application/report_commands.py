"""Transaction-owning organizer reporting commands."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog


class OrganizerReportCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_custom_report(self, *, organization_id, actor, values: dict,
                                   idempotency_key: str) -> dict:
        try:
            prior = (await self.db.scalars(select(AuditLog).where(
                AuditLog.organization_id == organization_id,
                AuditLog.action_type == "ORGANISER_CUSTOM_REPORT_CREATED",
            ).order_by(AuditLog.occurred_at.desc()).limit(100))).all()
            existing = next((row for row in prior if (row.new_state or {}).get("idempotency_key") == idempotency_key), None)
            if existing:
                return {"id": str(existing.resource_id), **(existing.new_state or {})}
            report_id = uuid.uuid4()
            state = {**values, "status": "ACTIVE", "idempotency_key": idempotency_key}
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organiser_custom_report",
                resource_id=report_id, action_type="ORGANISER_CUSTOM_REPORT_CREATED",
                new_state=state, is_sensitive=False,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return {"id": str(report_id), **state}
        except Exception:
            await self.db.rollback()
            raise

    async def create_export(self, *, organization_id, actor, snapshot: dict,
                            idempotency_key: str) -> dict:
        try:
            prior = (await self.db.scalars(select(AuditLog).where(
                AuditLog.organization_id == organization_id,
                AuditLog.action_type == "ORGANISER_REPORT_EXPORT_CREATED",
            ).order_by(AuditLog.occurred_at.desc()).limit(100))).all()
            existing = next((row for row in prior if (row.new_state or {}).get("idempotency_key") == idempotency_key), None)
            if existing:
                return {"id": str(existing.resource_id), **(existing.new_state or {})}
            export_id = uuid.uuid4()
            state = {**snapshot, "idempotency_key": idempotency_key}
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organiser_report_export",
                resource_id=export_id, action_type="ORGANISER_REPORT_EXPORT_CREATED",
                new_state=state, is_sensitive=True,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return {"id": str(export_id), **state}
        except Exception:
            await self.db.rollback()
            raise
