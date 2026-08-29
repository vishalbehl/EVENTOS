import asyncio
import json
from sqlalchemy import text
from app.database import engine

async def check():
    async with engine.begin() as conn:
        res = await conn.execute(text("SELECT id, event_id, is_live, fields FROM registration.registration_forms"))
        rows = res.fetchall()
        print(f"Total registration forms: {len(rows)}")
        for r in rows:
            print(f"Event: {r.event_id}, Live: {r.is_live}, Field Count: {len(r.fields) if r.fields else 0}")
            if r.fields:
                field_ids = [f.get("id") or f.get("name") for f in r.fields]
                print(f"  Field IDs: {field_ids}")

asyncio.run(check())
