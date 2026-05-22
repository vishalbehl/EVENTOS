import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.import_job import ImportJob

async def check_latest_jobs():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ImportJob).order_by(ImportJob.created_at.desc()).limit(5)
        )
        jobs = result.scalars().all()
        for job in jobs:
            print(f"Job ID: {job.id}")
            print(f"  Type: {job.job_type}")
            print(f"  Status: {job.status}")
            print(f"  Imported: {job.rows_imported}")
            print(f"  Failed: {job.rows_failed}")
            print(f"  Created: {job.created_at}")
            print("---")

if __name__ == "__main__":
    asyncio.run(check_latest_jobs())
