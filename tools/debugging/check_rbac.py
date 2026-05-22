import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.modules.rbac.models.rbac import Role, Permission, RolePermission

async def check_rbac():
    async with AsyncSessionLocal() as db:
        roles = await db.execute(select(Role))
        print(f"Roles: {[r.name for r in roles.scalars().all()]}")
        
        perms = await db.execute(select(Permission))
        print(f"Permissions: {len(perms.scalars().all())}")
        
        rp = await db.execute(select(RolePermission))
        print(f"Role-Permission Mappings: {len(rp.scalars().all())}")

if __name__ == "__main__":
    asyncio.run(check_rbac())
