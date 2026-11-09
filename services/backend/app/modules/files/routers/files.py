from __future__ import annotations

import asyncio
import re
import uuid
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Query, HTTPException, status, File, UploadFile, Depends, Header, Request, Response
from pydantic import BaseModel, Field
from fastapi.responses import RedirectResponse
from lxml import etree

from app.dependencies import DB, ActiveUser, TokenDep
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
from app.modules.files.infrastructure.repositories import DurableUploadRepository
from app.core.concurrency import require_if_match, raise_version_conflict

async def organization_file_access(request: Request, response: Response,
                                   token: TokenDep, user: ActiveUser, db: DB):
    from app.modules.rbac.services.access_contexts import direct_request_context
    from app.modules.rbac.routers.access_foundation import browser_context_audience
    await browser_context_audience(token)
    if token.access_mode != "DIRECT":
        raise HTTPException(403, detail={"code": "ORGANIZATION_FILE_MEMBERSHIP_REQUIRED"})
    # The vault is organisation-owned. A workspace/event delegation or grant
    # cannot turn into access to the organisation's complete asset library.
    name = getattr(request.scope.get("endpoint"), "__name__", "")
    action = ("FILES:DOWNLOAD" if name == "download_file" else
              "FILES:DELETE" if name == "delete_file" else
              "FILES:VIEW" if request.method in {"GET", "HEAD"} else
              "FILES:CREATE" if name in {"upload_file", "create_upload_session"} else
              "FILES:EDIT")
    response.headers["Cache-Control"] = "no-store"
    async with direct_request_context(db, user, token.active_organization_id) as context:
        if action not in context.actions:
            raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
        yield


router = APIRouter(prefix="/files", tags=["files"], dependencies=[Depends(organization_file_access)])
_SYSTEM_TAG_PREFIX = "system:"
_SANITIZED_SVG_TAG = "system:sanitized-svg-v1"


def _sanitize_svg_upload(content: bytes) -> bytes:
    try:
        parser = etree.XMLParser(resolve_entities=False, no_network=True, recover=False, huge_tree=False)
        root = etree.fromstring(content, parser=parser)
    except (etree.XMLSyntaxError, ValueError) as exc:
        raise HTTPException(status_code=400, detail={"code": "SVG_INVALID"}) from exc
    if etree.QName(root).localname.lower() != "svg":
        raise HTTPException(status_code=400, detail={"code": "SVG_INVALID_ROOT"})
    nodes = list(root.iter())
    if len(nodes) > 10_000:
        raise HTTPException(status_code=400, detail={"code": "SVG_TOO_COMPLEX"})
    prohibited = {"script", "style", "foreignobject", "iframe", "object", "embed", "audio", "video"}
    for node in nodes:
        if etree.QName(node).localname.lower() in prohibited:
            parent = node.getparent()
            if parent is not None:
                parent.remove(node)
            continue
        for attribute_name in list(node.attrib):
            local_name = etree.QName(attribute_name).localname.lower()
            value = str(node.attrib.get(attribute_name) or "").strip()
            lowered = value.lower()
            if local_name.startswith("on") or local_name in {"src", "srcdoc"}:
                del node.attrib[attribute_name]
            elif local_name == "href" and value and not value.startswith("#"):
                del node.attrib[attribute_name]
            elif local_name == "style" and re.search(
                r"url\s*\(|@import|expression\s*\(|javascript\s*:|vbscript\s*:", lowered
            ):
                del node.attrib[attribute_name]
    return etree.tostring(root, encoding="utf-8", xml_declaration=False)


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
    organization_id = current_user.request_organization_id
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
            from app.modules.rbac.services.event_scope import customer_event
            await customer_event(db, current_user, payload.event_id)
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
    if not current_user.request_organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found.")
    return await JobStatusService.upload(db, upload_id, current_user.request_organization_id)


@router.post("/uploads/{upload_id}/complete", response_model=JobStatus)
async def complete_upload(
    upload_id: uuid.UUID,
    current_user: ActiveUser,
    db: DB,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    if_match: str | None = Header(None, alias="If-Match"),
) -> JobStatus:
    """Confirm storage upload and enqueue one tenant-bound verification task."""
    organization_id = current_user.request_organization_id
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
            payload={"upload_id": str(upload_id), "version": if_match},
        )
        replay = replay_response(idem)
        if replay is not None:
            return JobStatus.model_validate(replay[1])
    row = await DurableUploadRepository(db).get_by_id(
        upload_id=upload_id,
        organization_id=organization_id,
        for_update=True,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found.")
    if if_match is not None and row.version != require_if_match(if_match):
        raise_version_conflict(row.version)
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
    org_id = current_user.request_organization_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to an organization to upload assets."
        )
        
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    if any(tag.lower().startswith(_SYSTEM_TAG_PREFIX) for tag in tag_list):
        raise HTTPException(status_code=422, detail={"code": "RESERVED_ASSET_TAG"})
    
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
    filename = file.filename or "asset"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in restricted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension '.{ext}' is restricted for security reasons."
        )
    content_type = (file.content_type or "application/octet-stream").lower()
    if content_type == "image/svg+xml" or ext == "svg":
        file_bytes = _sanitize_svg_upload(file_bytes)
        content_type = "image/svg+xml"
        tag_list.append(_SANITIZED_SVG_TAG)

    asset = await FileService.upload_asset(
        db=db,
        org_id=org_id,
        user_id=current_user.id,
        filename=filename,
        content_type=content_type,
        file_data=file_bytes,
        tags=tag_list
    )
    
    await db.commit()
    try:
        from app.tasks.upload_jobs import scan_asset_for_viruses
        scan_asset_for_viruses.delay(str(asset.id), str(org_id))
    except Exception:
        # The committed pending VirusScan is recovered by the scheduled
        # abandoned-upload reconciliation task.
        pass
    
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
    org_id = current_user.request_organization_id
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
    org_id = current_user.request_organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
    if any(tag.lower().startswith(_SYSTEM_TAG_PREFIX) for tag in body.tags):
        raise HTTPException(status_code=422, detail={"code": "RESERVED_ASSET_TAG"})
        
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
    org_id = current_user.request_organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
    if tag.lower().startswith(_SYSTEM_TAG_PREFIX):
        raise HTTPException(status_code=422, detail={"code": "RESERVED_ASSET_TAG"})
        
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
    org_id = current_user.request_organization_id
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
    org_id = current_user.request_organization_id
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
    org_id = current_user.request_organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
        
    success = await FileService.delete_asset(db, org_id, asset_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
    await db.commit()
    return {"status": "success", "message": "Asset deleted."}
