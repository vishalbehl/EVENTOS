"""Transaction-owning organization console export commands."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event
from app.modules.platform.models.organization_console import PrivilegedAccessSession
from app.worker import celery_app


class OrganizationExportCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _require_privileged_access(self, *, organization_id, actor_id, session_id, categories: set[str]):
        if not session_id:
            raise HTTPException(status_code=403, detail="An active privileged access session is required")
        row = await self.db.scalar(select(PrivilegedAccessSession).where(
            PrivilegedAccessSession.id == session_id,
            PrivilegedAccessSession.organization_id == organization_id,
            PrivilegedAccessSession.actor_user_id == actor_id,
            PrivilegedAccessSession.revoked_at.is_(None),
            PrivilegedAccessSession.expires_at > datetime.now(timezone.utc),
        ))
        if not row or not categories.issubset(set(row.field_categories)):
            raise HTTPException(status_code=403, detail="Privileged access session is missing or does not cover the requested fields")
        return row

    async def create(self, *, organization_id, actor, payload, idempotency_key: str,
                     request_hash: str, privileged_access_session_id=None) -> DataExport:
        try:
            if payload.event_id:
                event = await self.db.scalar(select(Event.id).where(
                    Event.id == payload.event_id,
                    Event.organization_id == organization_id,
                ))
                if event is None:
                    raise HTTPException(status_code=404, detail="Event not found")

            access = None
            if payload.include_sensitive:
                access = await self._require_privileged_access(
                    organization_id=organization_id, actor_id=actor.id,
                    session_id=privileged_access_session_id,
                    categories={"IDENTITY", "CONTACT", "PAYMENT"},
                )

            existing = await self.db.scalar(select(DataExport).where(
                DataExport.organization_id == organization_id,
                DataExport.source_type == "organization_console_export",
                DataExport.idempotency_key == idempotency_key,
            ).with_for_update())
            if existing:
                if existing.request_hash != request_hash:
                    raise HTTPException(status_code=409, detail="IDEMPOTENCY_CONFLICT")
                return existing

            request_data = payload.model_dump(mode="json")
            row = DataExport(
                organization_id=organization_id,
                event_id=payload.event_id,
                requested_by=actor.id,
                status="QUEUED",
                export_type="organization_console",
                file_format="csv",
                source_type="organization_console_export",
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                request_metadata={
                    **request_data,
                    "privileged_access_session_id": str(access.id) if access else None,
                },
            )
            self.db.add(row)
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id,
                actor_user_id=actor.id,
                actor_role=actor.role,
                resource_type="data_export",
                resource_id=row.id,
                action_type="ORGANIZATION_CONSOLE_EXPORT_REQUESTED",
                new_state={
                    "domains": payload.domains,
                    "event_id": str(payload.event_id) if payload.event_id else None,
                    "include_sensitive": payload.include_sensitive,
                    "case_reference": payload.case_reference,
                },
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)

            try:
                celery_app.send_task(
                    "workers.tasks.report_tasks.generate_organization_console_export",
                    kwargs={
                        "organization_id": str(organization_id),
                        "requested_by_user_id": str(actor.id),
                        "export_id": str(row.id),
                    },
                )
            except Exception as exc:
                row.status = "FAILED"
                row.failure_reason = "Export worker dispatch failed."
                self.db.add(AuditLog(
                    organization_id=organization_id,
                    actor_user_id=actor.id,
                    actor_role=actor.role,
                    resource_type="data_export",
                    resource_id=row.id,
                    action_type="ORGANIZATION_CONSOLE_EXPORT_DISPATCH_FAILED",
                    new_state={"status": "FAILED"},
                    is_sensitive=True,
                ))
                await self.db.commit()
                raise HTTPException(status_code=503, detail="EXPORT_DISPATCH_FAILED") from exc

            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise
