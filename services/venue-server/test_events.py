
import asyncio
from app.database import AsyncSessionLocal
from app.models.event import Event
from sqlalchemy import select

async def test():
    async with AsyncSessionLocal() as db:
        res = await db.scalars(select(Event))
        print(f'Events: {res.all()}')

asyncio.run(test())
