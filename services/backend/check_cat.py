import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT * FROM billing.feature_catalog WHERE key = 'FEAT_VENUE_SYNC'"))
        print(res.all())

asyncio.run(main())
