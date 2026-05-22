import asyncio
import uuid
from sqlalchemy import select, update
from app.dependencies import get_db
from app.models.poster import Poster

async def fix_poster_statuses():
    async for db in get_db():
        # Update all posters that have no storage_path to 'pending'
        # This aligns existing data with the new workflow where 'submitted' 
        # means the file has been uploaded.
        q = update(Poster).where(
            Poster.storage_path == None,
            Poster.status == 'submitted'
        ).values(status='pending')
        
        result = await db.execute(q)
        await db.commit()
        print(f"Updated {result.rowcount} posters to 'pending' status.")
        break

if __name__ == "__main__":
    asyncio.run(fix_poster_statuses())
