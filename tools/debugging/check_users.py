import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.modules.auth.models.user import User

async def check():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User))
        users = res.scalars().all()
        print(f"Total users: {len(users)}")
        for u in users:
            print(f"- {u.email} (Role: {u.role}, Deleted: {u.deleted_at})")

if __name__ == "__main__":
    asyncio.run(check())
