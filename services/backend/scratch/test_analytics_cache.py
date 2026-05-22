import asyncio
from app.database import AsyncSessionLocal
from app.modules.analytics.services.analytics_service import build_analytics_snapshot
import uuid
import json

async def test_analytics():
    event_id = uuid.UUID("fb611bfb-c92a-4ec6-b906-1ae14ceb9b6c")
    async with AsyncSessionLocal() as db:
        print(f"Fetching analytics for event: {event_id}")
        
        # Call 1 (Fresh)
        snapshot1 = await build_analytics_snapshot(db, event_id, use_cache=True)
        print(f"Call 1 finished. Overview: {snapshot1['overview']['total_sessions']} sessions")
        
        # Call 2 (Cached)
        snapshot2 = await build_analytics_snapshot(db, event_id, use_cache=True)
        print(f"Call 2 finished. Overview: {snapshot2['overview']['total_sessions']} sessions")

if __name__ == "__main__":
    asyncio.run(test_analytics())
