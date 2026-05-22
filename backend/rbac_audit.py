import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User
from app.services.permission_service import get_user_permissions

async def audit():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).order_by(User.email))
        for u in res.scalars().all():
            perms = await get_user_permissions(db, u.id)
            perm_str = "SUPER ADMIN" if "*" in perms else f"{len(perms)} perms"
            print(f"User: {u.email:<30} | Role: {u.role:<15} | {perm_str}")

if __name__ == "__main__":
    asyncio.run(audit())
