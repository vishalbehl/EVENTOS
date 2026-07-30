import asyncio
from sqlalchemy import select, update, func
from app.database import AsyncSessionLocal
from app.modules.events.models.session import Session

async def main():
    async with AsyncSessionLocal() as session:
        await session.execute(
            update(Session).values(session_code=func.upper(Session.session_code))
        )
        await session.commit()
        print('Updated db')

if __name__ == "__main__":
    asyncio.run(main())
