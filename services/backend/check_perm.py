import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT code FROM rbac.permissions WHERE code LIKE '%ROOM%'"))
        print(res.all())

asyncio.run(main())
