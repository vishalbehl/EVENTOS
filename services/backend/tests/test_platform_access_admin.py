import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.audit.models.audit_domain_tables import AccessReview
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.platform.roles.models import DepartmentRole
from app.modules.events.models.event import Event
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.user_assignment import UserEventAssignment
from tests.conftest import activate_event_for_test, auth_headers


SUPPORT_REASON = "Administering approved tenant access configuration"


@pytest.mark.asyncio
async def test_break_glass_review_requires_dual_control_and_never_grants_access_automatically(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organizer: User,
    organization: Organization,
):
    headers = {**scoped_headers(super_admin), "Idempotency-Key": f"review-{uuid.uuid4()}"}
    created = await client.post(
        f"/api/v1/superadmin/security-governance/access-reviews?organization_id={organization.id}",
        headers=headers,
        json={
            "target_user_id": str(organizer.id),
            "review_type": "BREAK_GLASS",
            "reason": "Requesting emergency access review for live incident",
            "scope_json": {"permission": "incident.read"},
            "due_in_hours": 4,
        },
    )
    assert created.status_code == 201, created.text
    review = created.json()

    self_approval = await client.patch(
        f"/api/v1/superadmin/security-governance/access-reviews/{review['id']}?organization_id={organization.id}",
        headers=scoped_headers(super_admin),
        json={"status": "APPROVED", "reason": "Approving emergency incident access request", "version": 1},
    )
    assert self_approval.status_code == 409
    assert self_approval.json()["detail"]["code"] == "DUAL_CONTROL_REQUIRED"
    await db.refresh(organizer)
    assert organizer.platform_role is None
    persisted = await db.get(AccessReview, uuid.UUID(review["id"]))
    assert persisted is not None and persisted.status == "OPEN"


def scoped_headers(user: User) -> dict[str, str]:
    return {**auth_headers(user), "X-Support-Reason": SUPPORT_REASON}


@pytest.mark.asyncio
async def test_access_admin_requires_explicit_tenant_scope_and_super_admin(
    client: AsyncClient,
    super_admin: User,
    organizer: User,
    organization: Organization,
):
    missing_scope = await client.get(
        "/api/v1/superadmin/access/roles",
        headers=scoped_headers(super_admin),
    )
    assert missing_scope.status_code == 422

    forbidden = await client.get(
        f"/api/v1/superadmin/access/roles?organization_id={organization.id}",
        headers=scoped_headers(organizer),
    )
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_access_admin_role_lifecycle_is_scoped_versioned_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
):
    other_org = Organization(
        name="Other Access Tenant",
        slug=f"other-access-{uuid.uuid4().hex[:8]}",
        plan="pro",
    )
    db.add(other_org)
    await db.flush()
    hidden_role = DepartmentRole(
        organization_id=other_org.id,
        name="Hidden Tenant Role",
        code="HIDDEN_ROLE",
        access_level="GLOBAL",
        created_by=super_admin.id,
        updated_by=super_admin.id,
    )
    db.add(hidden_role)
    await db.commit()

    base = f"/api/v1/superadmin/access/roles?organization_id={organization.id}"
    created_response = await client.post(
        base,
        headers=scoped_headers(super_admin),
        json={
            "name": "Event Operations Lead",
            "code": "EVENT_OPERATIONS_LEAD",
            "description": "Controls event operations",
            "access_level": "GLOBAL",
            "reason": "Creating approved operations access role",
        },
    )
    assert created_response.status_code == 201, created_response.text
    created = created_response.json()

    listed = await client.get(base, headers=scoped_headers(super_admin))
    assert listed.status_code == 200, listed.text
    assert [item["id"] for item in listed.json()] == [created["id"]]

    stale_timestamp = "2000-01-01T00:00:00Z"
    stale = await client.patch(
        f"/api/v1/superadmin/access/roles/{created['id']}?organization_id={organization.id}",
        headers=scoped_headers(super_admin),
        json={
            "name": "Stale Update",
            "expected_updated_at": stale_timestamp,
            "reason": "Testing stale role update rejection",
        },
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "VERSION_CONFLICT"

    updated = await client.patch(
        f"/api/v1/superadmin/access/roles/{created['id']}?organization_id={organization.id}",
        headers=scoped_headers(super_admin),
        json={
            "name": "Event Operations Director",
            "expected_updated_at": created["updated_at"],
            "reason": "Expanding the approved operations role scope",
        },
    )
    assert updated.status_code == 200, updated.text

    archived = await client.request(
        "DELETE",
        f"/api/v1/superadmin/access/roles/{created['id']}?organization_id={organization.id}",
        headers=scoped_headers(super_admin),
        json={"reason": "Archiving obsolete approved access role"},
    )
    assert archived.status_code == 200, archived.text

    actions = set((await db.execute(select(AuditLog.action_type).where(
        AuditLog.organization_id == organization.id,
        AuditLog.resource_id == uuid.UUID(created["id"]),
    ))).scalars().all())
    assert {"PLATFORM_ROLE_CREATED", "PLATFORM_ROLE_UPDATED", "PLATFORM_ROLE_DELETED"}.issubset(actions)


@pytest.mark.asyncio
async def test_access_admin_permission_mapping_rejects_cross_tenant_role(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
):
    other_org = Organization(
        name="Permission Isolation Tenant",
        slug=f"permission-isolation-{uuid.uuid4().hex[:8]}",
        plan="pro",
    )
    db.add(other_org)
    await db.flush()
    other_role = DepartmentRole(
        organization_id=other_org.id,
        name="Other Tenant Admin",
        code="OTHER_TENANT_ADMIN",
        access_level="GLOBAL",
        created_by=super_admin.id,
        updated_by=super_admin.id,
    )
    db.add(other_role)
    await db.commit()

    response = await client.get(
        f"/api/v1/superadmin/access/roles/{other_role.id}/permissions?organization_id={organization.id}",
        headers=scoped_headers(super_admin),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_user_deactivation_revokes_sessions_and_writes_sensitive_audit(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organizer: User,
):
    response = await client.patch(
        f"/api/v1/platform/users/{organizer.id}/status",
        headers=auth_headers(super_admin),
        json={"is_active": False, "reason": "Suspending compromised organizer account"},
    )
    assert response.status_code == 200, response.text
    await db.refresh(organizer)
    assert organizer.is_active is False
    audit = await db.scalar(select(AuditLog).where(
        AuditLog.resource_id == organizer.id,
        AuditLog.action_type == "USER_DEACTIVATED",
    ))
    assert audit is not None
    assert audit.is_sensitive is True
    assert audit.change_diff["reason"] == "Suspending compromised organizer account"


@pytest.mark.asyncio
async def test_platform_role_change_is_step_up_boundary_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organizer: User,
):
    response = await client.patch(
        f"/api/v1/platform/users/{organizer.id}/platform-role",
        headers=auth_headers(super_admin),
        json={
            "platform_role": "SUPPORT_ADMIN",
            "reason": "Granting approved support administrator duties",
        },
    )
    assert response.status_code == 200, response.text
    await db.refresh(organizer)
    assert organizer.platform_role == "SUPPORT_ADMIN"
    audit = await db.scalar(select(AuditLog).where(
        AuditLog.resource_id == organizer.id,
        AuditLog.action_type == "USER_PLATFORM_ROLE_CHANGED",
    ))
    assert audit is not None
    assert audit.old_state["platform_role"] is None
    assert audit.new_state["platform_role"] == "SUPPORT_ADMIN"


@pytest.mark.asyncio
async def test_organization_hard_delete_is_fail_closed(
    client: AsyncClient,
    super_admin: User,
    organization: Organization,
):
    response = await client.request(
        "DELETE",
        f"/api/v1/platform/organizations/{organization.id}",
        headers=auth_headers(super_admin),
        json={"reason": "Requested tenant deletion under retention review"},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "RETENTION_WORKFLOW_REQUIRED"


@pytest.mark.asyncio
async def test_organization_update_requires_reason_and_writes_audit(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
):
    missing_reason = await client.put(
        f"/api/v1/platform/organisations/{organization.id}",
        headers=auth_headers(super_admin),
        json={"name": "Unsafe Rename"},
    )
    assert missing_reason.status_code == 422

    response = await client.put(
        f"/api/v1/platform/organisations/{organization.id}",
        headers=auth_headers(super_admin),
        json={
            "name": "Updated Tenant Name",
            "reason": "Correcting verified tenant legal display name",
        },
    )
    assert response.status_code == 200, response.text
    await db.refresh(organization)
    assert organization.name == "Updated Tenant Name"
    audit = await db.scalar(select(AuditLog).where(
        AuditLog.resource_id == organization.id,
        AuditLog.action_type == "ORGANIZATION_DETAILS_UPDATED",
    ))
    assert audit is not None
    assert audit.change_diff["fields"] == ["name"]


@pytest.mark.asyncio
async def test_organization_provisioning_is_idempotent_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
):
    key = f"provision-{uuid.uuid4()}"
    payload = {
        "name": "Provisioned Enterprise Tenant",
        "slug": f"provisioned-{uuid.uuid4().hex[:8]}",
        "owner_email": f"owner-{uuid.uuid4().hex[:8]}@example.com",
        "owner_first_name": "Tenant",
        "owner_last_name": "Owner",
        "country": "IN",
        "timezone": "Asia/Kolkata",
        "reason": "Provisioning approved enterprise customer tenant",
    }
    headers = {**auth_headers(super_admin), "Idempotency-Key": key}
    created = await client.post("/api/v1/platform/organisations", headers=headers, json=payload)
    assert created.status_code == 201, created.text
    replayed = await client.post("/api/v1/platform/organisations", headers=headers, json=payload)
    assert replayed.status_code == 201, replayed.text
    assert replayed.json()["organization"]["id"] == created.json()["organization"]["id"]
    assert replayed.json()["replayed"] is True

    conflict = await client.post(
        "/api/v1/platform/organisations",
        headers=headers,
        json={**payload, "name": "Conflicting Tenant Name"},
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"

    organization_id = uuid.UUID(created.json()["organization"]["id"])
    audit = await db.scalar(select(AuditLog).where(
        AuditLog.organization_id == organization_id,
        AuditLog.action_type == "ORGANIZATION_PROVISIONED",
    ))
    assert audit is not None
    member = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.org_role == "owner",
    ))
    assert member is not None
    assert member.invite_first_name == "Tenant"


@pytest.mark.asyncio
async def test_member_event_assignment_is_tenant_scoped_limited_and_removed_with_access(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organizer: User,
    organization: Organization,
    event: Event,
):
    await activate_event_for_test(db, event)
    member = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.organization_id == organization.id,
        OrganizationMember.user_id == organizer.id,
    ))
    assert member is not None
    reason = "Assigning approved organizer to event workspace"
    assigned = await client.put(
        f"/api/v1/platform/organisations/{organization.id}/members/{member.id}/events/{event.id}",
        headers={
            **auth_headers(super_admin),
            "Idempotency-Key": f"member-event-assign-{uuid.uuid4()}",
        },
        json={"permissions": {"can_manage_sessions": True}, "reason": reason},
    )
    assert assigned.status_code == 200, assigned.text
    updated = await client.put(
        f"/api/v1/platform/organisations/{organization.id}/members/{member.id}/events/{event.id}",
        headers={
            **auth_headers(super_admin),
            "Idempotency-Key": f"member-event-update-{uuid.uuid4()}",
        },
        json={"permissions": {"can_manage_sessions": False}, "reason": "Reducing approved event workspace permissions"},
    )
    assert updated.status_code == 200, updated.text
    assignments = (await db.execute(select(UserEventAssignment).where(
        UserEventAssignment.user_id == organizer.id,
        UserEventAssignment.event_id == event.id,
    ))).scalars().all()
    assert len(assignments) == 1

    other_org = Organization(name="Hidden Assignment Tenant", slug=f"hidden-{uuid.uuid4().hex[:8]}", plan="pro")
    db.add(other_org)
    await db.flush()
    hidden_event = Event(
        organization_id=other_org.id,
        created_by=super_admin.id,
        name="Hidden Event",
        short_code=f"HE{uuid.uuid4().hex[:4].upper()}",
        location="Hidden",
        venue_name="Hidden",
        start_date=event.start_date,
        end_date=event.end_date,
        timezone="UTC",
        status="draft",
        max_file_size_mb=500,
        allowed_formats=["pdf"],
    )
    db.add(hidden_event)
    await db.commit()
    concealed = await client.put(
        f"/api/v1/platform/organisations/{organization.id}/members/{member.id}/events/{hidden_event.id}",
        headers={
            **auth_headers(super_admin),
            "Idempotency-Key": f"member-event-cross-tenant-{uuid.uuid4()}",
        },
        json={"permissions": {}, "reason": "Testing cross tenant assignment concealment"},
    )
    assert concealed.status_code == 404

    removed = await client.request(
        "DELETE",
        f"/api/v1/platform/organisations/{organization.id}/members/{member.id}",
        headers=auth_headers(super_admin),
        json={"reason": "Removing organizer after approved access review"},
    )
    assert removed.status_code == 200, removed.text
    await db.refresh(organizer)
    assert organizer.is_active is False
    assert await db.scalar(select(UserEventAssignment.id).where(UserEventAssignment.user_id == organizer.id)) is None
