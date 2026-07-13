from fastapi import APIRouter, HTTPException, Request, Query, status
from fastapi.responses import FileResponse
import os
from app.config import settings
import logging
from pathlib import Path
import uuid

from app.core.storage_security import (
    StorageCapabilityError,
    verify_local_storage_capability,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/storage", tags=["storage"])

@router.put("/local-upload")
async def local_upload(
    request: Request,
    bucket: str = Query(...),
    key: str = Query(...),
    organization_id: uuid.UUID = Query(...),
    expires_at: int = Query(...),
    signature: str = Query(...),
):
    """
    Simulates S3 PUT upload for local development.
    Saves the raw request body to settings.STORAGE_LOCAL_PATH.
    """
    _require_local_mode()
    _verify_capability("PUT", bucket, key, organization_id, expires_at, signature)
    save_path = _safe_local_path(bucket, key)
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    
    logger.info(f"Local storage: saving file to {save_path}")
    
    try:
        with open(save_path, "wb") as f:
            async for chunk in request.stream():
                f.write(chunk)
    except Exception as e:
        logger.error(f"Failed to save local file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
        
    return {"status": "success", "path": f"{bucket}/{key}"}

@router.get("/{bucket}/{path:path}")
async def serve_bucket_file(
    bucket: str,
    path: str,
    organization_id: uuid.UUID = Query(...),
    expires_at: int = Query(...),
    signature: str = Query(...),
    filename: str = Query(None),
    disposition: str = Query(None),
):
    """
    Serves files from any local bucket (presentations, posters, etc).
    """
    _require_local_mode()
    _verify_capability("GET", bucket, path, organization_id, expires_at, signature)
    file_path = _safe_local_path(bucket, path)
    if not os.path.exists(file_path):
        logger.warning(f"File not found: {file_path}")
        raise HTTPException(status_code=404, detail="File not found")
    
    content_disposition_type = "attachment"
    if disposition == "inline":
        content_disposition_type = "inline"
        
    return FileResponse(
        file_path,
        filename=filename,
        content_disposition_type=content_disposition_type if (filename or disposition) else "inline"
    )


def _require_local_mode() -> None:
    if settings.STORAGE_MODE != "local":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _verify_capability(
    method: str,
    bucket: str,
    key: str,
    organization_id: uuid.UUID,
    expires_at: int,
    signature: str,
) -> None:
    try:
        verify_local_storage_capability(
            method=method,
            bucket=bucket,
            key=key,
            organization_id=organization_id,
            expires_at=expires_at,
            signature=signature,
        )
    except StorageCapabilityError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid storage capability") from exc


def _safe_local_path(bucket: str, key: str) -> Path:
    root = Path(settings.STORAGE_LOCAL_PATH).resolve()
    candidate = (root / bucket / key).resolve()
    if root not in candidate.parents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid path")
    return candidate
