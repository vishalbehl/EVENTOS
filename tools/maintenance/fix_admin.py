import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.modules.auth.models.user import User

async def fix_admin():
    async with AsyncSessionLocal() as db:
        user = await db.execute(select(User).where(User.email == 'org@eventos.com'))
        u = user.scalar_one_or_none()
        if u:
            u.role = 'super_admin'
            await db.commit()
            print("Successfully elevated org@eventos.com to super_admin")
        else:
            print("User org@eventos.com not found")

if __name__ == "__main__":
    asyncio.run(fix_admin())
