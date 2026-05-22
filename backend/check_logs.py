import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT id, file_id FROM file_integrity_logs LIMIT 5"))
        print(res.fetchall())
        
        res = await db.execute(text("SELECT COUNT(*) FROM presentation_files"))
        print(f"Total presentation files remaining: {res.scalar()}")

asyncio.run(check())
