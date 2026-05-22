from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request, Query
from fastapi.responses import FileResponse
import os
from app.config import settings
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/storage", tags=["storage"])

@router.put("/local-upload")
async def local_upload(
    request: Request,
    bucket: str = Query(...),
    key: str = Query(...)
):
    """
    Simulates S3 PUT upload for local development.
    Saves the raw request body to settings.STORAGE_LOCAL_PATH.
    """
    # Security: Ensure key doesn't contain .. to escape directory
    if ".." in key or ".." in bucket:
        raise HTTPException(status_code=400, detail="Invalid path")
        
    # We use a subfolder for each bucket
    save_path = os.path.join(settings.STORAGE_LOCAL_PATH, bucket, key)
    
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
async def serve_bucket_file(bucket: str, path: str):
    """
    Serves files from any local bucket (presentations, posters, etc).
    """
    if ".." in path or ".." in bucket:
        raise HTTPException(status_code=400, detail="Invalid path")
        
    file_path = os.path.join(settings.STORAGE_LOCAL_PATH, bucket, path)
    if not os.path.exists(file_path):
        logger.warning(f"File not found: {file_path}")
        raise HTTPException(status_code=404, detail="File not found")
    
    # Simple mime type detection or let FileResponse handle it
    return FileResponse(file_path)
