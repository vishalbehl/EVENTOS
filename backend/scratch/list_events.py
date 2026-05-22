# backend/scratch/list_events.py
import asyncio
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.database import AsyncSessionLocal
from app.models.event import Event
from app.models.registration_form_config import RegistrationFormConfig
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(Event))
        events = r.scalars().all()
        if not events:
            print("No events found in DB.")
            return
        for e in events:
            cfg_r = await db.execute(select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == e.id))
            cfg = cfg_r.scalar_one_or_none()
            print(f"Event: {e.name} | ID: {e.id} | Live: {cfg.is_live if cfg else 'No Config'}")

if __name__ == "__main__":
    asyncio.run(main())
