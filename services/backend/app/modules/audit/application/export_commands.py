"""Application-owned audit-export commands."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.database import tenant_org_id
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.audit.models.audit_log import AuditLog
from app.modules.commercial.quote_service import request_fingerprint


class AuditExportCommandService:
    """Persist an export request before dispatching its background work."""

    @staticmethod
    @asynccontextmanager
    async def _tenant_scope(db: AsyncSession, organization_id):
        """Apply tenant state without opening a new transaction on exit."""
        token = tenant_org_id.set(organization_id)
        try:
            await TenantContextGuard.apply(db, organization_id)
            yield
        finally:
            tenant_org_id.reset(token)

    @staticmethod
    async def request(
        db: AsyncSession,
        *,
        organization_id,
        actor,
        payload: dict,
        idempotency_key: str,
        dispatch,
    ) -> DataExport:
        fingerprint = request_fingerprint(payload)
        try:
            result: DataExport
            async with AuditExportCommandService._tenant_scope(db, organization_id):
                existing = await db.scalar(
                    select(DataExport).where(
                        DataExport.organization_id == organization_id,
                        DataExport.source_type == "audit_log_export",
                        DataExport.idempotency_key == idempotency_key,
                    )
                )
                if existing:
                    if existing.request_hash != fingerprint:
                        raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
                    result = existing
                else:
                    export = DataExport(
                        organization_id=organization_id,
                        requested_by=actor.id,
                        status="QUEUED",
                        export_type="audit_logs",
                        file_format="csv",
                        source_type="audit_log_export",
                        idempotency_key=idempotency_key,
                        request_hash=fingerprint,
                        request_metadata=payload,
                    )
                    db.add(export)
                    await db.flush()
                    db.add(AuditLog(
                        organization_id=organization_id,
                        actor_user_id=actor.id,
                        resource_type="data_export",
                        resource_id=export.id,
                        action_type="AUDIT_EXPORT_REQUESTED",
                        actor_role=actor.platform_role or actor.role,
                        new_state={"status": "QUEUED", "format": "csv"},
                        change_diff={"reason": payload.get("reason"), "filters": payload},
                        is_sensitive=True,
                    ))
                    await db.commit()
                    try:
                        dispatch(
                            "workers.tasks.report_tasks.generate_audit_log_export",
                            kwargs={
                                "organization_id": str(organization_id),
                                "requested_by_user_id": str(actor.id),
                                "export_id": str(export.id),
                            },
                        )
                    except Exception as exc:
                        export.status = "FAILED"
                        export.failure_reason = "Audit export worker dispatch failed."
                        db.add(AuditLog(
                            organization_id=organization_id,
                            actor_user_id=actor.id,
                            resource_type="data_export",
                            resource_id=export.id,
                            action_type="AUDIT_EXPORT_DISPATCH_FAILED",
                            actor_role=actor.platform_role or actor.role,
                            new_state={"status": "FAILED"},
                            is_sensitive=True,
                        ))
                        await db.commit()
                        raise HTTPException(status_code=503, detail={"code": "EXPORT_DISPATCH_FAILED"}) from exc
                    result = export
            return result
        except HTTPException:
            # Expected API conflicts and durable dispatch failures do not need
            # to roll back the caller's nested test/request transaction.
            raise
        except Exception:
            await db.rollback()
            raise
