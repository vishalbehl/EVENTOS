import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def migrate():
    async with AsyncSessionLocal() as s:
        # Add available_from and available_until to registration.ticket_types
        await s.execute(text("""
            ALTER TABLE registration.ticket_types 
            ADD COLUMN IF NOT EXISTS available_from TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS available_until TIMESTAMP WITH TIME ZONE;
        """))
        print("Added available_from and available_until columns to registration.ticket_types.")

        # Ensure all existing registration_forms have is_live = true
        await s.execute(text("""
            UPDATE registration.registration_forms
            SET is_live = true
            WHERE is_live = false;
        """))
        print("Updated registration_forms is_live = true.")

        await s.commit()

asyncio.run(migrate())
