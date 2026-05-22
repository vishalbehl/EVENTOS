# backend/scratch/retrigger_validation.py
import asyncio
import uuid
import sys
import os

# Add parent directory to path so we can import app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import settings
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.presentations.models.poster import Poster
from app.modules.presentations.tasks.file_tasks import validate_presentation, validate_poster

async def retrigger():
    print(f"Connecting to {settings.database_url}...")
    engine = create_async_engine(settings.async_database_url)
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession)
    
    async with SessionLocal() as db:
        # 1. RETRIGGER PRESENTATIONS
        # Including all active files that might need an audit
        q_pf = select(PresentationFile).where(
            PresentationFile.is_current_version.is_(True),
            PresentationFile.upload_status.in_(["pending_validation", "processing", "valid", "invalid", "warning", "submitted"])
        )
        result_pf = await db.execute(q_pf)
        files = result_pf.scalars().all()
        
        print(f"Found {len(files)} Presentations to validate.")
        for pf in files:
            print(f" -> Queuing Presentation: {pf.original_filename} ({pf.id})")
            validate_presentation.delay(str(pf.id))

        # 2. RETRIGGER POSTERS
        q_pos = select(Poster).where(
            Poster.status.in_(["submitted", "under_review", "approved"])
        )
        result_pos = await db.execute(q_pos)
        posters = result_pos.scalars().all()
        
        print(f"\nFound {len(posters)} Posters to validate.")
        for p in posters:
            if p.storage_path:
                print(f" -> Queuing Poster: {p.original_filename} ({p.id})")
                validate_poster.delay(str(p.id))
            else:
                print(f" -> Skipping Poster {p.id} (no file yet)")
            
    await engine.dispose()
    print("\nAll tasks sent! Watch your Celery worker process them.")

if __name__ == "__main__":
    asyncio.run(retrigger())
