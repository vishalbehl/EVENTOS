import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal
from app.modules.rbac.models.event import Event
from sqlalchemy import select, update

async def run():
    async with AsyncSessionLocal() as db:
        print("=== Updating Database Events to Asia/Kolkata ===")
        # Update all events
        await db.execute(
            update(Event).values(timezone="Asia/Kolkata")
        )
        await db.commit()
        print("Successfully updated all event timezones to Asia/Kolkata!")

        # Verify
        res = await db.execute(select(Event))
        events = res.scalars().all()
        for e in events:
            print(f"ID: {e.id}\nName: {e.name}\nTimezone: {e.timezone}\n")

if __name__ == "__main__":
    asyncio.run(run())
