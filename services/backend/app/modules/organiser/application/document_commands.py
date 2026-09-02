"""Transaction-owning organization document commands."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.files.services.file_service import FileService
from app.modules.platform.models.organization_console import OrganizationDocument


class OrganizerDocumentCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def archive(self, *, organization_id, document_id, actor, if_match: int) -> None:
        try:
            row = await self.db.scalar(select(OrganizationDocument).where(
                OrganizationDocument.id == document_id,
                OrganizationDocument.organization_id == organization_id,
                OrganizationDocument.archived_at.is_(None),
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail={"code": "DOCUMENT_NOT_FOUND"})
            if row.version != if_match:
                raise HTTPException(status_code=409, detail={
                    "code": "VERSION_CONFLICT", "current_version": row.version,
                })
            row.archived_at = datetime.now(timezone.utc)
            row.version = int(row.version or 1) + 1
            self.db.add(AuditLog(
                organization_id=organization_id,
                actor_user_id=actor.id,
                actor_role=actor.role,
                resource_type="organization_document",
                resource_id=row.id,
                action_type="ORGANIZATION_DOCUMENT_ARCHIVED",
                old_state={"version": if_match},
                new_state={"version": row.version},
                is_sensitive=True,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
        except Exception:
            await self.db.rollback()
            raise

    async def upload(self, *, organization_id, actor, document_type: str,
                     expires_at, filename: str, content_type: str, file_data: bytes) -> dict:
        try:
            asset = await FileService.upload_asset(
                self.db, organization_id, actor.id, filename, content_type,
                file_data, ["organization-document", document_type],
            )
            row = OrganizationDocument(
                organization_id=organization_id, asset_id=asset.id, name=filename,
                document_type=document_type, expires_at=expires_at, created_by=actor.id,
            )
            self.db.add(row)
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_document",
                resource_id=row.id, action_type="ORGANIZATION_DOCUMENT_UPLOADED",
                new_state={"name": row.name, "document_type": document_type,
                           "asset_id": str(asset.id)}, is_sensitive=True,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return {"id": str(row.id), "document_group_id": str(row.document_group_id),
                    "revision": row.revision, "asset_id": str(asset.id),
                    "name": row.name, "processing_status": asset.processing_status,
                    "version": row.version}
        except Exception:
            await self.db.rollback()
            raise

    async def replace(self, *, organization_id, document_id, actor, if_match: int,
                      expires_at, filename: str, content_type: str, file_data: bytes) -> dict:
        try:
            current = await self.db.scalar(select(OrganizationDocument).where(
                OrganizationDocument.id == document_id,
                OrganizationDocument.organization_id == organization_id,
                OrganizationDocument.archived_at.is_(None),
                OrganizationDocument.is_current.is_(True),
            ).with_for_update())
            if current is None:
                raise HTTPException(status_code=404, detail={"code": "DOCUMENT_NOT_FOUND"})
            if current.version != if_match:
                raise HTTPException(status_code=409, detail={
                    "code": "VERSION_CONFLICT", "current_version": current.version,
                })
            asset = await FileService.upload_asset(
                self.db, organization_id, actor.id, filename, content_type, file_data,
                ["organization-document", current.document_type, "replacement"],
            )
            previous_revision = current.revision
            current.is_current = False
            current.version = int(current.version or 1) + 1
            replacement = OrganizationDocument(
                organization_id=organization_id, document_group_id=current.document_group_id,
                revision=previous_revision + 1, asset_id=asset.id, name=filename,
                document_type=current.document_type,
                expires_at=expires_at if expires_at is not None else current.expires_at,
                created_by=actor.id,
            )
            self.db.add(replacement)
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_document",
                resource_id=replacement.id, action_type="ORGANIZATION_DOCUMENT_REPLACED",
                old_state={"document_id": str(current.id), "revision": current.revision},
                new_state={"document_id": str(replacement.id),
                           "revision": replacement.revision, "asset_id": str(asset.id)},
                is_sensitive=True,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return {"id": str(replacement.id), "document_group_id": str(replacement.document_group_id),
                    "revision": replacement.revision, "asset_id": str(asset.id),
                    "name": replacement.name, "processing_status": asset.processing_status,
                    "version": replacement.version}
        except Exception:
            await self.db.rollback()
            raise
