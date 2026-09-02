
import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import select, text

async def test():
    async with AsyncSessionLocal() as db:
        res = await db.scalar(text('SELECT count(*) FROM events.events'))
        print(f'events: {res}')
        res2 = await db.scalar(text('SELECT count(*) FROM registration.participants'))
        print(f'participants: {res2}')

asyncio.run(test())
