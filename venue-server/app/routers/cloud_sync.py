import io
import uuid
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

    # 1. Read bytes
    file_data = await file.read()

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

    # 3. Upsert record in Postgres (We assume file metadata might arrive before or during this push)
    # The cloud DB already recorded it. We just need to mark it locally available.
    db_file = await db.get(PresentationFile, file_uuid)
    if not db_file:
        # Create minimal record if it doesn't exist yet via schedule sync
        db_file = PresentationFile(
            id=file_uuid,
            storage_path=storage_path,
            file_format=file_format,
            file_size_bytes=file_size_bytes,
            upload_status="approved",
            # We don't have speaker_id/event_id here, they should come from schedule_pull.py. 
            # In a real sync, we should pull metadata if missing.
        )
        db.add(db_file)
    else:
        db_file.upload_status = "approved"
    
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
