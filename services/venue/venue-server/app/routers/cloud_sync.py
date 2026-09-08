import io
import hashlib
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, File, UploadFile, Depends, HTTPException, Header, BackgroundTasks, Request
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_database
from app.minio_client import minio_client
from app.config import settings
from app.models.presentation_file import PresentationFile

router = APIRouter(prefix="/internal/sync", tags=["cloud_sync"])

async def verify_cloud(x_cloud_key: str = Header(None)):
    if x_cloud_key != settings.CLOUD_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid Cloud Sync Key")
    return True

@router.post("/receive-file", dependencies=[Depends(verify_cloud)])
async def receive_synced_file(
    file_id: str = Header(...),
    storage_path: str = Header(...),
    file_format: str = Header(...),
    file_size_bytes: int = Header(...),
    content_sha256: str | None = Header(default=None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_database)
):
    """
    Receives an approved presentation file pushed from the Cloud Celery worker.
    Saves it directly to local MinIO.
    """
    try:
        file_uuid = uuid.UUID(file_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file_id UUID")

    # The schedule snapshot is the authoritative metadata source. A file push
    # may hydrate that record, but must never create a partial presentation
    # row: PresentationFile requires event, speaker and session ownership.
    db_file = await db.get(PresentationFile, file_uuid)
    if not db_file:
        raise HTTPException(
            status_code=409,
            detail="Presentation metadata is not synchronized yet; retry after the event snapshot includes this file.",
        )
    if db_file.storage_path != storage_path:
        raise HTTPException(status_code=409, detail="Storage path does not match authoritative presentation metadata.")
    if db_file.file_format.lower() != file_format.lower() or db_file.file_size_bytes != file_size_bytes:
        raise HTTPException(status_code=409, detail="File metadata does not match the authoritative presentation version.")

    # 1. Read bytes and verify the exact authoritative content before storage.
    file_data = await file.read()
    actual_sha256 = hashlib.sha256(file_data).hexdigest()
    expected_sha256 = (content_sha256 or db_file.content_sha256 or "").strip().lower()
    if not expected_sha256:
        raise HTTPException(status_code=409, detail="Authoritative presentation checksum is missing; refresh the event snapshot.")
    if len(file_data) != file_size_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file size does not match the authoritative presentation version.")
    if actual_sha256 != expected_sha256:
        raise HTTPException(status_code=400, detail="Uploaded file checksum does not match the authoritative presentation version.")

    # 2. Upload to local MinIO
    try:
        minio_client.put_object(
            Bucket=settings.LOCAL_BUCKET_NAME,
            Key=storage_path,
            Body=io.BytesIO(file_data),
            Length=len(file_data),
            ContentType=file.content_type
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MinIO upload failed: {e}")

    # 3. Mark the existing authoritative version as locally available.
    db_file.upload_status = "approved"
    db_file.content_sha256 = expected_sha256
    db_file.local_sync_status = "synced"
    db_file.local_synced_at = datetime.now(timezone.utc)

    # Cloud delivery is also a source upload from the Venue Server's point
    # of view: once the authoritative binary is present locally, create the
    # same target-specific SRR/Stage/Technical intents as an SRR upload.
    from app.routers.srr import create_asset_transfer_intents
    await create_asset_transfer_intents(db, db_file, db_file.session_id)
    
    await db.commit()

    return {"status": "success", "file_id": file_id, "bytes_received": len(file_data)}

@router.post("/queue-updated", dependencies=[Depends(verify_cloud)])
async def queue_updated_webhook(
    request: Request,
    event_id: str = Header(...),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """
    Triggered by Cloud when the Organizer updates the queue.
    Tells the venue server to immediately pull the new schedule/queue state.
    """
    # Initialize background sync scheduler if not already running
    if not hasattr(request.app.state, "scheduler") or request.app.state.scheduler is None:
        from app.sync.scheduler import SyncScheduler
        logger.info(f"Dynamically initializing background sync scheduler for event {event_id} from webhook")
        scheduler = SyncScheduler(event_id=event_id)
        scheduler.start()
        request.app.state.scheduler = scheduler

    # Trigger background sync to avoid blocking the webhook response
    from app.sync.schedule_pull import pull_event_queue
    background_tasks.add_task(pull_event_queue, event_id)
    
    return {"status": "sync_queued", "event_id": event_id}
