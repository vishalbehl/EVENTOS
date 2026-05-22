# backend/scratch/check_posters.py
import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import settings
from app.models.poster import Poster

async def check():
    engine = create_async_engine(settings.async_database_url)
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession)
    async with SessionLocal() as db:
        res = await db.execute(select(Poster))
        rows = res.scalars().all()
        print(f"Total Posters: {len(rows)}")
        for r in rows:
            print(f"- {r.original_filename}: status={r.status}, path={r.storage_path}, id={r.id}")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check())
