import socket

import httpx
from loguru import logger
from sqlalchemy import func, select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.sync_outbox import SyncOutbox


async def send_source_heartbeat(event_id: str) -> None:
    if settings.REGISTRATION_FETCH_SOURCE_TYPE != "venue_server" or not settings.CLOUD_DEVICE_KEY:
        return
    async with AsyncSessionLocal() as db:
        queue_depth = int(await db.scalar(
            select(func.count(SyncOutbox.id)).where(SyncOutbox.status.in_(["pending", "failed"]))
        ) or 0)
    root = settings.CLOUD_API_URL.rstrip("/")
    for suffix in ("/api/v1/sync", "/api/v1"):
        if root.endswith(suffix):
            root = root[: -len(suffix)].rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10.0, verify=True) as client:
            response = await client.post(
                f"{root}/api/v1/sync/events/{event_id}/heartbeat",
                headers={"X-Fetch-Api-Key": settings.CLOUD_DEVICE_KEY},
                json={
                    "server_name": socket.gethostname(),
                    "version": "1.0.0",
                    "queue_depth": queue_depth,
                    "metrics": {"source_type": "registration_server"},
                },
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning(f"[Sync Heartbeat] Venue Server heartbeat failed: {exc}")
