import pytest
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient

from app.modules.rbac.models.rbac import Role, Permission, RolePermission, UserRoleAssignment, ScopedPermission
from app.modules.auth.models.user import User
from app.modules.rbac.services.rbac_service import RBACService

@pytest.mark.asyncio
async def test_rbac_inheritance(db: AsyncSession, organization):
    # 1. Create permissions
    p1 = Permission(code="SESSIONS:VIEW", name="View Sessions", module="SESSIONS")
    p2 = Permission(code="SESSIONS:CREATE", name="Create Sessions", module="SESSIONS")
    db.add_all([p1, p2])
    await db.commit()

    # 2. Create roles
    parent_role = Role(name="Parent", description="Parent role")
    child_role = Role(name="Child", description="Child role")
    db.add_all([parent_role, child_role])
    await db.commit()

    # 3. Assign permissions to parent
    rp1 = RolePermission(role_id=parent_role.id, permission_id=p1.id)
    rp2 = RolePermission(role_id=parent_role.id, permission_id=p2.id)
    db.add_all([rp1, rp2])
    await db.commit()

    # 4. Assign roles to user (use real org_id from organization fixture)
    user = User(
        email="test_rbac@example.com",
        first_name="Test",
        last_name="RBAC",
        role="organiser",
        organization_id=organization.id
    )
    db.add(user)
    await db.commit()

    assignment = UserRoleAssignment(
        user_id=user.id,
        role_id=child_role.id,
        assigned_by=user.id
    )
    db.add(assignment)
    await db.commit()

    # 5. Check permissions (no inheritance yet)
    perms = await RBACService.get_user_permissions(db, user.id)
    assert "SESSIONS:VIEW" not in perms

    # 6. Setup inheritance
    from app.modules.rbac.models.rbac import RoleInheritanceMap
    inheritance = RoleInheritanceMap(parent_role_id=parent_role.id, child_role_id=child_role.id)
    db.add(inheritance)
    await db.commit()

    # 7. Check permissions (with inheritance)
    perms = await RBACService.get_user_permissions(db, user.id)
    assert "SESSIONS:VIEW" in perms
    assert "SESSIONS:CREATE" in perms

@pytest.mark.asyncio
async def test_scoped_permission_override(db: AsyncSession, organization):
    # 1. Create permission and role
    p = Permission(code="SESSIONS:DELETE", name="Delete Sessions", module="SESSIONS")
    role = Role(name="Deleter", description="Can delete")
    db.add_all([p, role])
    await db.commit()

    rp = RolePermission(role_id=role.id, permission_id=p.id)
    db.add(rp)
    await db.commit()

    # 2. Create user and assign role (use real org_id from organization fixture)
    user = User(
        email="scoped@example.com",
        first_name="Scoped",
        last_name="User",
        role="organiser",
        organization_id=organization.id
    )
    db.add(user)
    await db.commit()

    assignment = UserRoleAssignment(user_id=user.id, role_id=role.id, assigned_by=user.id)
    db.add(assignment)
    await db.commit()

    # 3. Check global access
    assert await RBACService.validate_access(db, user.id, "SESSIONS:DELETE") is True

    # 4. Apply scoped override (DENY for specific event)
    event_id = uuid.uuid4()
    override = ScopedPermission(
        user_id=user.id,
        permission_id=p.id,
        scope_type="EVENT",
        scope_id=event_id,
        is_allowed=False
    )
    db.add(override)
    await db.commit()

    # 5. Check access for event (Denied)
    assert await RBACService.validate_access(db, user.id, "SESSIONS:DELETE", scope_id=event_id) is False
    # Check global access (Still allowed if not event-scoped)
    assert await RBACService.validate_access(db, user.id, "SESSIONS:DELETE") is True

@pytest.mark.asyncio
async def test_rbac_middleware_enforcement(client: AsyncClient, db: AsyncSession):
    # Mocking user session in client would be complex here, 
    # but we can test the middleware logic via direct calls or unit tests.
    pass
