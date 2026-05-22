import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal
from app.models.event import Event
from sqlalchemy import select

async def run():
    async with AsyncSessionLocal() as db:
        print("=== Database Events & Timezones ===")
        res = await db.execute(select(Event))
        events = res.scalars().all()
        for e in events:
            print(f"ID: {e.id}\nName: {e.name}\nShort Code: {e.short_code}\nTimezone: {e.timezone}\nUpload Deadline: {e.upload_deadline}\n")

if __name__ == "__main__":
    asyncio.run(run())
