# =============================================================
# Conference Platform — Notification Service
# backend/app/services/notification_service.py
#
# Dispatches real-time + persisted notifications.
#
# "Notification" in this system has two meanings:
#   1. WebSocket push — instant in-browser alert for organizers
#   2. In-app notification record — persisted in the notifications
#      table (not yet modelled; we use a simple dict-based approach
#      until the model is added).
#
# This service is the single place that decides WHAT notification
# to send and HOW (WebSocket and/or email and/or WhatsApp).
# =============================================================

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.speaker import Speaker


# ── Notification types ────────────────────────────────────────
# Centralised constants to avoid magic strings across the codebase.

class NotificationType:
    # File events
    FILE_UPLOADED = "file.uploaded"
    FILE_VALIDATED = "file.validated"
    FILE_APPROVED = "file.approved"
    FILE_REJECTED = "file.rejected"
    FILE_LOCKED = "file.locked"

    # Speaker events
    SPEAKER_CHECKED_IN = "speaker.checked_in"
    SPEAKER_UPLOAD_PENDING = "speaker.upload_pending"

    # Session events
    SESSION_STARTED = "session.started"
    SESSION_COMPLETED = "session.completed"

    # Import events
    IMPORT_COMPLETED = "import.completed"
    IMPORT_FAILED = "import.failed"

    # SRR events
    SRR_STATION_ASSIGNED = "srr.station_assigned"
    SRR_STATION_FREED = "srr.station_freed"

    # Venue sync events
    VENUE_SYNC_STARTED = "venue.sync_started"
    VENUE_SYNC_COMPLETED = "venue.sync_completed"
    VENUE_SYNC_FAILED = "venue.sync_failed"

    # Campaign events
    CAMPAIGN_SENT = "campaign.sent"


# ── Notification payload builder ──────────────────────────────

def build_notification(
    notification_type: str,
    *,
    title: str,
    message: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[uuid.UUID] = None,
    severity: str = "info",   # info | success | warning | error
    metadata: Optional[dict] = None,
) -> dict:
    """
    Build a standardised notification payload dict.

    This dict is used for both WebSocket pushes and (future) in-app
    notification records. Keeping a consistent shape lets the frontend
    handle all notification types with one renderer.

    Args:
        notification_type: One of the NotificationType constants
        title:             Short headline (shown in toast)
        message:           Longer description (shown in notification panel)
        entity_type:       'speaker' | 'session' | 'file' | etc.
        entity_id:         UUID of the affected entity
        severity:          'info' | 'success' | 'warning' | 'error'
        metadata:          Extra fields for deep-linking / UI context
    """
    return {
        "type": notification_type,
        "title": title,
        "message": message,
        "severity": severity,
        "entity_type": entity_type,
        "entity_id": str(entity_id) if entity_id else None,
        "metadata": metadata or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ── Domain-specific dispatch functions ────────────────────────

async def dispatch_notification(
    notification_type: str,
    payload: dict,
    *,
    event_id: Optional[uuid.UUID] = None,
    db: Optional[AsyncSession] = None,
) -> None:
    """
    Central dispatch — sends the notification payload to the
    WebSocket manager for the given event room.

    This is the function routers and services call. It:
    1. Pushes to WebSocket (via websocket_service)
    2. Persists to DB if a persistence model exists (future)
    3. Logs for observability

    Import websocket_service lazily to avoid circular imports.
    """
    logger.debug(
        f"Dispatching notification type={notification_type} "
        f"event_id={event_id}"
    )

    # Push real-time via WebSocket
    if event_id is not None:
        try:
            from app.services.websocket_service import broadcast_to_event  # lazy import
            await broadcast_to_event(event_id=event_id, payload=payload)
        except Exception as exc:
            # WebSocket failure must never crash business logic
            logger.warning(f"WebSocket broadcast failed (non-fatal): {exc}")


async def notify_file_uploaded(
    event_id: uuid.UUID,
    speaker: Speaker,
    filename: str,
    file_id: uuid.UUID,
    *,
    db: Optional[AsyncSession] = None,
) -> None:
    """Notify organizers that a speaker has uploaded a presentation file."""
    payload = build_notification(
        NotificationType.FILE_UPLOADED,
        title="New File Upload",
        message=f"{speaker.full_name} uploaded '{filename}'",
        entity_type="file",
        entity_id=file_id,
        severity="info",
        metadata={
            "speaker_id": str(speaker.id),
            "speaker_name": speaker.full_name,
            "filename": filename,
        },
    )
    await dispatch_notification(
        NotificationType.FILE_UPLOADED,
        payload,
        event_id=event_id,
        db=db,
    )


async def notify_file_validated(
    event_id: uuid.UUID,
    file_id: uuid.UUID,
    speaker_name: str,
    result: str,                # "pass" | "warning" | "fail"
    *,
    db: Optional[AsyncSession] = None,
) -> None:
    """Notify organizers of file validation result."""
    severity_map = {"pass": "success", "warning": "warning", "fail": "error"}
    payload = build_notification(
        NotificationType.FILE_VALIDATED,
        title=f"File Validation: {result.upper()}",
        message=f"Validation result for {speaker_name}'s file: {result}",
        entity_type="file",
        entity_id=file_id,
        severity=severity_map.get(result, "info"),
        metadata={"result": result, "speaker_name": speaker_name},
    )
    await dispatch_notification(
        NotificationType.FILE_VALIDATED,
        payload,
        event_id=event_id,
        db=db,
    )


async def notify_speaker_checked_in(
    event_id: uuid.UUID,
    speaker: Speaker,
    station_number: int,
    *,
    db: Optional[AsyncSession] = None,
) -> None:
    """Notify Ready Room technicians that a speaker has arrived."""
    payload = build_notification(
        NotificationType.SPEAKER_CHECKED_IN,
        title="Speaker Arrived",
        message=f"{speaker.full_name} has checked in → Station {station_number}",
        entity_type="speaker",
        entity_id=speaker.id,
        severity="success",
        metadata={
            "speaker_id": str(speaker.id),
            "speaker_name": speaker.full_name,
            "station_number": station_number,
        },
    )
    await dispatch_notification(
        NotificationType.SPEAKER_CHECKED_IN,
        payload,
        event_id=event_id,
        db=db,
    )


async def notify_import_completed(
    event_id: uuid.UUID,
    import_job_id: uuid.UUID,
    sessions_created: int,
    speakers_created: int,
    rows_failed: int,
    *,
    db: Optional[AsyncSession] = None,
) -> None:
    """Notify organizer that an Excel import job has finished."""
    severity = "warning" if rows_failed > 0 else "success"
    payload = build_notification(
        NotificationType.IMPORT_COMPLETED,
        title="Excel Import Complete",
        message=(
            f"Import finished: {sessions_created} sessions, "
            f"{speakers_created} speakers created. "
            f"{rows_failed} row(s) failed."
        ),
        entity_type="import_job",
        entity_id=import_job_id,
        severity=severity,
        metadata={
            "sessions_created": sessions_created,
            "speakers_created": speakers_created,
            "rows_failed": rows_failed,
        },
    )
    await dispatch_notification(
        NotificationType.IMPORT_COMPLETED,
        payload,
        event_id=event_id,
        db=db,
    )


async def notify_import_failed(
    event_id: uuid.UUID,
    import_job_id: uuid.UUID,
    error: str,
    *,
    db: Optional[AsyncSession] = None,
) -> None:
    """Notify organizer that an Excel import job failed."""
    payload = build_notification(
        NotificationType.IMPORT_FAILED,
        title="Excel Import Failed",
        message=f"Import job failed: {error}",
        entity_type="import_job",
        entity_id=import_job_id,
        severity="error",
        metadata={"error": error},
    )
    await dispatch_notification(
        NotificationType.IMPORT_FAILED,
        payload,
        event_id=event_id,
        db=db,
    )


async def notify_venue_sync_status(
    event_id: uuid.UUID,
    sync_job_id: uuid.UUID,
    status: str,                # "started" | "completed" | "failed"
    detail: str = "",
    *,
    db: Optional[AsyncSession] = None,
) -> None:
    """Notify organizers of venue server sync progress."""
    type_map = {
        "started": NotificationType.VENUE_SYNC_STARTED,
        "completed": NotificationType.VENUE_SYNC_COMPLETED,
        "failed": NotificationType.VENUE_SYNC_FAILED,
    }
    severity_map = {"started": "info", "completed": "success", "failed": "error"}
    title_map = {
        "started": "Venue Sync Started",
        "completed": "Venue Sync Complete",
        "failed": "Venue Sync Failed",
    }
    n_type = type_map.get(status, NotificationType.VENUE_SYNC_STARTED)
    payload = build_notification(
        n_type,
        title=title_map.get(status, "Venue Sync"),
        message=detail or f"Venue sync {status}.",
        entity_type="venue_sync_job",
        entity_id=sync_job_id,
        severity=severity_map.get(status, "info"),
        metadata={"status": status},
    )
    await dispatch_notification(n_type, payload, event_id=event_id, db=db)
