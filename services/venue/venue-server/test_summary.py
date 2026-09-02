
import asyncio
from app.database import AsyncSessionLocal
from app.routers.registration_api import get_registration_summary

async def test():
    async with AsyncSessionLocal() as db:
        res = await get_registration_summary(db=db)
        print(res)

asyncio.run(test())
