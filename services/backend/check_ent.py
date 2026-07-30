import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text
import json

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT event_id, entitlements FROM platform.event_commercial_contracts WHERE event_id = 'c7af43e1-4a41-4b8c-a120-3d37fe6c338b'"))
        print(json.dumps([dict(row._mapping) for row in res.all()], indent=2, default=str))

asyncio.run(main())
