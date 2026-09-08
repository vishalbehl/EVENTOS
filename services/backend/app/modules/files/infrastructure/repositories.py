"""Tenant-aware, transaction-neutral repositories for file records."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.modules.files.models.file import DurableUpload


class DurableUploadRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def scoped_statement(self, *, upload_id: uuid.UUID, organization_id: uuid.UUID):
        return select(DurableUpload).where(
            DurableUpload.id == upload_id,
            DurableUpload.organization_id == organization_id,
        )

    async def get_by_id(
        self,
        *,
        upload_id: uuid.UUID,
        organization_id: uuid.UUID,
        for_update: bool = False,
    ) -> DurableUpload | None:
        statement = self.scoped_statement(
            upload_id=upload_id,
            organization_id=organization_id,
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.db.scalar(statement)

    async def get_status(
        self, *, upload_id: uuid.UUID, organization_id: uuid.UUID
    ) -> DurableUpload | None:
        return await self.db.scalar(
            self.scoped_statement(
                upload_id=upload_id,
                organization_id=organization_id,
            ).options(
                load_only(
                    DurableUpload.id,
                    DurableUpload.status,
                    DurableUpload.processing_error,
                    DurableUpload.created_at,
                    DurableUpload.updated_at,
                    DurableUpload.completed_at,
                    DurableUpload.version,
                )
            )
        )

    def create(self, entity: DurableUpload) -> DurableUpload:
        self.db.add(entity)
        return entity

    async def delete(self, entity: DurableUpload) -> None:
        await self.db.delete(entity)
