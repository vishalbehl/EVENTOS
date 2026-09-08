"""Durable transfer housekeeping for target-driven LAN delivery.

Room and SRR clients pull the manifest, claim work, download the authoritative
file, verify it locally, and acknowledge it. This worker owns recovery of
expired leases and obsolete versions; it never marks a copy verified itself.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from loguru import logger

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.config import settings
from app.models.operational_control import VenueAssetTransfer, VenueCommand
from app.models.presentation_file import PresentationFile
from app.models.room_device import RoomDevice
from app.runtime_events import record_runtime_event


def _now() -> datetime:
    return datetime.now(timezone.utc)


def expired_transfer_state(attempt_count: int, max_attempts: int) -> tuple[str, str]:
    """Return the durable state for a transfer whose lease has expired."""
    if attempt_count >= max_attempts:
        return "failed", "Transfer exceeded the configured delivery retry limit."
    return "pending", "Transfer lease expired; queued for retry."


def expired_command_state() -> tuple[str, str]:
    return "expired", "Command expired before the target device acknowledged it."


DEVICE_HEARTBEAT_TIMEOUT_SECONDS = 60


def heartbeat_is_stale(last_heartbeat: datetime | None, now: datetime, timeout_seconds: int = DEVICE_HEARTBEAT_TIMEOUT_SECONDS) -> bool:
    return last_heartbeat is None or last_heartbeat < now - timedelta(seconds=timeout_seconds)


async def reconcile_transfers() -> int:
    changed = 0
    now = _now()
    async with AsyncSessionLocal() as db:
        rows = list((await db.execute(select(VenueAssetTransfer).where(
            VenueAssetTransfer.status.in_(["transferring", "received"]),
            VenueAssetTransfer.lease_expires_at.is_not(None),
            VenueAssetTransfer.lease_expires_at < now,
        ))).scalars().all())
        for row in rows:
            file = await db.get(PresentationFile, row.file_id)
            row.status, row.error_message = expired_transfer_state(row.attempt_count, settings.VENUE_DELIVERY_MAX_ATTEMPTS)
            row.lease_owner = None
            row.lease_expires_at = None
            if file:
                event_type = "delivery.failed" if row.status == "failed" else "delivery.lease_expired"
                record_runtime_event(db, event_id=file.event_id, event_type=event_type, entity_type="asset_transfer", entity_id=str(row.id), payload={"transfer_id": str(row.id), "file_id": str(file.id), "version": row.version_number, "attempt_count": row.attempt_count, "max_attempts": settings.VENUE_DELIVERY_MAX_ATTEMPTS, "reason": row.error_message})
            changed += 1

        # A superseded file must not continue consuming target bandwidth.
        active_files = list((await db.execute(select(PresentationFile).where(
            PresentationFile.is_current_version.is_(False),
        ))).scalars().all())
        obsolete_ids = {file.id for file in active_files}
        if obsolete_ids:
            obsolete = list((await db.execute(select(VenueAssetTransfer).where(
                VenueAssetTransfer.file_id.in_(obsolete_ids),
                VenueAssetTransfer.status.in_(["pending", "transferring"]),
            ))).scalars().all())
            for row in obsolete:
                file = await db.get(PresentationFile, row.file_id)
                row.status = "cancelled"
                row.lease_owner = None
                row.lease_expires_at = None
                row.error_message = "Superseded by a newer authoritative file version."
                if file:
                    record_runtime_event(db, event_id=file.event_id, event_type="delivery.cancelled", entity_type="asset_transfer", entity_id=str(row.id), payload={"transfer_id": str(row.id), "file_id": str(file.id), "version": row.version_number, "reason": "superseded_authoritative_version"})
                changed += 1
        if changed:
            await db.commit()
    return changed


async def reconcile_commands() -> int:
    """Expire undelivered room commands even when a target is offline."""
    changed = 0
    now = _now()
    async with AsyncSessionLocal() as db:
        rows = list((await db.execute(select(VenueCommand).where(
            VenueCommand.status.in_(["queued", "delivered", "acknowledged"]),
            VenueCommand.expires_at.is_not(None),
            VenueCommand.expires_at < now,
        ))).scalars().all())
        for row in rows:
            row.status, row.error_message = expired_command_state()
            if row.event_id:
                record_runtime_event(
                    db,
                    event_id=row.event_id,
                    room_id=row.room_id,
                    session_id=row.session_id,
                    event_type="room.command_expired",
                    entity_type="venue_command",
                    entity_id=str(row.id),
                    payload={"command": row.command, "target_type": row.target_type, "target_id": row.target_id},
                )
            changed += 1
        if changed:
            await db.commit()
    return changed


async def reconcile_room_device_health() -> int:
    """Mark room devices offline when heartbeat evidence has gone stale."""
    changed = 0
    now = _now()
    async with AsyncSessionLocal() as db:
        rows = list((await db.execute(select(RoomDevice).where(
            RoomDevice.status == "online",
        ))).scalars().all())
        for row in rows:
            if not heartbeat_is_stale(row.last_heartbeat_at, now):
                continue
            row.status = "offline"
            record_runtime_event(
                db,
                event_id=row.event_id,
                room_id=row.room_id,
                event_type="room.device_disconnected",
                entity_type="room_device",
                entity_id=str(row.id),
                payload={
                    "device_id": str(row.id),
                    "device_name": row.device_name,
                    "last_heartbeat_at": row.last_heartbeat_at.isoformat() if row.last_heartbeat_at else None,
                    "timeout_seconds": DEVICE_HEARTBEAT_TIMEOUT_SECONDS,
                },
            )
            changed += 1
        if changed:
            await db.commit()
    return changed


async def run_delivery_worker(interval_seconds: int = 10) -> None:
    while True:
        try:
            await reconcile_transfers()
            await reconcile_commands()
            await reconcile_room_device_health()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # The next pass retries database housekeeping; target failures are
            # represented on the transfer row by the target acknowledgement API.
            logger.exception("Venue delivery housekeeping pass failed: {}", exc)
        await asyncio.sleep(interval_seconds)
