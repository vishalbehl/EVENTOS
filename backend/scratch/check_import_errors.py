import asyncio
import uuid
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.import_job import ImportJob
import json

async def check_errors(job_id_str):
    job_id = uuid.UUID(job_id_str)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ImportJob).where(ImportJob.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            print("Job not found")
            return
        
        print(f"Status: {job.status}")
        print(f"Job Type: {job.job_type}")
        print(f"Total Rows: {job.rows_total}")
        print(f"Failed Rows: {job.rows_failed}")
        if job.error_summary:
            print("\nErrors (First 5):")
            for err in job.error_summary[:5]:
                print(f"Row {err.get('row')}: {err.get('errors')}")
        else:
            print("No error summary found")

if __name__ == "__main__":
    import sys
    job_id = sys.argv[1] if len(sys.argv) > 1 else "56c6d729-f2ff-4124-bfdb-0bad560e0682"
    asyncio.run(check_errors(job_id))
