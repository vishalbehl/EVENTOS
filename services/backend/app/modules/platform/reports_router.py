from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.tenant_context import TenantContextGuard
from app.dependencies import get_db
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.audit.models.audit_log import AuditLog
from app.modules.audit.services.audit_service import AuditContext, AuditService
from app.modules.commercial.quote_service import request_fingerprint
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.platform.application.governed_mutation_commands import GovernedMutationCommandService
from app.modules.platform.report_schemas import (
    CommercialExportCreate,
    CommercialExportDownload,
    CommercialExportOut,
    CommercialReportType,
    REPORT_FORMATS,
)
from app.modules.presentations.services.upload_service import create_presigned_download
from app.modules.superadmin.dependencies import require_super_admin
from app.worker import celery_app


router = APIRouter(prefix="/reports", tags=["superadmin-reports"])
COMMERCIAL_EXPORT_PREFIX = "commercial_"


def _out(export: DataExport) -> CommercialExportOut:
    return CommercialExportOut(
        export_id=export.id,
        organization_id=export.organization_id,
        report_type=CommercialReportType(export.export_type.removeprefix(COMMERCIAL_EXPORT_PREFIX)),
        status=export.status,
        file_format=export.file_format,
        created_at=export.created_at,
        completed_at=export.completed_at,
        expires_at=export.expires_at,
        failure_reason=export.failure_reason,
    )


@router.post("/exports", response_model=CommercialExportOut, status_code=status.HTTP_202_ACCEPTED)
async def create_commercial_export(
    payload: CommercialExportCreate,
    current_user: User = Depends(require_super_admin),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    db: AsyncSession = Depends(get_db),
) -> CommercialExportOut:
    command = GovernedMutationCommandService(db)
    export_type = f"{COMMERCIAL_EXPORT_PREFIX}{payload.report_type.value}"
    file_format = REPORT_FORMATS[payload.report_type]
    fingerprint = request_fingerprint(payload.model_dump(mode="json"))

    async with TenantContextGuard.scoped(db, payload.organization_id):
        organization = await db.scalar(
            select(Organization).where(Organization.id == payload.organization_id).with_for_update()
        )
        if organization is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")

        existing = await db.scalar(
            select(DataExport).where(
                DataExport.organization_id == payload.organization_id,
                DataExport.export_type == export_type,
                DataExport.idempotency_key == idempotency_key,
            )
        )
        if existing:
            if existing.request_hash != fingerprint:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="IDEMPOTENCY_CONFLICT")
            return _out(existing)

        export = DataExport(
            organization_id=payload.organization_id,
            requested_by=current_user.id,
            status="QUEUED",
            export_type=export_type,
            file_format=file_format.value,
            source_type="commercial_report",
            idempotency_key=idempotency_key,
            request_hash=fingerprint,
            request_metadata={
                "report_type": payload.report_type.value,
                "organization_name": organization.name,
                "reason": payload.reason,
            },
        )
        db.add(export)
        await db.flush()
        db.add(AuditLog(
            organization_id=payload.organization_id,
            actor_user_id=current_user.id,
            resource_type="data_export",
            resource_id=export.id,
            action_type="COMMERCIAL_EXPORT_REQUESTED",
            actor_role=getattr(current_user, "platform_role", None) or current_user.role,
            new_state={
                "report_type": payload.report_type.value,
                "file_format": file_format.value,
                "status": export.status,
            },
            change_diff={"reason": payload.reason},
            is_sensitive=True,
        ))
        await command.commit(organization_id=payload.organization_id)

        try:
            celery_app.send_task(
                "workers.tasks.report_tasks.generate_commercial_report_export",
                kwargs={
                    "organization_id": str(payload.organization_id),
                    "requested_by_user_id": str(current_user.id),
                    "export_id": str(export.id),
                    "report_type": payload.report_type.value,
                },
            )
        except Exception:
            export.status = "FAILED"
            export.failure_reason = "Commercial report worker dispatch failed."
            db.add(AuditLog(
                organization_id=payload.organization_id,
                actor_user_id=current_user.id,
                resource_type="data_export",
                resource_id=export.id,
                action_type="COMMERCIAL_EXPORT_DISPATCH_FAILED",
                actor_role=getattr(current_user, "platform_role", None) or current_user.role,
                new_state={"report_type": payload.report_type.value, "status": "FAILED"},
                is_sensitive=True,
            ))
            await command.commit(organization_id=payload.organization_id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "EXPORT_DISPATCH_FAILED", "export_id": str(export.id)},
            )
        return _out(export)


@router.get("/exports", response_model=list[CommercialExportOut])
async def list_commercial_exports(
    organization_id: uuid.UUID,
    report_type: CommercialReportType | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> list[CommercialExportOut]:
    del current_user
    async with TenantContextGuard.scoped(db, organization_id):
        query = select(DataExport).where(
            DataExport.organization_id == organization_id,
            DataExport.source_type == "commercial_report",
        )
        if report_type:
            query = query.where(DataExport.export_type == f"{COMMERCIAL_EXPORT_PREFIX}{report_type.value}")
        exports = list((await db.scalars(query.order_by(DataExport.created_at.desc()).limit(limit))).all())
        return [_out(item) for item in exports]


@router.get("/exports/{export_id}", response_model=CommercialExportOut)
async def get_commercial_export(
    export_id: uuid.UUID,
    organization_id: uuid.UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> CommercialExportOut:
    del current_user
    async with TenantContextGuard.scoped(db, organization_id):
        export = await db.scalar(select(DataExport).where(
            DataExport.id == export_id,
            DataExport.organization_id == organization_id,
            DataExport.source_type == "commercial_report",
        ))
        if export is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found.")
        return _out(export)


@router.get("/exports/{export_id}/download", response_model=CommercialExportDownload)
async def download_commercial_export(
    export_id: uuid.UUID,
    organization_id: uuid.UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> CommercialExportDownload:
    async with TenantContextGuard.scoped(db, organization_id):
        export = await db.scalar(select(DataExport).where(
            DataExport.id == export_id,
            DataExport.organization_id == organization_id,
            DataExport.source_type == "commercial_report",
        ))
        if export is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found.")
        if export.status != "COMPLETED" or not export.storage_key:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "EXPORT_NOT_READY", "status": export.status},
            )
        now = datetime.now(timezone.utc)
        if export.expires_at and export.expires_at <= now:
            raise HTTPException(status_code=status.HTTP_410_GONE, detail={"code": "EXPORT_EXPIRED"})

        report_type = export.export_type.removeprefix(COMMERCIAL_EXPORT_PREFIX)
        filename = f"{report_type}.{export.file_format}"
        download_url = await asyncio.to_thread(
            create_presigned_download,
            bucket=settings.S3_BUCKET_EXPORTS,
            storage_path=export.storage_key,
            filename=filename,
            expiry_seconds=min(settings.S3_PRESIGNED_EXPIRY_SECONDS, 300),
        )
        await AuditService.write_log(AuditContext(
            organization_id=organization_id,
            actor_user_id=current_user.id,
            resource_type="data_export",
            resource_id=export.id,
            action_type="COMMERCIAL_EXPORT_DOWNLOADED",
            actor_role=getattr(current_user, "platform_role", None) or current_user.role,
            new_state={"report_type": report_type, "downloaded_at": now.isoformat(), "access_mode": "READ_ONLY"},
            is_sensitive=True,
        ))
        return CommercialExportDownload(
            download_url=download_url,
            filename=filename,
            expires_in=min(settings.S3_PRESIGNED_EXPIRY_SECONDS, 300),
        )
