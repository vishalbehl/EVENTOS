import uuid
import os
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import select, delete, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.files.models.file import Asset, AssetVersion, AssetTag, AssetPermission, UploadSession, VirusScan
from app.modules.presentations.services.upload_service import upload_bytes, delete_object, create_presigned_download
from app.config import settings
from loguru import logger

class FileService:
    @staticmethod
    async def list_assets(
        db: AsyncSession,
        org_id: uuid.UUID,
        query: Optional[str] = None,
        tag: Optional[str] = None,
        mime_type: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> List[Asset]:
        filters = [Asset.organization_id == org_id]
        if query:
            filters.append(Asset.name.ilike(f"%{query}%"))
        if mime_type:
            filters.append(Asset.mime_type == mime_type)
            
        stmt = select(Asset).where(*filters)
        
        if tag:
            stmt = stmt.join(AssetTag).where(AssetTag.tag == tag)
            
        stmt = stmt.options(
            selectinload(Asset.versions),
            selectinload(Asset.tags),
            selectinload(Asset.permissions),
            selectinload(Asset.virus_scans)
        ).order_by(Asset.created_at.desc()).offset(offset).limit(limit)
        
        result = await db.execute(stmt)
        return list(result.scalars().unique().all())

    @staticmethod
    async def get_asset(db: AsyncSession, org_id: uuid.UUID, asset_id: uuid.UUID) -> Optional[Asset]:
        stmt = select(Asset).where(
            Asset.organization_id == org_id,
            Asset.id == asset_id
        ).options(
            selectinload(Asset.versions),
            selectinload(Asset.tags),
            selectinload(Asset.permissions),
            selectinload(Asset.virus_scans)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_upload_session(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID) -> UploadSession:
        session = UploadSession(
            id=uuid.uuid4(),
            organization_id=org_id,
            user_id=user_id,
            status="initiated"
        )
        db.add(session)
        await db.flush()
        return session

    @staticmethod
    async def upload_asset(
        db: AsyncSession,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        filename: str,
        content_type: str,
        file_data: bytes,
        tags: List[str] = []
    ) -> Asset:
        asset_id = uuid.uuid4()
        storage_path = f"{org_id}/assets/{asset_id}/1_{filename}"
        
        # Save to S3/local storage
        upload_bytes(settings.S3_BUCKET_ASSETS, storage_path, file_data, content_type)
        
        asset = Asset(
            id=asset_id,
            organization_id=org_id,
            name=filename,
            file_path=storage_path,
            file_size_bytes=len(file_data),
            mime_type=content_type,
            processing_status="QUARANTINED",
            created_at=datetime.now(timezone.utc)
        )
        db.add(asset)
        
        version = AssetVersion(
            id=uuid.uuid4(),
            asset_id=asset_id,
            version_number=1,
            file_path=storage_path,
            created_at=datetime.now(timezone.utc)
        )
        db.add(version)
        
        for t in tags:
            tag_rec = AssetTag(
                id=uuid.uuid4(),
                asset_id=asset_id,
                tag=t
            )
            db.add(tag_rec)
            
        await db.flush()
        
        scan = VirusScan(
            id=uuid.uuid4(),
            asset_id=asset_id,
            status="pending",
            scanned_at=datetime.now(timezone.utc),
        )
        db.add(scan)
        await db.flush()

        # Trigger virus scan Celery task. The asset remains quarantined if queuing fails.
        try:
            from workers.tasks.file_tasks import scan_file_for_viruses
            scan_file_for_viruses.delay(str(asset_id), str(org_id))
        except Exception as exc:
            logger.exception(f"Failed to queue virus scan for asset {asset_id}: {exc}")
            
        return asset

    @staticmethod
    async def add_tags(db: AsyncSession, org_id: uuid.UUID, asset_id: uuid.UUID, tags: List[str]) -> List[str]:
        asset = await FileService.get_asset(db, org_id, asset_id)
        if not asset:
            return []
        
        existing_tags = {t.tag for t in asset.tags}
        added = []
        for t in tags:
            if t not in existing_tags:
                tag_rec = AssetTag(
                    id=uuid.uuid4(),
                    asset_id=asset_id,
                    tag=t
                )
                db.add(tag_rec)
                asset.tags.append(tag_rec)
                added.append(t)
        return added

    @staticmethod
    async def remove_tag(db: AsyncSession, org_id: uuid.UUID, asset_id: uuid.UUID, tag: str) -> bool:
        asset = await FileService.get_asset(db, org_id, asset_id)
        if not asset:
            return False
        
        asset.tags = [t for t in asset.tags if t.tag != tag]
        
        stmt = delete(AssetTag).where(
            AssetTag.asset_id == asset_id,
            AssetTag.tag == tag
        )
        await db.execute(stmt)
        return True

    @staticmethod
    async def delete_asset(db: AsyncSession, org_id: uuid.UUID, asset_id: uuid.UUID) -> bool:
        asset = await FileService.get_asset(db, org_id, asset_id)
        if not asset:
            return False
            
        for ver in asset.versions:
            try:
                delete_object(settings.S3_BUCKET_ASSETS, ver.file_path)
            except Exception as exc:
                logger.warning(f"Failed to delete object {ver.file_path}: {exc}")
                
        await db.execute(delete(AssetTag).where(AssetTag.asset_id == asset_id))
        await db.execute(delete(AssetVersion).where(AssetVersion.asset_id == asset_id))
        await db.execute(delete(AssetPermission).where(AssetPermission.asset_id == asset_id))
        await db.execute(delete(VirusScan).where(VirusScan.asset_id == asset_id))
        await db.execute(delete(Asset).where(Asset.id == asset_id))
        
        return True
