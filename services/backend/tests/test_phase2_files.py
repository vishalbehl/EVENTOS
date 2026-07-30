import pytest
import pytest_asyncio
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.testclient import TestClient

from app.modules.files.models.file import Asset, AssetVersion, AssetTag, VirusScan
from app.modules.files.services.file_service import FileService
from app.core.tenant_context import TenantContextGuard


@pytest_asyncio.fixture
async def verified_tenant_context(db: AsyncSession, organization):
    async with TenantContextGuard.scoped(db, organization.id):
        yield

@pytest.mark.asyncio
async def test_file_upload_and_tagging(
    db: AsyncSession,
    organization,
    organizer,
    verified_tenant_context,
):
    org_id = organization.id
    user_id = organizer.id
    
    # Test upload service
    asset = await FileService.upload_asset(
        db=db,
        org_id=org_id,
        user_id=user_id,
        filename="test_document.txt",
        content_type="text/plain",
        file_data=b"Hello World from general files module!",
        tags=["important", "doc"]
    )
    await db.flush()
    
    assert asset.name == "test_document.txt"
    assert asset.mime_type == "text/plain"
    assert asset.file_size_bytes == len(b"Hello World from general files module!")
    
    # Reload and check tags
    loaded = await FileService.get_asset(db, org_id, asset.id)
    assert loaded is not None
    assert len(loaded.tags) == 2
    assert "important" in [t.tag for t in loaded.tags]
    
    # Test add/remove tags
    await FileService.add_tags(db, org_id, asset.id, ["extra"])
    await db.flush()
    
    loaded = await FileService.get_asset(db, org_id, asset.id)
    assert len(loaded.tags) == 3
    
    await FileService.remove_tag(db, org_id, asset.id, "important")
    await db.flush()
    
    loaded = await FileService.get_asset(db, org_id, asset.id)
    assert len(loaded.tags) == 2
    assert "important" not in [t.tag for t in loaded.tags]
    
    # Test listing assets
    list_res = await FileService.list_assets(db, org_id, query="document")
    assert len(list_res) == 1
    assert list_res[0].id == asset.id
    
    # Test delete asset
    deleted = await FileService.delete_asset(db, org_id, asset.id)
    await db.flush()
    assert deleted is True
    
    # Verify DB cleanup
    stmt = select(Asset).where(Asset.id == asset.id)
    res = await db.execute(stmt)
    assert res.scalar_one_or_none() is None
