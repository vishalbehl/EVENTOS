# =============================================================
# Conference Platform — Venue Sync Tasks
# workers/tasks/sync_tasks.py
#
# Tasks that push content from the Cloud to Venue Servers.
#
# The venue server runs a local FastAPI instance (LAN-first).
# When a file is approved in the cloud, these tasks push it
# to each venue server so it's available offline.
#
# Tasks:
#   1. sync_approved_file_to_venues   ← triggered after file approval
#   2. sync_full_event_to_venue       ← triggered on event activation
#   3. notify_venue_queue_update      ← triggered after queue reorder
# =============================================================

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List

import httpx
from celery.utils.log import get_task_logger

from workers.celery_app import app
from workers.config import settings
from workers.db import get_db_session
from workers.lib.r2_client import r2

logger = get_task_logger(__name__)

try:
    from app.models.presentation_file import PresentationFile
    from app.models.venue_sync_job import VenueSyncJob
except ImportError as e:
    logger.critical(f"Cannot import backend models: {e}")
    raise


# ── Task 1: Push a single approved file to all venues ────────

@app.task(
    bind=True,
    name="workers.tasks.sync_tasks.sync_approved_file_to_venues",
    max_retries=5,
    default_retry_delay=30,
)
def sync_approved_file_to_venues(self, file_id: str) -> dict:
    """
    Push an approved presentation file to all active venue servers.

    Args:
        file_id: UUID string of the PresentationFile record.

    Flow:
        1. Download from R2
        2. For each venue server URL, POST file bytes to
           /internal/receive-file
        3. Record sync result in VenueSyncJob table
    """
    venue_urls = settings.venue_server_list
    if not venue_urls:
        logger.warning("[venue-sync] No venue servers configured — skipping.")
        return {"synced": False, "reason": "No venue servers configured"}

    file_uuid = uuid.UUID(file_id)
    logger.info(f"[venue-sync] Syncing file {file_id} to {len(venue_urls)} venue(s)")

    with get_db_session() as db:
        pf: PresentationFile | None = db.get(PresentationFile, file_uuid)
        if pf is None:
            return {"error": "File not found."}

        # Download from R2
        try:
            data = r2.download_bytes(settings.S3_BUCKET_PRESENTATIONS, pf.storage_path)
        except Exception as exc:
            raise self.retry(exc=exc)

        results: List[dict] = []
        for venue_url in venue_urls:
            sync_result = _push_file_to_venue(
                db=db,
                venue_url=venue_url,
                file_id=file_id,
                event_id=str(pf.event_id),
                storage_path=pf.storage_path,
                file_format=pf.file_format or "pptx",
                data=data,
            )
            results.append(sync_result)
        db.commit()

    success_count = sum(1 for r in results if r.get("success"))
    logger.info(
        f"[venue-sync] File {file_id} synced to "
        f"{success_count}/{len(venue_urls)} venues."
    )
    return {"file_id": file_id, "results": results}


# ── Task 2: Full event schedule sync to a single venue ───────

@app.task(
    bind=True,
    name="workers.tasks.sync_tasks.sync_full_event_to_venue",
    max_retries=3,
    default_retry_delay=60,
    soft_time_limit=1800,  # 30 min
)
def sync_full_event_to_venue(self, event_id: str, venue_url: str) -> dict:
    """
    Push all approved files for an event to a specific venue server.
    Called when a venue server first comes online, or when the event
    is activated for the first time.

    Args:
        event_id:  UUID string of the Event.
        venue_url: Base URL of the venue server.
    """
    event_uuid = uuid.UUID(event_id)
    logger.info(f"[venue-full-sync] Syncing event {event_id} to {venue_url}")

    with get_db_session() as db:
        from sqlalchemy.orm import Session
        from app.models.presentation_file import PresentationFile as PF

        files = (
            db.query(PF)
            .filter(
                PF.event_id == event_uuid,
                PF.upload_status == "approved",
                PF.is_current_version.is_(True),
            )
            .all()
        )

        logger.info(f"[venue-full-sync] {len(files)} approved files to sync.")
        success = 0
        for pf in files:
            try:
                data = r2.download_bytes(settings.S3_BUCKET_PRESENTATIONS, pf.storage_path)
                result = _push_file_to_venue(
                    db=db,
                    venue_url=venue_url,
                    file_id=str(pf.id),
                    event_id=event_id,
                    storage_path=pf.storage_path,
                    file_format=pf.file_format or "pptx",
                    data=data,
                )
                if result.get("success"):
                    success += 1
            except Exception as exc:
                logger.error(f"[venue-full-sync] Failed for file {pf.id}: {exc}")
        db.commit()

    return {
        "event_id": event_id,
        "venue_url": venue_url,
        "total": len(files),
        "synced": success,
    }


# ── Task 3: Notify venue of queue update ─────────────────────

@app.task(
    bind=True,
    name="workers.tasks.sync_tasks.notify_venue_queue_update",
    max_retries=3,
    default_retry_delay=10,
)
def notify_venue_queue_update(
    self,
    event_id: str,
    session_id: str,
) -> dict:
    """
    Tell all venue servers that the session queue has changed.
    The venue server will re-fetch the queue from the cloud API.

    Args:
        event_id:   UUID string of the event.
        session_id: UUID string of the session whose queue changed.
    """
    venue_urls = settings.venue_server_list
    if not venue_urls:
        return {"notified": False}

    payload = {"event_id": event_id, "session_id": session_id}
    success = 0

    for venue_url in venue_urls:
        try:
            with httpx.Client(timeout=settings.VENUE_SYNC_TIMEOUT_SECONDS) as client:
                resp = client.post(
                    f"{venue_url}/internal/queue-updated",
                    json=payload,
                    headers=_venue_auth_headers(),
                )
            if resp.is_success:
                success += 1
            else:
                logger.warning(
                    f"[venue-queue] Notify failed at {venue_url}: HTTP {resp.status_code}"
                )
        except httpx.RequestError as exc:
            logger.warning(f"[venue-queue] Network error at {venue_url}: {exc}")
            raise self.retry(exc=exc)

    return {"session_id": session_id, "notified_venues": success}


# ── Private helpers ───────────────────────────────────────────

def _push_file_to_venue(
    db,
    venue_url: str,
    file_id: str,
    event_id: str,
    storage_path: str,
    file_format: str,
    data: bytes,
) -> dict:
    """POST raw file bytes to the venue server's receive endpoint."""
    try:
        with httpx.Client(timeout=settings.VENUE_SYNC_TIMEOUT_SECONDS) as client:
            resp = client.post(
                f"{venue_url}/internal/receive-file",
                content=data,
                headers={
                    **_venue_auth_headers(),
                    "Content-Type": "application/octet-stream",
                    "X-File-Id": file_id,
                    "X-Event-Id": event_id,
                    "X-Storage-Path": storage_path,
                    "X-File-Format": file_format,
                },
            )

        success = resp.is_success
        reason = None if success else f"HTTP {resp.status_code}: {resp.text[:200]}"

        _record_sync_job(db, file_id=file_id, venue_url=venue_url, success=success, reason=reason)
        return {"venue_url": venue_url, "success": success, "error": reason}

    except httpx.RequestError as exc:
        reason = str(exc)[:300]
        _record_sync_job(db, file_id=file_id, venue_url=venue_url, success=False, reason=reason)
        return {"venue_url": venue_url, "success": False, "error": reason}


def _record_sync_job(db, file_id: str, venue_url: str, success: bool, reason: str | None) -> None:
    """Persist a VenueSyncJob record for auditing."""
    try:
        job = VenueSyncJob(
            file_id=uuid.UUID(file_id),
            venue_url=venue_url,
            status="completed" if success else "failed",
            error_message=reason,
            synced_at=datetime.now(timezone.utc),
        )
        db.add(job)
    except Exception as exc:
        logger.warning(f"[venue-sync] Could not record sync job: {exc}")


def _venue_auth_headers() -> dict:
    """Headers for machine-to-machine calls to venue servers."""
    key = settings.BACKEND_INTERNAL_API_KEY
    return {"X-Internal-API-Key": key} if key else {}
