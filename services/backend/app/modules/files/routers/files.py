from __future__ import annotations

import uuid
from typing import Optional, List
from fastapi import APIRouter, Query, HTTPException, status, File, UploadFile, Depends
from fastapi.responses import RedirectResponse

from app.dependencies import DB, ActiveUser
from app.modules.files.services.file_service import FileService
from app.modules.files.schemas.file_schemas import AssetOut, AddTagsRequest, AssetVersionOut
from app.modules.presentations.services.upload_service import create_presigned_download
from app.config import settings

router = APIRouter(prefix="/files", tags=["files"])

@router.post(
    "/upload",
    response_model=AssetOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a new file asset to the vault"
)
async def upload_file(
    current_user: ActiveUser,
    db: DB,
    file: UploadFile = File(...),
    tags: Optional[str] = Query(None, description="Comma-separated list of tags")
) -> AssetOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to an organization to upload assets."
        )
        
    tag_list = [t.strip() for t in tags.split(",")] if tags else []
    
    file_bytes = await file.read()
    if len(file_bytes) > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size limit of {settings.MAX_FILE_SIZE_MB}MB"
        )
        
    # Standardize restricted file types
    restricted = {
        "exe", "msi", "bat", "cmd", "ps1", "vbs", "sh", "bin", 
        "com", "scr", "pif", "js", "jar", "app", "dmg", "pkg"
    }
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if ext in restricted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension '.{ext}' is restricted for security reasons."
        )

    asset = await FileService.upload_asset(
        db=db,
        org_id=org_id,
        user_id=current_user.id,
        filename=file.filename,
        content_type=file.content_type or "application/octet-stream",
        file_data=file_bytes,
        tags=tag_list
    )
    
    await db.commit()
    
    # Reload asset to populate relationships
    updated_asset = await FileService.get_asset(db, org_id, asset.id)
    if not updated_asset:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Upload failed.")
        
    return AssetOut.model_validate(updated_asset)

@router.get(
    "",
    response_model=List[AssetOut],
    summary="List organization assets"
)
async def list_files(
    current_user: ActiveUser,
    db: DB,
    q: Optional[str] = Query(None, description="Filter by filename (case-insensitive search)"),
    tag: Optional[str] = Query(None, description="Filter by specific tag"),
    mime_type: Optional[str] = Query(None, description="Filter by mime type"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
) -> List[AssetOut]:
    org_id = current_user.organization_id
    if not org_id:
        return []
        
    offset = (page - 1) * page_size
    assets = await FileService.list_assets(
        db=db,
        org_id=org_id,
        query=q,
        tag=tag,
        mime_type=mime_type,
        limit=page_size,
        offset=offset
    )
    return [AssetOut.model_validate(a) for a in assets]

@router.get(
    "/{asset_id}",
    response_model=AssetOut,
    summary="Get asset details"
)
async def get_file_details(
    asset_id: uuid.UUID,
    current_user: ActiveUser,
    db: DB
) -> AssetOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
        
    asset = await FileService.get_asset(db, org_id, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
        
    return AssetOut.model_validate(asset)

@router.get(
    "/{asset_id}/download",
    summary="Download asset"
)
async def download_file(
    asset_id: uuid.UUID,
    current_user: ActiveUser,
    db: DB,
    version: Optional[int] = Query(None, description="Specific version number")
):
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
        
    asset = await FileService.get_asset(db, org_id, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
        
    target_path = asset.file_path
    if version:
        found_version = next((v for v in asset.versions if v.version_number == version), None)
        if not found_version:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")
        target_path = found_version.file_path
        
    presigned_url = create_presigned_download(
        bucket=settings.S3_BUCKET_ASSETS,
        storage_path=target_path,
        filename=asset.name
    )
    
    # Redirect directly to S3 / local file download endpoint
    return RedirectResponse(presigned_url)

@router.post(
    "/{asset_id}/tags",
    response_model=List[str],
    summary="Add tags to an asset"
)
async def add_tags(
    asset_id: uuid.UUID,
    body: AddTagsRequest,
    current_user: ActiveUser,
    db: DB
) -> List[str]:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
        
    added = await FileService.add_tags(db, org_id, asset_id, body.tags)
    await db.commit()
    return added

@router.delete(
    "/{asset_id}/tags/{tag}",
    summary="Remove a tag from an asset"
)
async def remove_tag(
    asset_id: uuid.UUID,
    tag: str,
    current_user: ActiveUser,
    db: DB
):
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
        
    success = await FileService.remove_tag(db, org_id, asset_id, tag)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset or tag not found.")
    await db.commit()
    return {"status": "success", "message": f"Tag '{tag}' removed."}

@router.delete(
    "/{asset_id}",
    summary="Delete an asset"
)
async def delete_file(
    asset_id: uuid.UUID,
    current_user: ActiveUser,
    db: DB
):
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
        
    success = await FileService.delete_asset(db, org_id, asset_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
    await db.commit()
    return {"status": "success", "message": "Asset deleted."}
