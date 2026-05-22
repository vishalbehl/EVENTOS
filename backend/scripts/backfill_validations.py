import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import AsyncSessionLocal
from app.models.presentation_file import PresentationFile
from app.tasks.file_tasks import validate_presentation

async def backfill():
    print("Starting validation backfill for existing presentation files...")
    async with AsyncSessionLocal() as db:
        # Find all files that are in pending_validation, valid, or processing, 
        # but don't have a FileValidation record (or we just force re-run for all to get new metadata)
        result = await db.execute(
            select(PresentationFile).options(selectinload(PresentationFile.validation))
        )
        files = result.scalars().all()
        
        count = 0
        for pf in files:
            # Re-run validation for ALL files to ensure they have the new deep inspection data
            print(f"Queuing validation for {pf.original_filename} ({pf.id})")
            validate_presentation.delay(str(pf.id))
            count += 1
            
        print(f"Successfully queued {count} files for background validation.")

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(backfill())
