import asyncio
import json
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as s:
        ev = (await s.execute(text("SELECT id, name, registration_settings FROM events.events WHERE id = '196da896-74d5-4a42-9230-8f79e5b96052';"))).fetchone()
        if ev:
            print("EVENT:", ev.name)
            print("SETTINGS:", json.dumps(ev.registration_settings, default=str, indent=2))
        
        # Check all participant roles
        r = (await s.execute(text("SELECT id, name, category, role_code, is_active, is_default, sort_order FROM registration.participant_roles WHERE event_id = '196da896-74d5-4a42-9230-8f79e5b96052' ORDER BY sort_order, name;"))).fetchall()
        print(f"\nALL {len(r)} PARTICIPANT ROLES FOR EVENT:")
        for row in r:
            print(f" - {row.name} (category: {row.category}, code: {row.role_code}, is_active: {row.is_active}, default: {row.is_default})")

        # Check all participant_roles in entire DB (any event)
        all_r = (await s.execute(text("SELECT id, event_id, name, category, role_code, is_active, is_default, sort_order FROM registration.participant_roles ORDER BY created_at DESC LIMIT 30;"))).fetchall()
        print(f"\nRECENT 30 PARTICIPANT ROLES IN DB (ANY EVENT):")
        for row in all_r:
            print(f" [event: {row.event_id}] - {row.name} (category: {row.category}, code: {row.role_code}, is_active: {row.is_active}, default: {row.is_default})")

asyncio.run(check())
