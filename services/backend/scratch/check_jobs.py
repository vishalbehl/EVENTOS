
import asyncio
import os
import sys

# Add current directory to path
sys.path.append(os.getcwd())

from app.database import AsyncSessionLocal
from sqlalchemy import select
from app.modules.registration.models.import_job import ImportJob

async def check():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ImportJob))
        jobs = result.scalars().all()
        print(f"Found {len(jobs)} jobs")
        for j in jobs:
            print(f"ID: {j.id}, Status: {j.status}, Created: {j.sessions_created}, Updated: {j.rows_updated}, Errors: {j.error_summary}")

if __name__ == "__main__":
    asyncio.run(check())
