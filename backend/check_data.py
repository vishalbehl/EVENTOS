import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text
import sys

async def check_data():
    async with AsyncSessionLocal() as db:
        event_id = "a4d9cf28-cc55-413e-ace2-04d0f016aae3" # Using the UUID from the user's terminal logs
        
        # Check sessions
        result = await db.execute(text(f"SELECT COUNT(*) FROM sessions WHERE event_id = '{event_id}'"))
        sessions_count = result.scalar()
        
        # Check files
        result = await db.execute(text(f"SELECT COUNT(*) FROM presentation_files WHERE event_id = '{event_id}'"))
        files_count = result.scalar()
        
        # Check speakers
        result = await db.execute(text(f"SELECT COUNT(*) FROM speakers WHERE event_id = '{event_id}'"))
        speakers_count = result.scalar()

        print(f"Sessions: {sessions_count}")
        print(f"Files: {files_count}")
        print(f"Speakers: {speakers_count}")

asyncio.run(check_data())
