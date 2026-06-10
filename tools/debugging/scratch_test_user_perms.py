# scratch_test_user_perms.py
import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.rbac.services.rbac_service import RBACService

async def main():
    async with AsyncSessionLocal() as db:
        # Get first event
        event_res = await db.execute(select(Event).limit(1))
        event = event_res.scalar_one_or_none()
        if not event:
            print("No event found in DB!")
            return
        
        # Get first user
        user_res = await db.execute(select(User).limit(1))
        user = user_res.scalar_one_or_none()
        if not user:
            print("No user found in DB!")
            return

        print(f"User: {user.email} (ID: {user.id}), role={user.role}")
        print(f"Event: {event.name} (ID: {event.id})")

        # Let's print UserRoleAssignment
        from app.modules.rbac.models.rbac import UserRoleAssignment, Role, RolePermission, Permission
        res_assignments = await db.execute(
            select(UserRoleAssignment).where(UserRoleAssignment.user_id == user.id)
        )
        asgns = res_assignments.scalars().all()
        print(f"Total role assignments found: {len(asgns)}")
        for a in asgns:
            role_name_res = await db.execute(select(Role.name).where(Role.id == a.role_id))
            role_name = role_name_res.scalar_one_or_none()
            print(f"  Assignment: role_id={a.role_id} ({role_name}), org_id={a.organization_id}, event_id={a.event_id}")

        perms = await RBACService.get_user_permissions(db, user.id, event_id=event.id)
        print("Effective permissions in event scope:")
        print(sorted(list(perms)))

        # Also get global permissions
        global_perms = await RBACService.get_user_permissions(db, user.id)
        print("Global effective permissions:")
        print(sorted(list(global_perms)))

if __name__ == "__main__":
    asyncio.run(main())
