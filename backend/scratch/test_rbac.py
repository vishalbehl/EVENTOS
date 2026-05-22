import asyncio
import os
import sys
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Add backend to path
sys.path.append(os.getcwd())

from app.core.config import settings
from app.services.permission_service import PermissionService
from app.models.models import User, Role, UserRoleAssignment, Permission, RolePermission

async def test_permission_resolution():
    engine = create_async_engine(settings.DATABASE_URL)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with AsyncSessionLocal() as session:
        # 1. Fetch a test user (or create dummy)
        result = await session.execute(select(User).limit(1))
        user = result.scalar_one_or_none()
        
        if not user:
            print("No users found in database to test with.")
            return

        print(f"Testing resolution for User: {user.email} (ID: {user.id})")
        
        # 2. Test Global Resolution
        global_perms = await PermissionService.get_user_permissions(session, user.id)
        print(f"Global Permissions: {global_perms}")
        
        # 3. Test Event-specific Resolution (if events exist)
        from app.models.models import Event
        event_result = await session.execute(select(Event).limit(1))
        event = event_result.scalar_one_or_none()
        
        if event:
            event_perms = await PermissionService.get_user_permissions(session, user.id, event_id=event.id)
            print(f"Event Permissions (Event {event.id}): {event_perms}")
        else:
            print("No events found to test scoped permissions.")

if __name__ == "__main__":
    asyncio.run(test_permission_resolution())
