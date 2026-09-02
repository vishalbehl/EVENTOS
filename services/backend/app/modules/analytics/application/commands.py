"""Transaction-owned commands for analytics workflows."""
from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.audit.services.audit_service import AuditContext, AuditService
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.worker import celery_app


class AnalyticsExportCommandService:
    """Create durable analytics exports and own their command transaction."""

    @staticmethod
    def _request_hash(event_id: uuid.UUID, file_format: str) -> str:
        payload = {"event_id": str(event_id), "format": file_format}
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()

    @staticmethod
    def _response(export: DataExport) -> dict[str, Any]:
        return {
            "export_id": str(export.id),
            "status": export.status,
            "event_id": str(export.event_id),
            "format": export.file_format,
        }

    @classmethod
    async def request(
        cls,
        db: AsyncSession,
        *,
        event,
        actor,
        idempotency_key: str,
        file_format: str,
    ) -> dict[str, Any]:
        request_hash = cls._request_hash(event.id, file_format)
        try:
            async with TenantContextGuard.scoped(db, event.organization_id):
                existing = await db.scalar(
                    select(DataExport)
                    .where(
                        DataExport.organization_id == event.organization_id,
                        DataExport.event_id == event.id,
                        DataExport.export_type == "event_summary",
                        DataExport.idempotency_key == idempotency_key,
                    )
                    .with_for_update()
                )
                if existing:
                    if existing.request_hash != request_hash:
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail={"code": "IDEMPOTENCY_CONFLICT"},
                        )
                    return cls._response(existing)

                reservation = await UsageReservationService.reserve(
                    db,
                    organization_id=event.organization_id,
                    event_id=event.id,
                    limit_key="max_exports_per_event",
                    quantity=1,
                    unit="export",
                    idempotency_key=f"analytics-export:{idempotency_key}",
                    metadata={"format": file_format, "domain": "analytics"},
                )
                export = DataExport(
                    organization_id=event.organization_id,
                    event_id=event.id,
                    requested_by=actor.id,
                    status="QUEUED",
                    export_type="event_summary",
                    file_format=file_format,
                    source_type="analytics",
                    idempotency_key=idempotency_key,
                    request_hash=request_hash,
                    request_metadata={
                        "source": "analytics",
                        "event_name": event.name,
                    },
                )
                db.add(export)
                await db.flush()
                await AuditService.write_log_sync(
                    AuditContext(
                        action_type="EXPORT_REQUESTED",
                        resource_type="data_export",
                        resource_id=export.id,
                        actor_user_id=actor.id,
                        organization_id=event.organization_id,
                        actor_role=getattr(actor, "role", None),
                        new_state={
                            "event_id": str(event.id),
                            "export_type": export.export_type,
                            "file_format": export.file_format,
                            "status": export.status,
                        },
                    ),
                    db,
                )
                await UsageReservationService.consume(
                    db,
                    reservation.id,
                    source="organizer_portal.analytics.export",
                    actor_user_id=actor.id,
                )
                response = cls._response(export)
                await db.commit()

            try:
                celery_app.send_task(
                    "workers.tasks.report_tasks.generate_event_summary_report",
                    kwargs={
                        "event_id": str(event.id),
                        "organization_id": str(event.organization_id),
                        "requested_by_user_id": str(actor.id),
                        "export_id": str(export.id),
                    },
                )
            except Exception:
                # The durable row remains available for reconciliation/retry.
                async with TenantContextGuard.scoped(db, event.organization_id):
                    failed_export = await db.scalar(
                        select(DataExport)
                        .where(
                            DataExport.id == export.id,
                            DataExport.organization_id == event.organization_id,
                        )
                        .with_for_update()
                    )
                    if failed_export is not None:
                        failed_export.status = "FAILED"
                        failed_export.failure_reason = "Analytics export worker dispatch failed."
                    await db.commit()
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={"code": "EXPORT_DISPATCH_FAILED"},
                )
            return response
        except HTTPException:
            await db.rollback()
            raise
        except Exception:
            await db.rollback()
            raise
