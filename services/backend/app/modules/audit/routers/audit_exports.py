from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.config import settings
from app.dependencies import DB, StepUpAuth
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.audit.application.export_commands import AuditExportCommandService
from app.modules.audit.application.export_queries import AuditExportQueryService
from app.modules.audit.services.audit_service import AuditContext, AuditService
from app.modules.platform.support_access import PlatformSupportScopeDependency
from app.modules.presentations.services.upload_service import create_presigned_download
from app.worker import celery_app


router = APIRouter(prefix="/audit-exports", tags=["superadmin-audit-exports"])
IdempotencyKey = Header(..., alias="Idempotency-Key", min_length=8, max_length=128)


class AuditExportCreate(BaseModel):
    reason: str = Field(min_length=12, max_length=500)
    action_type: str | None = Field(None, max_length=80)
    actor_user_id: uuid.UUID | None = None
    occurred_from: datetime | None = None
    occurred_to: datetime | None = None
    sensitive_only: bool = False


class AuditExportOut(BaseModel):
    export_id: uuid.UUID
    organization_id: uuid.UUID
    status: str
    file_format: str
    created_at: datetime
    completed_at: datetime | None = None
    expires_at: datetime | None = None
    failure_reason: str | None = None


class AuditExportDownload(BaseModel):
    download_url: str
    filename: str
    expires_in: int


def _out(export: DataExport) -> AuditExportOut:
    return AuditExportOut(
        export_id=export.id,
        organization_id=export.organization_id,
        status=export.status,
        file_format=export.file_format,
        created_at=export.created_at,
        completed_at=export.completed_at,
        expires_at=export.expires_at,
        failure_reason=export.failure_reason,
    )


@router.post("", response_model=AuditExportOut, status_code=status.HTTP_202_ACCEPTED)
async def create_audit_export(
    payload: AuditExportCreate,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    idempotency_key: str = IdempotencyKey,
) -> AuditExportOut:
    del step_up
    export = await AuditExportCommandService.request(
        db,
        organization_id=support_scope.organization_id,
        actor=support_scope.actor,
        payload=payload.model_dump(mode="json"),
        idempotency_key=idempotency_key,
        dispatch=celery_app.send_task,
    )
    return _out(export)


@router.get("", response_model=list[AuditExportOut])
async def list_audit_exports(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    limit: int = Query(25, ge=1, le=100),
) -> list[AuditExportOut]:
    exports = await AuditExportQueryService(db).list_for_organization(
        organization_id=support_scope.organization_id, limit=limit
    )
    return [_out(item) for item in exports]


@router.get("/{export_id}", response_model=AuditExportOut)
async def get_audit_export(export_id: uuid.UUID, db: DB, support_scope: PlatformSupportScopeDependency) -> AuditExportOut:
    export = await AuditExportQueryService(db).get_for_organization(
        organization_id=support_scope.organization_id, export_id=export_id
    )
    if not export:
        raise HTTPException(status_code=404, detail="Export not found.")
    return _out(export)


@router.get("/{export_id}/download", response_model=AuditExportDownload)
async def download_audit_export(
    export_id: uuid.UUID,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
) -> AuditExportDownload:
    export = await AuditExportQueryService(db).get_for_organization(
        organization_id=support_scope.organization_id, export_id=export_id
    )
    if not export:
        raise HTTPException(status_code=404, detail="Export not found.")
    if export.status != "COMPLETED" or not export.storage_key:
        raise HTTPException(status_code=409, detail={"code": "EXPORT_NOT_READY", "status": export.status})
    now = datetime.now(timezone.utc)
    if export.expires_at and export.expires_at <= now:
        raise HTTPException(status_code=410, detail={"code": "EXPORT_EXPIRED"})
    expiry = min(settings.S3_PRESIGNED_EXPIRY_SECONDS, 300)
    url = await asyncio.to_thread(
        create_presigned_download,
        bucket=settings.S3_BUCKET_EXPORTS,
        storage_path=export.storage_key,
        filename=f"audit-{support_scope.organization_id}.csv",
        expiry_seconds=expiry,
    )
    await AuditService.write_log(AuditContext(
        organization_id=support_scope.organization_id,
        actor_user_id=support_scope.actor.id,
        resource_type="data_export",
        resource_id=export.id,
        action_type="AUDIT_EXPORT_DOWNLOADED",
        actor_role=support_scope.actor.platform_role or support_scope.actor.role,
        new_state={"downloaded_at": now.isoformat(), "access_mode": "READ_ONLY"},
        is_sensitive=True,
    ))
    return AuditExportDownload(download_url=url, filename=f"audit-{support_scope.organization_id}.csv", expires_in=expiry)
