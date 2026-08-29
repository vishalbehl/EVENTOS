import asyncio
import uuid
from app.database import AsyncSessionLocal
from sqlalchemy import text
from app.modules.registration.routers.registration_portal import DEFAULT_FIELDS

async def seed():
    async with AsyncSessionLocal() as s:
        # Get all events
        events = (await s.execute(text("SELECT id, name FROM events.events;"))).fetchall()
        print(f"Checking {len(events)} events for registration form config...")
        
        for ev in events:
            # Check if form exists
            f = (await s.execute(text(f"SELECT id, fields FROM registration.registration_forms WHERE event_id = '{ev.id}';"))).fetchone()
            if not f:
                form_id = str(uuid.uuid4())
                import json
                fields_json = json.dumps(DEFAULT_FIELDS)
                await s.execute(text(f"""
                    INSERT INTO registration.registration_forms (id, event_id, is_live, fields, created_at, updated_at)
                    VALUES ('{form_id}', '{ev.id}', false, '{fields_json}'::jsonb, NOW(), NOW());
                """))
                print(f"Seeded registration form for event: {ev.name} ({ev.id})")
            else:
                print(f"Event {ev.name} already has form ({f.id}) with {len(f.fields) if f.fields else 0} fields.")
        
        await s.commit()
        print("Registration forms seeding complete!")

asyncio.run(seed())
