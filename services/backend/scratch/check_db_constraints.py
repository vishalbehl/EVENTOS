import asyncio
from sqlalchemy import text
from app.database import async_engine

async def check_constraints():
    async with async_engine.connect() as conn:
        print("\nChecking unique indices for user_event_assignments:")
        result = await conn.execute(text("""
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'user_event_assignments' AND indexdef LIKE '%UNIQUE%';
        """))
        for row in result:
            print(f"  {row[0]}: {row[1]}")

        print("\nChecking unique indices for user_access_nodes:")
        result = await conn.execute(text("""
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'user_access_nodes' AND indexdef LIKE '%UNIQUE%';
        """))
        for row in result:
            print(f"  {row[0]}: {row[1]}")

if __name__ == "__main__":
    asyncio.run(check_constraints())
