"""Bounded, tenant-scoped audit-export reads."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.modules.audit.models.audit_domain_tables import DataExport


class AuditExportQueryService:
    """Read only the columns required by audit-export screens."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_organization(self, *, organization_id: uuid.UUID, limit: int = 25) -> list[DataExport]:
        bounded = max(1, min(limit, self.MAX_PAGE_SIZE))
        return list((await self.db.scalars(
            select(DataExport)
            .options(load_only(
                DataExport.id,
                DataExport.organization_id,
                DataExport.status,
                DataExport.file_format,
                DataExport.created_at,
                DataExport.completed_at,
                DataExport.expires_at,
                DataExport.failure_reason,
                DataExport.storage_key,
            ))
            .where(
                DataExport.organization_id == organization_id,
                DataExport.source_type == "audit_log_export",
            )
            .order_by(DataExport.created_at.desc(), DataExport.id.desc())
            .limit(bounded)
        )).all())

    async def get_for_organization(self, *, organization_id: uuid.UUID, export_id: uuid.UUID) -> DataExport | None:
        return await self.db.scalar(
            select(DataExport).options(load_only(
                DataExport.id,
                DataExport.organization_id,
                DataExport.status,
                DataExport.file_format,
                DataExport.created_at,
                DataExport.completed_at,
                DataExport.expires_at,
                DataExport.failure_reason,
                DataExport.storage_key,
            )).where(
                DataExport.id == export_id,
                DataExport.organization_id == organization_id,
                DataExport.source_type == "audit_log_export",
            )
        )
