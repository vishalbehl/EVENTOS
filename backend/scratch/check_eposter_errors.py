import asyncio
import json
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.import_job import ImportJob

async def check_errors():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ImportJob).where(ImportJob.job_type == "eposter").order_by(ImportJob.created_at.desc()).limit(1)
        )
        job = result.scalar_one_or_none()
        if job and job.error_summary:
            print(f"Error summary for job {job.id}:")
            print(json.dumps(job.error_summary, indent=2))

if __name__ == "__main__":
    asyncio.run(check_errors())
