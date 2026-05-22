from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone
import uuid
from pydantic import BaseModel
from typing import Optional

from app.database import get_database
from app.models.session import Session
from app.models.participant import Participant
from app.models.badge_models import Badge, BadgeScan, BadgePrintJob
from app.models.capacity_rule import CapacityRule
from app.models.attendance_log import AttendanceLog
from app.models.sync_outbox import SyncOutbox
from app.routers.auth import DeviceAuth
from app.minio_client import minio_client
from app.config import settings

router = APIRouter(prefix="/api/v1/venue", tags=["local_api"])

class LocalCheckInRequest(BaseModel):
    participant_id: Optional[uuid.UUID] = None
    badge_code: Optional[str] = None
    nfc_uid: Optional[str] = None
    session_id: uuid.UUID
    method: str = "qr"
    device_id: str = "unknown"

class LocalCheckOutRequest(BaseModel):
    participant_id: Optional[uuid.UUID] = None
    badge_code: Optional[str] = None
    nfc_uid: Optional[str] = None
    session_id: uuid.UUID

class LocalBadgeScanRequest(BaseModel):
    badge_id: uuid.UUID
    location: str
    scan_type: str = "entry"

class LocalPrintJobRequest(BaseModel):
    badge_id: uuid.UUID
    printer_id: uuid.UUID

async def resolve_participant_id(
    db: AsyncSession,
    participant_id: Optional[uuid.UUID] = None,
    badge_code: Optional[str] = None,
    nfc_uid: Optional[str] = None
) -> uuid.UUID:
    if participant_id:
        p = await db.get(Participant, participant_id)
        if p:
            return p.id
    if badge_code:
        q = select(Badge).where(Badge.badge_code == badge_code)
        badge = (await db.execute(q)).scalar_one_or_none()
        if badge:
            return badge.participant_id
    if nfc_uid:
        q = select(Badge).where(Badge.nfc_uid == nfc_uid)
        badge = (await db.execute(q)).scalar_one_or_none()
        if badge:
            return badge.participant_id
    raise HTTPException(status_code=404, detail="Participant or Badge not found locally.")

@router.get("/schedule/today")
async def get_todays_schedule(is_auth: DeviceAuth, db: AsyncSession = Depends(get_database)):
    """
    Returns the daily schedule for the Technician iPad.
    """
    today = datetime.now(timezone.utc).date()
    stmt = (
        select(Session)
        .where(func.date(Session.start_time) == today)
        .order_by(Session.start_time)
    )
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    
    return {"sessions": sessions}

@router.get("/files/{storage_path:path}/url")
async def get_file_download_url(storage_path: str, is_auth: DeviceAuth):
    """
    Generates a presigned MinIO URL so local apps can download the file directly from the Venue Server.
    The Room App calls this after receiving the snapshot to cache the files locally.
    """
    try:
        url = minio_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': settings.LOCAL_BUCKET_NAME, 'Key': storage_path},
            ExpiresIn=3600 # 1 hour
        )
        return {"download_url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate download URL: {str(e)}")

@router.post("/attendance/checkin")
async def local_checkin(
    payload: LocalCheckInRequest,
    is_auth: DeviceAuth,
    db: AsyncSession = Depends(get_database)
):
    """
    Offline check-in endpoint enforcing local capacities and queuing for cloud sync.
    """
    p_id = await resolve_participant_id(db, payload.participant_id, payload.badge_code, payload.nfc_uid)
    
    # Check session capacity
    q_rule = select(CapacityRule).where(CapacityRule.session_id == payload.session_id)
    rule = (await db.execute(q_rule)).scalar_one_or_none()
    if rule:
        q_occ = select(func.count(AttendanceLog.id)).where(
            AttendanceLog.session_id == payload.session_id,
            AttendanceLog.checkout_time.is_(None)
        )
        occ = (await db.execute(q_occ)).scalar() or 0
        if occ >= rule.capacity:
            raise HTTPException(status_code=400, detail=f"Capacity of {rule.capacity} reached.")

    # Create local check-in log
    log = AttendanceLog(
        participant_id=p_id,
        session_id=payload.session_id,
        method=payload.method,
        device_id=payload.device_id,
        checkin_time=datetime.now(timezone.utc)
    )
    db.add(log)
    await db.flush()

    # Queue in SyncOutbox
    outbox = SyncOutbox(
        entity_type="attendance_log",
        entity_id=log.id,
        action="create",
        payload={
            "id": str(log.id),
            "participant_id": str(p_id),
            "session_id": str(payload.session_id),
            "method": payload.method,
            "device_id": payload.device_id,
            "checkin_time": log.checkin_time.isoformat()
        }
    )
    db.add(outbox)
    await db.commit()

    return {"status": "success", "log_id": log.id}

@router.post("/attendance/checkout")
async def local_checkout(
    payload: LocalCheckOutRequest,
    is_auth: DeviceAuth,
    db: AsyncSession = Depends(get_database)
):
    """
    Offline check-out endpoint.
    """
    p_id = await resolve_participant_id(db, payload.participant_id, payload.badge_code, payload.nfc_uid)

    q = select(AttendanceLog).where(
        AttendanceLog.participant_id == p_id,
        AttendanceLog.session_id == payload.session_id,
        AttendanceLog.checkout_time.is_(None)
    )
    log = (await db.execute(q)).scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="No active check-in log found.")

    checkout_time = datetime.now(timezone.utc)
    duration_mins = int((checkout_time - log.checkin_time).total_seconds() / 60)

    log.checkout_time = checkout_time
    log.duration = duration_mins

    # Queue update in SyncOutbox
    outbox = SyncOutbox(
        entity_type="attendance_log",
        entity_id=log.id,
        action="update",
        payload={
            "id": str(log.id),
            "checkout_time": checkout_time.isoformat(),
            "duration": duration_mins
        }
    )
    db.add(outbox)
    await db.commit()

    return {"status": "success", "log_id": log.id}

@router.post("/badges/scan")
async def local_scan(
    payload: LocalBadgeScanRequest,
    is_auth: DeviceAuth,
    db: AsyncSession = Depends(get_database)
):
    """
    Offline badge scan log.
    """
    scan = BadgeScan(
        badge_id=payload.badge_id,
        location=payload.location,
        scan_type=payload.scan_type,
        created_at=datetime.now(timezone.utc)
    )
    db.add(scan)
    await db.flush()

    outbox = SyncOutbox(
        entity_type="badge_scan",
        entity_id=scan.id,
        action="create",
        payload={
            "id": str(scan.id),
            "badge_id": str(payload.badge_id),
            "location": payload.location,
            "scan_type": payload.scan_type,
            "created_at": scan.created_at.isoformat()
        }
    )
    db.add(outbox)
    await db.commit()

    return {"status": "success", "scan_id": scan.id}

@router.post("/badges/print")
async def local_print_job(
    payload: LocalPrintJobRequest,
    is_auth: DeviceAuth,
    db: AsyncSession = Depends(get_database)
):
    """
    Queue print job offline.
    """
    job = BadgePrintJob(
        badge_id=payload.badge_id,
        printer_id=payload.printer_id,
        status="queued",
        queued_at=datetime.now(timezone.utc)
    )
    db.add(job)
    await db.flush()

    outbox = SyncOutbox(
        entity_type="badge_print_job",
        entity_id=job.id,
        action="create",
        payload={
            "id": str(job.id),
            "badge_id": str(payload.badge_id),
            "printer_id": str(payload.printer_id),
            "status": "queued",
            "queued_at": job.queued_at.isoformat()
        }
    )
    db.add(outbox)
    await db.commit()

    return {"status": "success", "job_id": job.id}
