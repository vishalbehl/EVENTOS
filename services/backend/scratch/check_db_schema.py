import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import asyncio
from sqlalchemy import text
from app.database import async_engine

async def check():
    async with async_engine.connect() as conn:
        result = await conn.execute(text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'events'"))
        for row in result:
            print(row)

asyncio.run(check())
