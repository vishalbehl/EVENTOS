# backend/scratch/check_files.py
import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import settings
from app.models.presentation_file import PresentationFile

async def check():
    engine = create_async_engine(settings.async_database_url)
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession)
    async with SessionLocal() as db:
        res = await db.execute(select(PresentationFile))
        rows = res.scalars().all()
        print(f"Total files: {len(rows)}")
        for r in rows:
            print(f"- {r.original_filename}: status={r.upload_status}, current={r.is_current_version}, id={r.id}")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check())
