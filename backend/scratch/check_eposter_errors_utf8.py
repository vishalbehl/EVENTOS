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
            with open("scratch/errors_utf8.json", "w", encoding="utf-8") as f:
                json.dump(job.error_summary, f, indent=2)

if __name__ == "__main__":
    asyncio.run(check_errors())
