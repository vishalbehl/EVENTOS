import asyncio
import json
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as s:
        forms = (await s.execute(text("SELECT id, event_id, is_live, fields FROM registration.registration_forms;"))).fetchall()
        print(f"TOTAL REGISTRATION FORMS IN DB: {len(forms)}")
        for f in forms:
            print(f"Form {f.id} for event {f.event_id} (is_live: {f.is_live}):")
            print("Fields count:", len(f.fields) if f.fields else 0)
            if f.fields:
                for fld in f.fields:
                    print(f"  - {fld.get('id')} ({fld.get('label')}, type: {fld.get('type')}, active: {fld.get('is_active')}, req: {fld.get('is_required')})")

asyncio.run(check())
