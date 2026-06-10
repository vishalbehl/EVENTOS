import asyncio
from sqlalchemy import text
from app.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as session:
        result = await session.execute(text("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'audit' AND table_name = 'logs'"))
        for row in result.all():
            print(row)

if __name__ == '__main__':
    asyncio.run(main())
