import asyncio
import json
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def list_all():
    async with AsyncSessionLocal() as s:
        events = (await s.execute(text("SELECT id, name, organization_id FROM events.events;"))).fetchall()
        print(f"ALL {len(events)} EVENTS IN DATABASE:")
        for e in events:
            f = (await s.execute(text(f"SELECT id, event_id, is_live, fields FROM registration.registration_forms WHERE event_id = '{e.id}';"))).fetchone()
            print(f" - Event: {e.name} (id: {e.id}, org: {e.organization_id}) -> Form: {f.id if f else 'NONE'} (fields: {len(f.fields) if f and f.fields else 0})")
            if f and f.fields:
                print(f"   Fields: {[x.get('name') for x in f.fields]}")

asyncio.run(list_all())
