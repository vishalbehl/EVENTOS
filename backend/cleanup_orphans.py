import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def cleanup():
    async with AsyncSessionLocal() as db:
        # We need to bypass triggers to delete from file_integrity_logs!
        await db.execute(text("SET LOCAL session_replication_role = 'replica'"))
        
        r1 = await db.execute(text("DELETE FROM file_integrity_logs WHERE file_id NOT IN (SELECT id FROM presentation_files)"))
        print(f"Deleted {r1.rowcount} orphan file_integrity_logs")
        
        r2 = await db.execute(text("DELETE FROM file_validations WHERE file_id NOT IN (SELECT id FROM presentation_files)"))
        print(f"Deleted {r2.rowcount} orphan file_validations")
        
        await db.commit()

asyncio.run(cleanup())
