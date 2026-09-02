from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Query, HTTPException, status, File, UploadFile, Depends, Header
from pydantic import BaseModel, Field
from fastapi.responses import RedirectResponse

from app.dependencies import DB, ActiveUser
from app.modules.files.services.file_service import FileService
from app.modules.files.schemas.file_schemas import AssetOut, AddTagsRequest, AssetVersionOut
from app.modules.presentations.services.upload_service import create_presigned_download
from app.modules.presentations.services.upload_service import create_presigned_upload
from app.core.upload_service import UploadService
from app.modules.files.models.file import DurableUpload
from app.modules.events.models.event import Event
from sqlalchemy import select
from app.config import settings
from app.core.job_status import JobStatus
from app.core.job_status_service import JobStatusService
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response

router = APIRouter(prefix="/files", tags=["files"])


class UploadSessionRequest(BaseModel):
    event_id: uuid.UUID | None = None
    filename: str = Field(min_length=1, max_length=500)
    mime_type: str = Field(min_length=1, max_length=150)
    size_bytes: int = Field(gt=0)
    checksum: str | None = Field(default=None, min_length=64, max_length=64)


async def _read_bounded_upload(file: UploadFile, *, maximum_bytes: int) -> bytes:
    """Read compatibility uploads without allowing unbounded API memory use."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(min(1024 * 1024, maximum_bytes - total + 1))
        if not chunk:
            break
        total += len(chunk)
        if total > maximum_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail={
                    "code": "INLINE_UPLOAD_TOO_LARGE",
                    "message": "Use a direct upload session for larger files.",
                    "max_bytes": maximum_bytes,
                },
            )
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/uploads/session", status_code=status.HTTP_201_CREATED)
async def create_upload_session(
    payload: UploadSessionRequest,
    current_user: ActiveUser,
    db: DB,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> dict:
    """Create a tenant-bound direct-to-storage upload session."""
    organization_id = current_user.organization_id
    if not organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")
    try:
        idem = None
        if idempotency_key:
            idem = await begin_idempotent(
                db,
                organization_id=organization_id,
                actor_id=current_user.id,
                operation="file_upload.session",
                key=idempotency_key,
                payload=payload.model_dump(mode="json"),
            )
            replay = replay_response(idem)
            if replay is not None:
                await db.commit()
                return replay[1]
        if payload.event_id is not None:
            event = await db.scalar(
                select(Event).where(
                    Event.id == payload.event_id,
                    Event.organization_id == organization_id,
                )
            )
            if event is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")
        filename = Path(payload.filename).name
        if filename != payload.filename:
            raise HTTPException(status_code=400, detail={"code": "INVALID_FILENAME", "message": "Filename must be a simple file name."})
        scope = f"event/{payload.event_id}" if payload.event_id else "organization"
        object_key = f"tenant/{organization_id}/{scope}/uploads/{uuid.uuid4()}/{filename}"
        row = await UploadService.create(
            db, organization_id=organization_id, created_by=current_user.id,
            object_key=object_key, original_filename=filename,
            mime_type=payload.mime_type, size_bytes=payload.size_bytes,
            checksum=payload.checksum, event_id=payload.event_id,
        )
        upload = await asyncio.to_thread(
            create_presigned_upload,
            bucket=settings.S3_BUCKET_ASSETS,
            storage_path=object_key,
            content_type=payload.mime_type,
            max_size_bytes=payload.size_bytes,
        )
        await UploadService.transition(db, row.id, "uploading", organization_id=organization_id)
        response = {"upload_id": str(row.id), **upload}
        if idem is not None:
            await complete_idempotent(db, idem, response_status=201, response_body=response, resource_id=row.id)
        await db.commit()
        return response
    except Exception:
        await db.rollback()
        raise


@router.get("/uploads/{upload_id}/status", response_model=JobStatus)
async def upload_status(upload_id: uuid.UUID, current_user: ActiveUser, db: DB) -> JobStatus:
    """Durable, tenant-scoped status for storage-backed upload processing."""
    if not current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found.")
    return await JobStatusService.upload(db, upload_id, current_user.organization_id)


@router.post("/uploads/{upload_id}/complete", response_model=JobStatus)
async def complete_upload(
    upload_id: uuid.UUID,
    current_user: ActiveUser,
    db: DB,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> JobStatus:
    """Confirm storage upload and enqueue one tenant-bound verification task."""
    organization_id = current_user.organization_id
    if not organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found.")
    idem = None
    if idempotency_key:
        idem = await begin_idempotent(
            db,
            organization_id=organization_id,
            actor_id=current_user.id,
            operation="file_upload.complete",
            key=idempotency_key,
            payload={"upload_id": str(upload_id)},
        )
        replay = replay_response(idem)
        if replay is not None:
            return JobStatus.model_validate(replay[1])
    row = await db.scalar(
        select(DurableUpload).where(
            DurableUpload.id == upload_id,
            DurableUpload.organization_id == organization_id,
        ).with_for_update()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found.")
    if row.status == "uploading":
        await UploadService.transition(db, upload_id, "uploaded", organization_id=organization_id)
    elif row.status not in {"uploaded", "verifying", "scanning", "processing", "ready"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "UPLOAD_NOT_COMPLETABLE", "status": row.status})
    result = await JobStatusService.upload(db, upload_id, organization_id)
    if idem is not None:
        await complete_idempotent(
            db,
            idem,
            response_status=200,
            response_body=result.model_dump(mode="json"),
            resource_id=upload_id,
        )
    await db.commit()
    if row.status == "uploaded":
        from app.tasks.upload_jobs import process_durable_upload
        process_durable_upload.delay(str(upload_id), str(organization_id))
    return result

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
    
    inline_limit = min(
        settings.MAX_FILE_SIZE_MB,
        settings.INLINE_UPLOAD_MAX_MB,
    ) * 1024 * 1024
    file_bytes = await _read_bounded_upload(file, maximum_bytes=inline_limit)
        
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
    if asset.processing_status != "READY":
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={
                "code": "FILE_NOT_READY",
                "message": "The file is quarantined until security processing completes.",
                "status": asset.processing_status,
            },
        )
        
    target_path = asset.file_path
    if version:
        found_version = next((v for v in asset.versions if v.version_number == version), None)
        if not found_version:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")
        target_path = found_version.file_path
        
    presigned_url = await asyncio.to_thread(
        create_presigned_download,
        bucket=settings.S3_BUCKET_ASSETS,
        storage_path=target_path,
        filename=asset.name,
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
