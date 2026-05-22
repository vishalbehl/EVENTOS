import asyncio
import uuid
from sqlalchemy import text
from app.database import AsyncSessionLocal

async def upgrade_db():
    async with AsyncSessionLocal() as session:
        try:
            print("Altering posters table column 'display_screen' to String(255)...")
            await session.execute(text("ALTER TABLE posters ALTER COLUMN display_screen TYPE VARCHAR(255)"))
            await session.commit()
            print("Successfully updated column length.")
        except Exception as e:
            await session.rollback()
            print(f"Error updating database: {e}")

if __name__ == "__main__":
    asyncio.run(upgrade_db())
