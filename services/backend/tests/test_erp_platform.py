# tests/test_erp_platform.py
import pytest
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient

from app.modules.platform.departments.models import Department, DepartmentMember
from app.modules.platform.teams.models import Team, TeamMember
from app.modules.platform.roles.models import DepartmentRole, UserAssignment
from app.modules.platform.permissions.models import PlatformPermission, PlatformRolePermission
from app.modules.platform.permissions.service import PermissionService
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_department_crud(client: AsyncClient, db: AsyncSession, organization, organizer):
    headers = auth_headers(organizer)
    
    # 1. Create Department
    payload = {
        "name": "Implementation Services",
        "code": "IMPL_TEST",
        "description": "Handles implementation and deployment"
    }
    response = await client.post("/api/v1/platform/departments", json=payload, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == payload["name"]
    assert data["code"] == payload["code"]
    dept_id = data["id"]

    # 2. Get Department
    response = await client.get(f"/api/v1/platform/departments/{dept_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["name"] == payload["name"]

    # 3. Update Department
    update_payload = {"name": "Implementation & Deployments"}
    response = await client.patch(f"/api/v1/platform/departments/{dept_id}", json=update_payload, headers=headers)
    assert response.status_code == 200
    assert response.json()["name"] == "Implementation & Deployments"

    # 4. List Departments
    response = await client.get("/api/v1/platform/departments", headers=headers)
    assert response.status_code == 200
    items = response.json()
    assert len(items) > 0
    assert any(i["id"] == dept_id for i in items)

    # 5. Delete Department
    response = await client.delete(f"/api/v1/platform/departments/{dept_id}", headers=headers)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_department_duplicate_code(client: AsyncClient, db: AsyncSession, organization, organizer):
    headers = auth_headers(organizer)
    payload = {
        "name": "HR Department",
        "code": "HR_DUP",
        "description": "HR"
    }
    # Create first
    resp1 = await client.post("/api/v1/platform/departments", json=payload, headers=headers)
    assert resp1.status_code == 201

    # Create second with duplicate code
    resp2 = await client.post("/api/v1/platform/departments", json=payload, headers=headers)
    assert resp2.status_code == 409


@pytest.mark.asyncio
async def test_department_membership(client: AsyncClient, db: AsyncSession, organization, organizer):
    headers = auth_headers(organizer)
    # Create dept
    payload = {
        "name": "Customer Success",
        "code": "CS_MEMBER",
        "description": "CS"
    }
    resp = await client.post("/api/v1/platform/departments", json=payload, headers=headers)
    dept_id = resp.json()["id"]

    # Add member
    member_payload = {"user_id": str(organizer.id)}
    response = await client.post(f"/api/v1/platform/departments/{dept_id}/members", json=member_payload, headers=headers)
    assert response.status_code == 201
    assert response.json()["user_id"] == str(organizer.id)

    # List members
    response = await client.get(f"/api/v1/platform/departments/{dept_id}/members", headers=headers)
    assert response.status_code == 200
    members = response.json()
    assert len(members) == 1
    assert members[0]["user_id"] == str(organizer.id)

    # Remove member
    response = await client.delete(f"/api/v1/platform/departments/{dept_id}/members/{organizer.id}", headers=headers)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_teams_crud(client: AsyncClient, db: AsyncSession, organization, organizer):
    headers = auth_headers(organizer)
    # 1. Create Dept first
    dept_resp = await client.post("/api/v1/platform/departments", json={
        "name": "Engineering Office",
        "code": "ENG_OFFICE"
    }, headers=headers)
    dept_id = dept_resp.json()["id"]

    # 2. Create Team
    team_payload = {
        "department_id": dept_id,
        "name": "Frontend Team",
        "code": "FE_TEAM"
    }
    response = await client.post("/api/v1/platform/teams", json=team_payload, headers=headers)
    assert response.status_code == 201
    team_id = response.json()["id"]

    # 3. Get Team
    response = await client.get(f"/api/v1/platform/teams/{team_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["code"] == "FE_TEAM"

    # 4. List Teams
    response = await client.get(f"/api/v1/platform/teams?department_id={dept_id}", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


@pytest.mark.asyncio
async def test_roles_and_permissions(client: AsyncClient, db: AsyncSession, organization, organizer):
    headers = auth_headers(organizer)
    # 1. Create Role
    role_payload = {
        "name": "Department Admin",
        "code": "DEPT_ADMIN_ROLE",
        "description": "Administrator of the department",
        "access_level": "DEPARTMENT"
    }
    response = await client.post("/api/v1/platform/roles", json=role_payload, headers=headers)
    assert response.status_code == 201
    role_id = response.json()["id"]

    # 2. Seed Permissions table
    perm_service = PermissionService(db)
    await perm_service.seed_permissions()

    # Get seeded permission
    perms = await perm_service.list_permissions()
    target_perm = perms[0]

    # 3. Toggle permission for role
    response = await client.post(
        f"/api/v1/platform/roles/{role_id}/permissions/{target_perm.id}/toggle",
        headers=headers
    )
    assert response.status_code == 200
    assert "added" in response.json()["message"]

    # 4. Get role permissions
    response = await client.get(f"/api/v1/platform/roles/{role_id}/permissions", headers=headers)
    assert response.status_code == 200
    assert target_perm.code in response.json()


@pytest.mark.asyncio
async def test_user_assignments(client: AsyncClient, db: AsyncSession, organization, organizer):
    headers = auth_headers(organizer)
    # 1. Create Dept, Team, and Role
    dept_resp = await client.post("/api/v1/platform/departments", json={
        "name": "Finance",
        "code": "FIN_ASSIGN"
    }, headers=headers)
    dept_id = dept_resp.json()["id"]

    team_resp = await client.post("/api/v1/platform/teams", json={
        "department_id": dept_id,
        "name": "Billing Team",
        "code": "BILL_TEAM"
    }, headers=headers)
    team_id = team_resp.json()["id"]

    role_resp = await client.post("/api/v1/platform/roles", json={
        "department_id": dept_id,
        "name": "Billing Coordinator",
        "code": "BILL_COORD",
        "access_level": "TEAM"
    }, headers=headers)
    role_id = role_resp.json()["id"]

    # 2. Create Assignment
    assign_payload = {
        "user_id": str(organizer.id),
        "department_id": dept_id,
        "team_id": team_id,
        "role_id": role_id
    }
    response = await client.post("/api/v1/platform/assignments", json=assign_payload, headers=headers)
    assert response.status_code == 201
    assign_id = response.json()["id"]

    # 3. List Assignments
    response = await client.get(f"/api/v1/platform/assignments?user_id={organizer.id}", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1

    # 4. Delete Assignment
    response = await client.delete(f"/api/v1/platform/assignments/{assign_id}", headers=headers)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_erp_authorization_engine(db: AsyncSession, organization, organizer):
    perm_service = PermissionService(db)
    
    # 1. Seed Permissions
    await perm_service.seed_permissions()
    perm_obj = await perm_service.repository.get_permission_by_code("pricing.manage")
    assert perm_obj is not None

    # 2. Setup department & roles
    dept = Department(organization_id=organization.id, name="Sales & Pricing", code="SALES_PRICING")
    db.add(dept)
    await db.flush()

    # Create team
    team = Team(organization_id=organization.id, department_id=dept.id, name="Pro pricing Team", code="PRO_PRICING")
    db.add(team)
    await db.flush()

    # Create Role with TEAM access level
    role = DepartmentRole(
        organization_id=organization.id,
        department_id=dept.id,
        name="Team Manager",
        code="TEAM_MGR",
        access_level="TEAM"
    )
    db.add(role)
    await db.flush()

    # Grant permission to role
    rp = PlatformRolePermission(role_id=role.id, permission_id=perm_obj.id)
    db.add(rp)
    await db.flush()

    # Create assignment
    asgn = UserAssignment(
        organization_id=organization.id,
        user_id=organizer.id,
        department_id=dept.id,
        team_id=team.id,
        role_id=role.id
    )
    db.add(asgn)
    await db.commit()

    # 3. Check access
    # CASE A: Matches team scope (Authorized)
    is_allowed = await perm_service.check_user_permission(
        user_id=organizer.id,
        org_id=organization.id,
        required_permission="pricing.manage",
        resource_dept_id=dept.id,
        resource_team_id=team.id
    )
    assert is_allowed is True

    # CASE B: Different team scope (Denied)
    another_team_id = uuid.uuid4()
    is_allowed = await perm_service.check_user_permission(
        user_id=organizer.id,
        org_id=organization.id,
        required_permission="pricing.manage",
        resource_dept_id=dept.id,
        resource_team_id=another_team_id
    )
    assert is_allowed is False
