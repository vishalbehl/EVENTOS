import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text
import sys

async def check_data():
    async with AsyncSessionLocal() as db:
        event_id = "a4d9cf28-cc55-413e-ace2-04d0f016aae3"
        
        # Check logs
        result = await db.execute(text(f"SELECT COUNT(*) FROM audit_logs WHERE event_id = '{event_id}'"))
        audit_logs = result.scalar()
        
        result = await db.execute(text(f"SELECT COUNT(*) FROM file_integrity_logs"))
        integrity_logs = result.scalar()
        
        result = await db.execute(text(f"SELECT COUNT(*) FROM security_events WHERE event_id = '{event_id}'"))
        security_logs = result.scalar()

        print(f"Audit Logs: {audit_logs}")
        print(f"File Integrity Logs: {integrity_logs}")
        print(f"Security Logs: {security_logs}")

asyncio.run(check_data())
