import httpx
from loguru import logger
from datetime import datetime, timezone
from sqlalchemy import select
from app.config import settings
from app.database import AsyncSessionLocal
from app.models.sync_outbox import SyncOutbox


def _get_candidate_push_urls(base_url: str, event_id: str) -> list[str]:
    raw = (base_url or "http://127.0.0.1:8000").rstrip("/")
    for suffix in (
        "/api/v1/registration-source",
        "/api/v1/sync",
        "/api/v1/events",
        "/api/v1",
        "/registration-source",
        "/sync",
    ):
        if raw.endswith(suffix):
            raw = raw[:-len(suffix)].rstrip("/")
            break
    
    return [
        f"{raw}/api/v1/sync/events/{event_id}/push",
        f"{raw}/api/v1/events/{event_id}/venue-sync/push",
        f"{raw}/api/v1/registration-source/events/{event_id}/push",
    ]


async def process_outbox(event_id: str):
    """
    Polls the local sync_outbox for pending/failed sync tasks and pushes them to the Cloud.
    """
    logger.info(f"[Sync Outbox] Checking for outbox records to push for event {event_id}...")
    
    async with AsyncSessionLocal() as db:
        # Fetch pending or failed tasks with attempts < 5
        stmt = (
            select(SyncOutbox)
            .where(
                SyncOutbox.status.in_(["pending", "failed"]),
                SyncOutbox.attempts < 5
            )
            .order_by(SyncOutbox.created_at.asc())
            .limit(50)
        )
        result = await db.execute(stmt)
        records = result.scalars().all()
        
        if not records:
            logger.info("[Sync Outbox] No pending outbox records to sync.")
            return

        logger.info(f"[Sync Outbox] Found {len(records)} records to sync.")
        
        # Prepare payload
        payload = []
        record_map = {}
        for r in records:
            # Mark records as syncing to prevent concurrent processing
            r.status = "syncing"
            record_map[str(r.id)] = r
            
            payload.append({
                "id": str(r.id),
                "entity_type": r.entity_type,
                "entity_id": str(r.entity_id),
                "action": r.action,
                "payload": r.payload,
                "created_at": r.created_at.isoformat()
            })
            
        await db.commit()

        # Send to Cloud
        candidate_urls = _get_candidate_push_urls(settings.CLOUD_API_URL, event_id)
        api_key = settings.CLOUD_DEVICE_KEY or getattr(settings, "CLOUD_API_KEY", "")
        headers = {
            "X-Fetch-Api-Key": api_key,
            "X-Device-Key": api_key,
        }

        response = None
        last_error = None
        try:
            async with httpx.AsyncClient() as client:
                for candidate_url in candidate_urls:
                    try:
                        res = await client.post(
                            candidate_url,
                            headers=headers,
                            json=payload,
                            timeout=15.0
                        )
                        if res.status_code != 404:
                            response = res
                            break
                    except Exception as ex:
                        last_error = ex
                        continue
                
                if response is None:
                    if last_error:
                        raise last_error
                    raise RuntimeError(f"All candidate push endpoints returned 404 for event {event_id}: {candidate_urls}")

                response.raise_for_status()
                result_data = response.json()
                
                processed_ids = result_data.get("processed_ids", [])
                duplicate_ids = result_data.get("duplicates", [])
                errors = result_data.get("errors", [])
                
                # Update status based on results
                for pid_str in processed_ids + duplicate_ids:
                    if pid_str in record_map:
                        rec = record_map[pid_str]
                        rec.status = "completed"
                        rec.attempts += 1
                        rec.synced_at = datetime.now(timezone.utc)
                        
                for err in errors:
                    err_id = err.get("id")
                    err_msg = err.get("error", "Unknown error")
                    if err_id in record_map:
                        rec = record_map[err_id]
                        rec.status = "failed"
                        rec.attempts += 1
                        rec.error_message = err_msg
                        
                # Commit updates
                await db.commit()
                logger.info(f"[Sync Outbox] Outbox batch processed. Success: {len(processed_ids)}, Errors: {len(errors)}.")
                
        except Exception as e:
            logger.error(f"[Sync Outbox] Failed to connect or post to cloud: {e}")
            # Reset status of the records to failed and increment attempts
            for r in records:
                r.status = "failed"
                r.attempts += 1
                r.error_message = str(e)
            await db.commit()
