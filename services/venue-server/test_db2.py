
import asyncio
from app.database import AsyncSessionLocal
from app.models.participant import Participant
from sqlalchemy import select, func

async def test():
    async with AsyncSessionLocal() as db:
        res = await db.scalar(select(func.count(Participant.id)))
        print(f'Participants: {res}')

asyncio.run(test())
