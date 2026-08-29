import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.billing_domain_tables import Invoice, OrganizationBillingProfile
from app.modules.billing.models.subscription import Addon, OrganizationAddon, OrganizationSubscription, SubscriptionPlan
from app.modules.events.models.event import Event
from app.modules.integrations.models.webhook import Webhook
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import CommercialAccessRequest, OrganizationLocation, OrganizationNotificationRule, OrganizationTeam, OrganizationTeamEvent, OrganizationTeamMember
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.rbac.models.rbac import Permission, Role, RolePermission, UserRoleAssignment
from app.modules.rbac.models.organization_member import OrganizationMember
from conftest import activate_event_for_test, auth_headers


async def make_owner(db: AsyncSession, organization, organizer) -> None:
    member = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.organization_id == organization.id,
        OrganizationMember.user_id == organizer.id,
    ))
    assert member is not None
    member.org_role = "owner"
    member.is_active = True
    await db.commit()


@pytest.mark.asyncio
async def test_organiser_roles_are_tenant_scoped(client: AsyncClient, db: AsyncSession, organization, organizer):
    other_org = Organization(name="Other organiser tenant", slug=f"other-{uuid.uuid4().hex[:8]}")
    db.add(other_org)
    await db.flush()
    db.add(Role(organization_id=other_org.id, name="Other tenant role", is_system_role=False))
    await db.commit()

    response = await client.post(
        "/api/v1/rbac/roles",
        headers=auth_headers(organizer),
        json={"name": "Registration Manager", "description": "Manages registrations", "is_system_role": False},
    )
    assert response.status_code == 200
    role_id = uuid.UUID(response.json()["id"])
    role = await db.get(Role, role_id)
    assert role is not None
    assert role.organization_id == organization.id

    listed = await client.get("/api/v1/rbac/roles", headers=auth_headers(organizer))
    assert listed.status_code == 200
    names = {item["name"] for item in listed.json()}
    assert "Registration Manager" in names
    assert "Other tenant role" not in names

    directory = await client.get(
        "/api/v1/organiser/access/roles?page=1&page_size=1&search=Registration",
        headers=auth_headers(organizer),
    )
    assert directory.status_code == 200, directory.text
    assert directory.json()["total"] == 1
    assert directory.json()["items"][0]["name"] == "Registration Manager"


@pytest.mark.asyncio
async def test_organiser_cannot_create_system_role(client: AsyncClient, organizer):
    response = await client.post(
        "/api/v1/rbac/roles",
        headers=auth_headers(organizer),
        json={"name": "Platform owner", "description": None, "is_system_role": True},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "SYSTEM_ROLE_CREATION_FORBIDDEN"


@pytest.mark.asyncio
async def test_organiser_role_update_is_versioned(client: AsyncClient, db: AsyncSession, organization, organizer):
    role = Role(organization_id=organization.id, name="Programme Editor", is_system_role=False, version=2)
    db.add(role)
    await db.commit()
    stale = await client.patch(
        f"/api/v1/rbac/roles/{role.id}",
        headers={**auth_headers(organizer), "If-Match": "1"},
        json={"name": "Programme Manager", "description": "Updated"},
    )
    assert stale.status_code == 409
    assert stale.json()["detail"] == {"code": "VERSION_CONFLICT", "current_version": 2}


@pytest.mark.asyncio
async def test_organiser_role_clone_preserves_permissions(client: AsyncClient, db: AsyncSession, organization, organizer):
    role = Role(organization_id=organization.id, name="Registration Editor", is_system_role=False)
    permission = Permission(code=f"REGISTRATION_CLONE_{uuid.uuid4().hex[:8]}", name="Registration clone test", module="REGISTRATION")
    db.add_all([role, permission])
    await db.flush()
    db.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await db.commit()
    cloned = await client.post(
        f"/api/v1/rbac/roles/{role.id}/clone",
        headers=auth_headers(organizer),
        json={"name": "Registration Reviewer", "description": "Cloned role"},
    )
    assert cloned.status_code == 201
    cloned_id = uuid.UUID(cloned.json()["id"])
    copied = await db.scalar(select(RolePermission).where(RolePermission.role_id == cloned_id, RolePermission.permission_id == permission.id))
    assert copied is not None


@pytest.mark.asyncio
async def test_role_permission_change_is_tenant_scoped_and_audited(client: AsyncClient, db: AsyncSession, organization, organizer):
    role = Role(organization_id=organization.id, name="Speaker Manager", is_system_role=False)
    permission = Permission(code=f"SPEAKERS_MANAGE_{uuid.uuid4().hex[:8]}", name="Manage speakers", module="SPEAKERS")
    db.add_all([role, permission])
    await db.commit()

    response = await client.post(
        f"/api/v1/rbac/roles/{role.id}/permissions/{permission.code}/toggle",
        headers=auth_headers(organizer),
    )
    assert response.status_code == 200
    audit = await db.scalar(select(AuditLog).where(
        AuditLog.organization_id == organization.id,
        AuditLog.resource_id == role.id,
        AuditLog.action_type == "USER_ROLE_PERMISSION_GRANTED",
    ))
    assert audit is not None


@pytest.mark.asyncio
async def test_user_role_assignment_lifecycle_is_tenant_scoped(client: AsyncClient, db: AsyncSession, organization, organizer, event):
    await make_owner(db, organization, organizer)
    role = Role(organization_id=organization.id, name="Event Finance Reviewer", is_system_role=False)
    db.add(role)
    await db.commit()
    created = await client.post(
        "/api/v1/rbac/assignments",
        headers={**auth_headers(organizer), "Idempotency-Key": "role-assignment-test"},
        json={"user_id": str(organizer.id), "role_id": str(role.id), "event_id": str(event.id)},
    )
    assert created.status_code == 201
    assignment_id = uuid.UUID(created.json()["id"])
    assignment = await db.get(UserRoleAssignment, assignment_id)
    assert assignment is not None
    assert assignment.organization_id == organization.id
    assert assignment.event_id == event.id

    listed = await client.get("/api/v1/rbac/assignments", headers=auth_headers(organizer))
    assert listed.status_code == 200
    assert any(row["id"] == str(assignment_id) and row["scope"] == "EVENT" for row in listed.json()["items"])

    directory = await client.get(
        "/api/v1/organiser/access/assignments?scope=EVENT&page=1&page_size=1&search=Finance",
        headers=auth_headers(organizer),
    )
    assert directory.status_code == 200, directory.text
    assert directory.json()["total"] == 1
    assert directory.json()["items"][0]["id"] == str(assignment_id)

    in_use = await client.delete(f"/api/v1/rbac/roles/{role.id}", headers={**auth_headers(organizer), "If-Match": "1"})
    assert in_use.status_code == 409
    assert in_use.json()["detail"] == {"code": "ROLE_IN_USE", "assignments": 1}

    removed = await client.delete(f"/api/v1/rbac/assignments/{assignment_id}", headers=auth_headers(organizer))
    assert removed.status_code == 204
    assert await db.get(UserRoleAssignment, assignment_id) is None


@pytest.mark.asyncio
async def test_effective_access_preview_reports_only_new_permissions(client: AsyncClient, db: AsyncSession, organization, organizer, event):
    await make_owner(db, organization, organizer)
    existing_role = Role(organization_id=organization.id, name="Existing access", is_system_role=False)
    proposed_role = Role(organization_id=organization.id, name="Proposed access", is_system_role=False)
    shared = Permission(code=f"SHARED_{uuid.uuid4().hex[:8]}", name="Shared permission", module="TEST")
    added = Permission(code=f"ADDED_{uuid.uuid4().hex[:8]}", name="Added permission", module="TEST")
    db.add_all([existing_role, proposed_role, shared, added]); await db.flush()
    db.add_all([
        RolePermission(role_id=existing_role.id, permission_id=shared.id),
        RolePermission(role_id=proposed_role.id, permission_id=shared.id),
        RolePermission(role_id=proposed_role.id, permission_id=added.id),
        UserRoleAssignment(user_id=organizer.id, role_id=existing_role.id, organization_id=organization.id, event_id=None, assigned_by=organizer.id),
    ])
    await db.commit()
    preview = await client.get(
        f"/api/v1/organiser/access/effective-preview?user_id={organizer.id}&role_id={proposed_role.id}&event_id={event.id}",
        headers=auth_headers(organizer),
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["added_permissions"] == [added.code]
    assert set(preview.json()["effective_permissions"]) == {shared.code, added.code}
    assert preview.json()["duplicate_assignment"] is False


@pytest.mark.asyncio
async def test_organiser_security_policy_is_versioned(client: AsyncClient, db: AsyncSession, organization, organizer):
    await make_owner(db, organization, organizer)
    headers = {**auth_headers(organizer), "If-Match": "0"}
    created = await client.put("/api/v1/organiser/settings/security", headers=headers, json={"require_mfa": True, "allowed_auth_methods": ["PASSWORD", "TOTP"]})
    assert created.status_code == 200
    assert created.json()["version"] == 1

    stale = await client.put("/api/v1/organiser/settings/security", headers=headers, json={"require_mfa": False, "allowed_auth_methods": ["PASSWORD"]})
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "VERSION_CONFLICT"


@pytest.mark.asyncio
async def test_notification_rule_toggle_is_versioned_and_tenant_scoped(client: AsyncClient, db: AsyncSession, organization, organizer):
    await make_owner(db, organization, organizer)
    rule = OrganizationNotificationRule(organization_id=organization.id, name="Pending registrations", trigger_key="REGISTRATION_PENDING", channel="EMAIL", is_enabled=True)
    db.add(rule)
    await db.commit()
    response = await client.patch(
        f"/api/v1/organiser/settings/notification-rules/{rule.id}",
        headers={**auth_headers(organizer), "If-Match": "1"},
        json={"is_enabled": False},
    )
    assert response.status_code == 200
    assert response.json() == {"id": str(rule.id), "is_enabled": False, "version": 2}


@pytest.mark.asyncio
async def test_organiser_branding_updates_organization_and_draft(client: AsyncClient, db: AsyncSession, organization, organizer):
    await make_owner(db, organization, organizer)
    response = await client.put(
        "/api/v1/organiser/settings/branding",
        headers={**auth_headers(organizer), "If-Match": "0"},
        json={"logo_url": "https://assets.example.test/logo.png", "primary_color": "#112233", "secondary_color": "#445566"},
    )
    assert response.status_code == 200
    await db.refresh(organization)
    assert organization.logo_url == "https://assets.example.test/logo.png"
    assert organization.primary_color == "#112233"
    assert response.json()["status"] == "DRAFT"


@pytest.mark.asyncio
async def test_organiser_location_create_is_tenant_scoped_and_audited(client: AsyncClient, db: AsyncSession, organization, organizer):
    await make_owner(db, organization, organizer)
    response = await client.post(
        "/api/v1/organiser/locations",
        headers=auth_headers(organizer),
        json={
            "name": "Delhi Operations Office",
            "location_type": "REGIONAL_OFFICE",
            "address": {"line1": "Conference Road", "city": "Delhi"},
            "timezone": "Asia/Kolkata",
            "contact": {},
            "status": "ACTIVE",
        },
    )
    assert response.status_code == 201
    location_id = uuid.UUID(response.json()["id"])
    location = await db.get(OrganizationLocation, location_id)
    assert location is not None
    assert location.organization_id == organization.id
    audit = await db.scalar(select(AuditLog).where(
        AuditLog.organization_id == organization.id,
        AuditLog.resource_id == location_id,
        AuditLog.action_type == "ORGANIZATION_LOCATION_CREATED",
    ))
    assert audit is not None


@pytest.mark.asyncio
async def test_organiser_location_update_rejects_stale_version(client: AsyncClient, db: AsyncSession, organization, organizer):
    await make_owner(db, organization, organizer)
    location = OrganizationLocation(
        organization_id=organization.id,
        name="Mumbai Office",
        location_type="REGIONAL_OFFICE",
        address={},
        timezone="Asia/Kolkata",
        contact={},
        status="ACTIVE",
        version=2,
    )
    db.add(location)
    await db.commit()
    response = await client.put(
        f"/api/v1/organiser/locations/{location.id}",
        headers={**auth_headers(organizer), "If-Match": "1"},
        json={
            "name": "Mumbai Operations Office",
            "location_type": "REGIONAL_OFFICE",
            "address": {},
            "timezone": "Asia/Kolkata",
            "contact": {},
            "status": "ACTIVE",
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"] == {"code": "VERSION_CONFLICT", "current_version": 2}


@pytest.mark.asyncio
async def test_organisation_branch_owner_and_team_are_tenant_validated(client: AsyncClient, db: AsyncSession, organization, organizer):
    await make_owner(db, organization, organizer)
    member = await db.scalar(select(OrganizationMember).where(OrganizationMember.organization_id == organization.id, OrganizationMember.user_id == organizer.id))
    assert member is not None
    team = OrganizationTeam(organization_id=organization.id, name=f"Branch team {uuid.uuid4().hex[:6]}", owner_member_id=member.id, created_by=organizer.id)
    db.add(team); await db.commit()
    created = await client.post(
        "/api/v1/organiser/locations",
        headers=auth_headers(organizer),
        json={"name": "Bengaluru Branch", "location_type": "REGIONAL_OFFICE", "address": {"city": "Bengaluru"}, "timezone": "Asia/Kolkata", "contact": {}, "manager_user_id": str(organizer.id), "team_id": str(team.id), "status": "ACTIVE"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["manager_user_id"] == str(organizer.id)
    assert created.json()["team_id"] == str(team.id)

    other_org = Organization(name="Other branch tenant", slug=f"branch-{uuid.uuid4().hex[:8]}")
    db.add(other_org); await db.flush()
    other_team = OrganizationTeam(organization_id=other_org.id, name="Private branch team", created_by=organizer.id)
    db.add(other_team); await db.commit()
    forbidden = await client.post(
        "/api/v1/organiser/locations",
        headers=auth_headers(organizer),
        json={"name": "Cross Tenant Branch", "location_type": "REGIONAL_OFFICE", "address": {}, "timezone": "UTC", "contact": {}, "team_id": str(other_team.id), "status": "ACTIVE"},
    )
    assert forbidden.status_code == 422
    assert forbidden.json()["detail"]["code"] == "BRANCH_TEAM_NOT_ACTIVE"


@pytest.mark.asyncio
async def test_organiser_team_update_rejects_stale_version(client: AsyncClient, db: AsyncSession, organization, organizer):
    await make_owner(db, organization, organizer)
    team = OrganizationTeam(
        organization_id=organization.id,
        name="Programme team",
        description="Owns the programme",
        version=2,
        created_by=organizer.id,
    )
    db.add(team)
    await db.commit()
    response = await client.patch(
        f"/api/v1/organiser/teams/{team.id}",
        headers={**auth_headers(organizer), "If-Match": "1"},
        json={"name": "Programme operations", "description": "Updated"},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == {"code": "STALE_VERSION", "current_version": 2}


@pytest.mark.asyncio
async def test_organiser_team_member_removal_is_audited(client: AsyncClient, db: AsyncSession, organization, organizer):
    await make_owner(db, organization, organizer)
    member = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.organization_id == organization.id,
        OrganizationMember.user_id == organizer.id,
    ))
    assert member is not None
    team = OrganizationTeam(organization_id=organization.id, name="Registration team", created_by=organizer.id)
    db.add(team)
    await db.flush()
    assignment = OrganizationTeamMember(
        organization_id=organization.id,
        team_id=team.id,
        organization_member_id=member.id,
        created_by=organizer.id,
    )
    db.add(assignment)
    await db.commit()
    response = await client.delete(
        f"/api/v1/organiser/teams/{team.id}/members/{member.id}",
        headers=auth_headers(organizer),
    )
    assert response.status_code == 204
    assert await db.get(OrganizationTeamMember, assignment.id) is None
    audit = await db.scalar(select(AuditLog).where(
        AuditLog.organization_id == organization.id,
        AuditLog.resource_id == team.id,
        AuditLog.action_type == "ORGANIZATION_TEAM_MEMBER_REMOVED",
    ))
    assert audit is not None


@pytest.mark.asyncio
async def test_team_access_loss_preview_accounts_for_inherited_capabilities(client: AsyncClient, db: AsyncSession, organization, organizer, event):
    await make_owner(db, organization, organizer)
    member = await db.scalar(select(OrganizationMember).where(OrganizationMember.organization_id == organization.id, OrganizationMember.user_id == organizer.id))
    assert member is not None
    primary = OrganizationTeam(organization_id=organization.id, name="Primary access team", created_by=organizer.id)
    retained = OrganizationTeam(organization_id=organization.id, name="Retained access team", created_by=organizer.id)
    db.add_all([primary, retained]); await db.flush()
    db.add_all([
        OrganizationTeamMember(organization_id=organization.id, team_id=primary.id, organization_member_id=member.id, created_by=organizer.id),
        OrganizationTeamMember(organization_id=organization.id, team_id=retained.id, organization_member_id=member.id, created_by=organizer.id),
        OrganizationTeamEvent(organization_id=organization.id, team_id=primary.id, event_id=event.id, permissions={"registration": True, "speakers": True}, created_by=organizer.id),
        OrganizationTeamEvent(organization_id=organization.id, team_id=retained.id, event_id=event.id, permissions={"registration": True}, created_by=organizer.id),
    ])
    await db.commit()

    member_preview = await client.get(f"/api/v1/organiser/teams/{primary.id}/members/{member.id}/access-loss-preview", headers=auth_headers(organizer))
    assert member_preview.status_code == 200, member_preview.text
    assert member_preview.json()["impacted_events"] == [{"event_id": str(event.id), "event_name": event.name, "lost_capabilities": ["speakers"]}]

    event_preview = await client.get(f"/api/v1/organiser/teams/{primary.id}/events/{event.id}/access-loss-preview", headers=auth_headers(organizer))
    assert event_preview.status_code == 200, event_preview.text
    assert event_preview.json()["impacted_members"] == [{"member_id": str(member.id), "lost_capabilities": ["speakers"]}]


@pytest.mark.asyncio
async def test_organiser_member_and_team_directories_are_paginated_and_tenant_scoped(client: AsyncClient, db: AsyncSession, organization, organizer):
    other_org = Organization(name="Directory other tenant", slug=f"directory-{uuid.uuid4().hex[:8]}")
    db.add(other_org)
    await db.flush()
    for index in range(3):
        db.add(OrganizationMember(
            organization_id=organization.id,
            org_role="member",
            invite_email=f"pending-{index}@example.test",
            is_active=True,
        ))
        db.add(OrganizationTeam(
            organization_id=organization.id,
            name=f"Operations team {index}",
            created_by=organizer.id,
        ))
    db.add(OrganizationMember(organization_id=other_org.id, org_role="member", invite_email="private@example.test"))
    db.add(OrganizationTeam(organization_id=other_org.id, name="Private other team", created_by=organizer.id))
    await db.commit()

    members = await client.get(
        "/api/v1/organiser/members?page=2&page_size=2&status=pending&search=pending",
        headers=auth_headers(organizer),
    )
    assert members.status_code == 200, members.text
    member_payload = members.json()
    assert member_payload["total"] == 3
    assert member_payload["page"] == 2
    assert len(member_payload["items"]) == 1
    assert all(row["email"].endswith("@example.test") and row["email"] != "private@example.test" for row in member_payload["items"])

    teams = await client.get(
        "/api/v1/organiser/teams?page=2&page_size=2&search=Operations",
        headers=auth_headers(organizer),
    )
    assert teams.status_code == 200, teams.text
    team_payload = teams.json()
    assert team_payload["total"] == 3
    assert team_payload["page"] == 2
    assert len(team_payload["items"]) == 1
    assert all(row["name"] != "Private other team" for row in team_payload["items"])


@pytest.mark.asyncio
async def test_member_suspension_is_versioned_audited_and_reversible(client: AsyncClient, db: AsyncSession, organization, organizer, super_admin):
    member = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.organization_id == organization.id,
        OrganizationMember.user_id == organizer.id,
    ))
    assert member is not None
    member.org_role = "admin"
    member.accepted_at = member.accepted_at or datetime.now(timezone.utc)
    member.is_active = True
    member.version = 1
    await db.commit()

    suspended = await client.patch(
        f"/api/v1/organiser/members/{member.id}/status",
        headers={**auth_headers(super_admin), "If-Match": "1"},
        json={"is_active": False, "reason": "Temporary access review"},
    )
    assert suspended.status_code == 200, suspended.text
    assert suspended.json()["version"] == 2
    await db.refresh(member)
    await db.refresh(organizer)
    assert member.is_active is False
    assert member.suspension_reason == "Temporary access review"
    assert organizer.is_active is False

    stale = await client.patch(
        f"/api/v1/organiser/members/{member.id}/status",
        headers={**auth_headers(super_admin), "If-Match": "1"},
        json={"is_active": True, "reason": "Review complete"},
    )
    assert stale.status_code == 409

    reactivated = await client.patch(
        f"/api/v1/organiser/members/{member.id}/status",
        headers={**auth_headers(super_admin), "If-Match": "2"},
        json={"is_active": True, "reason": "Review complete"},
    )
    assert reactivated.status_code == 200, reactivated.text
    await db.refresh(member)
    await db.refresh(organizer)
    assert member.is_active is True
    assert member.suspension_reason is None
    assert organizer.is_active is True
    actions = set((await db.scalars(select(AuditLog.action_type).where(
        AuditLog.organization_id == organization.id,
        AuditLog.resource_id == member.id,
    ))).all())
    assert {"ORGANIZATION_MEMBER_SUSPENDED", "ORGANIZATION_MEMBER_REACTIVATED"} <= actions


@pytest.mark.asyncio
async def test_bulk_member_status_is_atomic_and_version_checked(client: AsyncClient, db: AsyncSession, organization, organizer, super_admin):
    member = await db.scalar(select(OrganizationMember).where(OrganizationMember.organization_id == organization.id, OrganizationMember.user_id == organizer.id))
    assert member is not None
    member.org_role = "admin"; member.accepted_at = member.accepted_at or datetime.now(timezone.utc); member.version = 1
    await db.commit()
    stale = await client.patch(
        "/api/v1/organiser/members-bulk/status",
        headers=auth_headers(super_admin),
        json={"members": [{"id": str(member.id), "version": 2}], "is_active": False, "reason": "Quarterly access review"},
    )
    assert stale.status_code == 409
    await db.refresh(member)
    assert member.is_active is True

    updated = await client.patch(
        "/api/v1/organiser/members-bulk/status",
        headers=auth_headers(super_admin),
        json={"members": [{"id": str(member.id), "version": 1}], "is_active": False, "reason": "Quarterly access review"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["updated"] == 1
    await db.refresh(member)
    assert member.is_active is False
    assert member.version == 2


@pytest.mark.asyncio
async def test_pending_invitation_resend_rotates_token_and_rejects_stale_version(client: AsyncClient, db: AsyncSession, organization, organizer):
    await make_owner(db, organization, organizer)
    member = OrganizationMember(
        organization_id=organization.id,
        org_role="member",
        invite_email=f"invite-{uuid.uuid4().hex[:8]}@example.test",
        invite_token=uuid.uuid4().hex,
        is_active=True,
        version=1,
    )
    db.add(member)
    await db.commit()
    original_token = member.invite_token

    resent = await client.post(
        f"/api/v1/organiser/invitations/{member.id}/resend",
        headers={**auth_headers(organizer), "If-Match": "1"},
    )
    assert resent.status_code == 200, resent.text
    assert resent.json()["version"] == 2
    await db.refresh(member)
    assert member.invite_token != original_token

    stale = await client.post(
        f"/api/v1/organiser/invitations/{member.id}/resend",
        headers={**auth_headers(organizer), "If-Match": "1"},
    )
    assert stale.status_code == 409

    revoked = await client.delete(
        f"/api/v1/organiser/invitations/{member.id}",
        headers={**auth_headers(organizer), "If-Match": "2"},
    )
    assert revoked.status_code == 204
    await db.refresh(member)
    assert member.is_active is False
    assert member.invite_token is None


@pytest.mark.asyncio
async def test_member_role_change_is_versioned_and_audited(client: AsyncClient, db: AsyncSession, organization, organizer, super_admin):
    member = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.organization_id == organization.id,
        OrganizationMember.user_id == organizer.id,
    ))
    assert member is not None
    member.org_role = "admin"
    member.accepted_at = member.accepted_at or datetime.now(timezone.utc)
    member.version = 1
    await db.commit()

    changed = await client.patch(
        f"/api/v1/organiser/members/{member.id}/role",
        headers={**auth_headers(super_admin), "If-Match": "1"},
        json={"org_role": "billing_only", "reason": "Finance responsibilities changed"},
    )
    assert changed.status_code == 200, changed.text
    assert changed.json() == {"id": str(member.id), "org_role": "billing_only", "version": 2}
    stale = await client.patch(
        f"/api/v1/organiser/members/{member.id}/role",
        headers={**auth_headers(super_admin), "If-Match": "1"},
        json={"org_role": "member", "reason": "Stale update attempt"},
    )
    assert stale.status_code == 409
    audit = await db.scalar(select(AuditLog).where(
        AuditLog.organization_id == organization.id,
        AuditLog.resource_id == member.id,
        AuditLog.action_type == "ORGANIZATION_MEMBER_ROLE_CHANGED",
    ))
    assert audit is not None


@pytest.mark.asyncio
async def test_team_owner_is_authoritative_and_preserved_on_idempotent_replay(client: AsyncClient, db: AsyncSession, organization, organizer):
    await make_owner(db, organization, organizer)
    member = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.organization_id == organization.id,
        OrganizationMember.user_id == organizer.id,
    ))
    assert member is not None
    headers = {**auth_headers(organizer), "Idempotency-Key": f"team-owner-{uuid.uuid4().hex}"}
    payload = {"name": f"Owned operations {uuid.uuid4().hex[:6]}", "description": "Lifecycle test", "owner_member_id": str(member.id)}

    created = await client.post("/api/v1/organiser/teams", headers=headers, json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["owner_member_id"] == str(member.id)
    replay = await client.post("/api/v1/organiser/teams", headers=headers, json=payload)
    assert replay.status_code == 201, replay.text
    assert replay.json() == created.json()


@pytest.mark.asyncio
async def test_organiser_event_catalogue_is_tenant_scoped_and_paginated(client: AsyncClient, db: AsyncSession, organization, organizer, event):
    other_org = Organization(name="Event catalogue other tenant", slug=f"catalogue-{uuid.uuid4().hex[:8]}")
    db.add(other_org)
    await db.flush()
    db.add(Event(
        organization_id=other_org.id,
        created_by=organizer.id,
        name="Other tenant private event",
        short_code=f"OT{uuid.uuid4().hex[:6].upper()}",
        start_date=event.start_date,
        end_date=event.end_date,
        timezone="UTC",
        status="draft",
        max_file_size_mb=500,
        allowed_formats=["pdf"],
    ))
    await db.commit()
    response = await client.get(
        "/api/v1/organiser/events?page=1&page_size=1&search=Test",
        headers=auth_headers(organizer),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["page"] == 1
    assert payload["page_size"] == 1
    assert [row["id"] for row in payload["items"]] == [str(event.id)]
    assert payload["summary"]["total"] == 1


@pytest.mark.asyncio
async def test_organiser_dashboard_aggregates_all_tenant_events(client: AsyncClient, db: AsyncSession, organization, organizer, event):
    for index in range(12):
        db.add(Event(
            organization_id=organization.id,
            created_by=organizer.id,
            name=f"Dashboard aggregate event {index}",
            short_code=f"DA{index:02d}{uuid.uuid4().hex[:4].upper()}",
            start_date=event.start_date,
            end_date=event.end_date,
            timezone="UTC",
            status="draft",
            max_file_size_mb=500,
            allowed_formats=["pdf"],
        ))
    await db.commit()

    response = await client.get("/api/v1/organiser/dashboard", headers=auth_headers(organizer))
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["metrics"]["active_events"] == 13
    assert payload["plan"]["events_used"] == 13
    assert len(payload["events"]) == 6

    report = await client.get(
        "/api/v1/organiser/reports/events?page=2&page_size=5",
        headers=auth_headers(organizer),
    )
    assert report.status_code == 200, report.text
    report_payload = report.json()
    assert report_payload["total"] == 13
    assert report_payload["page"] == 2
    assert report_payload["page_size"] == 5
    assert len(report_payload["events"]) == 5


@pytest.mark.asyncio
async def test_needs_attention_is_tenant_scoped_and_deep_links_to_existing_event_pages(
    client: AsyncClient,
    db: AsyncSession,
    organization,
    organizer,
    event,
):
    other_org = Organization(name="Attention isolation tenant", slug=f"attention-{uuid.uuid4().hex[:8]}")
    db.add(other_org)
    await db.flush()
    other_event = Event(
        organization_id=other_org.id,
        created_by=organizer.id,
        name="Other tenant attention event",
        short_code=f"OTA{uuid.uuid4().hex[:5].upper()}",
        start_date=event.start_date,
        end_date=event.end_date,
        timezone="UTC",
        status="draft",
        max_file_size_mb=500,
        allowed_formats=["pdf"],
    )
    db.add(other_event)
    await db.commit()

    response = await client.get("/api/v1/organiser/needs-attention", headers=auth_headers(organizer))
    assert response.status_code == 200, response.text
    tasks = response.json()
    assert tasks
    assert all(task["entity_id"] == str(event.id) for task in tasks)
    assert all(task["source"] == "ORGANISER_NEEDS_ATTENTION_READ_MODEL" for task in tasks)
    assert all(task["freshness_at"] for task in tasks)
    assert all(task["category"] and task["module"] for task in tasks)
    assert all(task["status"] == "open" for task in tasks)
    assert all(task["owner"] is None for task in tasks)
    assert all(task["age_seconds"] >= 0 for task in tasks)
    assert all(task["href"].startswith(f"/events/{event.id}/") for task in tasks)
    assert all(str(other_event.id) not in task["href"] for task in tasks)
    assert f"/events/{event.id}/setup/rooms-tracks" in {task["href"] for task in tasks}

    event_response = await client.get(
        f"/api/v1/organiser/events/{event.id}/needs-attention",
        headers=auth_headers(organizer),
    )
    assert event_response.status_code == 200, event_response.text
    event_tasks = event_response.json()
    assert {(task["id"], task["href"], task["count"]) for task in event_tasks} == {
        (task["id"], task["href"], task["count"]) for task in tasks
    }
    assert all(task["freshness_at"] for task in event_tasks)

    forbidden = await client.get(
        f"/api/v1/organiser/events/{other_event.id}/needs-attention",
        headers=auth_headers(organizer),
    )
    assert forbidden.status_code == 404


@pytest.mark.asyncio
async def test_documents_and_approval_rules_use_authoritative_paginated_sources(client: AsyncClient, organizer):
    documents = await client.get("/api/v1/organiser/documents?page=2&page_size=5", headers=auth_headers(organizer))
    assert documents.status_code == 200, documents.text
    assert documents.json() == {
        "items": [], "total": 0, "page": 2, "page_size": 5,
        "freshness_at": documents.json()["freshness_at"],
        "source": "platform.organization_documents+content.assets",
    }

    rules = await client.get("/api/v1/organiser/access/approval-rules?page=1&page_size=10", headers=auth_headers(organizer))
    assert rules.status_code == 200, rules.text
    assert rules.json()["items"] == []
    assert rules.json()["source"] == "organizer_access.organization_approval_rules"


@pytest.mark.asyncio
async def test_organisation_document_replacement_preserves_immutable_history(client: AsyncClient, db: AsyncSession, organization, organizer):
    await make_owner(db, organization, organizer)
    uploaded = await client.post(
        "/api/v1/organiser/documents?document_type=LEGAL",
        headers=auth_headers(organizer),
        files={"file": ("registration-v1.pdf", b"first-version", "application/pdf")},
    )
    assert uploaded.status_code == 201, uploaded.text
    first = uploaded.json()
    assert first["revision"] == 1

    replaced = await client.post(
        f"/api/v1/organiser/documents/{first['id']}/replace",
        headers={**auth_headers(organizer), "If-Match": "1"},
        files={"file": ("registration-v2.pdf", b"second-version", "application/pdf")},
    )
    assert replaced.status_code == 201, replaced.text
    second = replaced.json()
    assert second["revision"] == 2
    assert second["document_group_id"] == first["document_group_id"]

    listed = await client.get("/api/v1/organiser/documents", headers=auth_headers(organizer))
    rows = [row for row in listed.json()["items"] if row["document_group_id"] == first["document_group_id"]]
    assert len(rows) == 1
    assert rows[0]["id"] == second["id"]

    history = await client.get(f"/api/v1/organiser/documents/{second['id']}/history", headers=auth_headers(organizer))
    assert history.status_code == 200, history.text
    assert [row["revision"] for row in history.json()["items"]] == [2, 1]
    assert [row["is_current"] for row in history.json()["items"]] == [True, False]
    audit = await db.scalar(select(AuditLog).where(
        AuditLog.organization_id == organization.id,
        AuditLog.action_type == "ORGANIZATION_DOCUMENT_REPLACED",
    ))
    assert audit is not None


@pytest.mark.asyncio
async def test_attention_assignment_resolution_and_versioning_are_persistent(client: AsyncClient, super_admin, event):
    listed = await client.get("/api/v1/organiser/needs-attention", headers=auth_headers(super_admin))
    assert listed.status_code == 200, listed.text
    task = next(item for item in listed.json() if item["entity_id"] == str(event.id))

    assigned = await client.patch(
        f"/api/v1/organiser/needs-attention/{task['id']}/assign",
        json={"owner_user_id": str(super_admin.id)}, headers={**auth_headers(super_admin), "If-Match": "0"},
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["status"] == "assigned"

    stale = await client.patch(
        f"/api/v1/organiser/needs-attention/{task['id']}/resolve",
        json={"resolution": "Condition reviewed and corrected."}, headers={**auth_headers(super_admin), "If-Match": "0"},
    )
    assert stale.status_code == 409

    resolved = await client.patch(
        f"/api/v1/organiser/needs-attention/{task['id']}/resolve",
        json={"resolution": "Condition reviewed and corrected."}, headers={**auth_headers(super_admin), "If-Match": str(assigned.json()["version"])},
    )
    assert resolved.status_code == 200, resolved.text
    refreshed = await client.get("/api/v1/organiser/needs-attention", headers=auth_headers(super_admin))
    assert task["id"] not in {item["id"] for item in refreshed.json()}


@pytest.mark.asyncio
async def test_organiser_profile_is_versioned_audited_and_tenant_scoped(client: AsyncClient, super_admin):
    current = await client.get("/api/v1/organiser/organisation/profile", headers=auth_headers(super_admin))
    assert current.status_code == 200, current.text
    profile = current.json()
    payload = {
        "name": profile["name"], "legal_name": "Eventos Legal Private Limited",
        "registration_number": "REG-2026-001", "organization_type": "PRIVATE_LIMITED",
        "industry": "EVENTS", "billing_email": "billing@eventos.test",
        "contact_email": "ops@eventos.test", "contact_phone": "+91-9999999999",
        "website_url": "https://eventos.test", "billing_address": {"line1": "One Event Way", "city": "Delhi", "postal_code": "110001"},
        "portal_name": "Eventos", "country": "IN", "timezone": "Asia/Kolkata",
        "language": "English", "date_format": "DD/MM/YYYY", "time_format": "24 Hour",
        "currency": "INR", "logo_url": None, "primary_color": "#7c3aed", "secondary_color": "#ff426d",
    }
    updated = await client.put("/api/v1/organiser/organisation/profile", json=payload, headers={**auth_headers(super_admin), "If-Match": str(profile["version"])})
    assert updated.status_code == 200, updated.text
    assert updated.json()["legal_name"] == payload["legal_name"]
    assert updated.json()["version"] == profile["version"] + 1

    stale = await client.put("/api/v1/organiser/organisation/profile", json=payload, headers={**auth_headers(super_admin), "If-Match": str(profile["version"])})
    assert stale.status_code == 409


@pytest.mark.asyncio
async def test_organiser_addon_statuses_are_effective_and_tenant_scoped(client: AsyncClient, db: AsyncSession, organization, organizer):
    plan = SubscriptionPlan(name=f"Addon plan {uuid.uuid4().hex[:8]}", lifecycle_status="PUBLISHED")
    active = Addon(name="Active add-on", key=f"ACTIVE_{uuid.uuid4().hex[:8]}")
    included = Addon(name="Included add-on", key=f"INCLUDED_{uuid.uuid4().hex[:8]}")
    pending = Addon(name="Pending add-on", key=f"PENDING_{uuid.uuid4().hex[:8]}")
    expired = Addon(name="Expired add-on", key=f"EXPIRED_{uuid.uuid4().hex[:8]}")
    included.included_in_plan = plan.name
    db.add_all([plan, active, included, pending, expired])
    await db.flush()
    db.add(OrganizationSubscription(organization_id=organization.id, plan_id=plan.id, status="ACTIVE"))
    db.add(OrganizationAddon(organization_id=organization.id, addon_id=active.id, status="ACTIVE", quantity=3))
    db.add(OrganizationAddon(
        organization_id=organization.id,
        addon_id=expired.id,
        status="ACTIVE",
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    ))
    db.add(CommercialAccessRequest(
        organization_id=organization.id,
        requested_plan_id=plan.id,
        requested_addon_keys=[pending.key],
        billing_profile={},
        reason="Test a pending governed add-on request.",
        requested_by=organizer.id,
        idempotency_key=f"addon-status-{uuid.uuid4()}",
    ))
    await db.commit()

    response = await client.get("/api/v1/organiser/addons/status", headers=auth_headers(organizer))
    assert response.status_code == 200, response.text
    payload = response.json()
    by_key = {row["key"]: row for row in payload["items"]}
    assert by_key[active.key]["status"] == "ACTIVE"
    assert by_key[active.key]["quantity"] == 3
    assert by_key[included.key]["status"] == "INCLUDED"
    assert by_key[pending.key]["status"] == "PENDING"
    assert by_key[expired.key]["status"] == "EXPIRED"
    assert payload["source"] == "ORGANISER_ADDON_STATUS_READ_MODEL"


@pytest.mark.asyncio
async def test_organiser_audit_is_paginated_and_dashboard_exposes_recent_activity(client: AsyncClient, db: AsyncSession, organization, organizer, event):
    for index in range(3):
        db.add(AuditLog(
            organization_id=organization.id,
            actor_user_id=organizer.id,
            actor_role="organizer",
            resource_type="event",
            resource_id=event.id,
            action_type=f"ORGANISER_TEST_ACTION_{index}",
            is_sensitive=False,
        ))
    await db.commit()

    second_page = await client.get(
        "/api/v1/organiser/audit?page=2&page_size=2&resource=event",
        headers=auth_headers(organizer),
    )
    assert second_page.status_code == 200, second_page.text
    audit_payload = second_page.json()
    assert audit_payload["total"] >= 3
    assert audit_payload["page"] == 2
    assert audit_payload["page_size"] == 2
    assert len(audit_payload["items"]) >= 1

    dashboard = await client.get("/api/v1/organiser/dashboard", headers=auth_headers(organizer))
    assert dashboard.status_code == 200, dashboard.text
    activity = dashboard.json()["recent_activity"]
    assert activity
    assert all(row["resource_type"] and row["occurred_at"] for row in activity)


@pytest.mark.asyncio
async def test_organiser_event_csv_import_uses_canonical_event_creation(client: AsyncClient, db: AsyncSession, organization, organizer, event):
    await make_owner(db, organization, organizer)
    await activate_event_for_test(db, event)
    code = f"CSV{uuid.uuid4().hex[:6].upper()}"
    csv_body = (
        "name,short_code,start_date,end_date,venue_name,timezone,currency\n"
        f"Imported organiser event,{code},2027-04-10,2027-04-12,Convention Centre,Asia/Kolkata,INR\n"
    )
    response = await client.post(
        "/api/v1/organiser/events/import",
        headers={**auth_headers(organizer), "Idempotency-Key": str(uuid.uuid4())},
        files={"file": ("events.csv", csv_body, "text/csv")},
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["created"] == 1
    imported = await db.scalar(select(Event).where(Event.organization_id == organization.id, Event.short_code == code))
    assert imported is not None
    assert imported.status == "draft"
    audit = await db.scalar(select(AuditLog).where(
        AuditLog.organization_id == organization.id,
        AuditLog.resource_type == "event_import",
        AuditLog.action_type == "EVENTS_IMPORTED",
    ))
    assert audit is not None


@pytest.mark.asyncio
async def test_organiser_billing_profile_is_versioned_and_audited(client: AsyncClient, db: AsyncSession, organization, organizer):
    await make_owner(db, organization, organizer)
    payload = {
        "billing_name": "Eventos India Pvt Ltd",
        "billing_email": "billing@eventos.test",
        "billing_phone": "+91 9999999999",
        "gst_number": "07ABCDE1234F1Z5",
        "country": "IN",
        "currency": "INR",
    }
    created = await client.put(
        "/api/v1/organiser/billing/tax",
        headers={**auth_headers(organizer), "If-Match": "0"},
        json=payload,
    )
    assert created.status_code == 200
    assert created.json()["version"] == 1
    profile = await db.scalar(select(OrganizationBillingProfile).where(OrganizationBillingProfile.organization_id == organization.id))
    assert profile is not None
    stale = await client.put(
        "/api/v1/organiser/billing/tax",
        headers={**auth_headers(organizer), "If-Match": "0"},
        json={**payload, "billing_name": "Changed"},
    )
    assert stale.status_code == 409
    assert stale.json()["detail"] == {"code": "VERSION_CONFLICT", "current_version": 1}


@pytest.mark.asyncio
async def test_organiser_invoice_download_is_tenant_scoped(client: AsyncClient, db: AsyncSession, organization, organizer):
    invoice = Invoice(
        organization_id=organization.id,
        amount=1000,
        total_amount_inr=1180,
        gst_amount=180,
        currency="INR",
        status="PAID",
        invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
    )
    db.add(invoice)
    await db.commit()
    downloaded = await client.get(f"/api/v1/organiser/billing/invoices/{invoice.id}/download", headers=auth_headers(organizer))
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"].startswith("text/csv")
    assert invoice.invoice_number in downloaded.text


@pytest.mark.asyncio
async def test_organiser_report_export_is_audited_and_downloadable(client: AsyncClient, db: AsyncSession, organization, organizer, event):
    await make_owner(db, organization, organizer)
    created = await client.post(
        "/api/v1/organiser/reports/exports",
        headers={**auth_headers(organizer), "Idempotency-Key": "report-export-test-key"},
        json={"domain": "events", "format": "csv"},
    )
    assert created.status_code == 201
    export_id = created.json()["id"]
    downloaded = await client.get(
        f"/api/v1/organiser/reports/exports/{export_id}/download",
        headers=auth_headers(organizer),
    )
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"].startswith("text/csv")
    assert "name" in downloaded.text


@pytest.mark.asyncio
async def test_organiser_custom_report_definition_is_persisted(client: AsyncClient, db: AsyncSession, organization, organizer):
    await make_owner(db, organization, organizer)
    created = await client.post(
        "/api/v1/organiser/reports/custom",
        headers={**auth_headers(organizer), "Idempotency-Key": "custom-report-test-key"},
        json={"name": "Registration health", "domain": "registrations", "columns": ["name", "registrations"], "filters": {"status": "active"}},
    )
    assert created.status_code == 201
    listed = await client.get("/api/v1/organiser/reports/custom", headers=auth_headers(organizer))
    assert listed.status_code == 200
    assert any(row["name"] == "Registration health" for row in listed.json()["events"])


@pytest.mark.asyncio
async def test_internal_unrestricted_org_receives_complete_effective_feature_catalogue(
    client: AsyncClient, db: AsyncSession, organization, organizer
):
    organization.is_internal_unrestricted = True
    organization.slug = "eventos"
    db.add(FeatureCatalog(
        key=f"FEAT_ORGANISER_TEST_{uuid.uuid4().hex[:8].upper()}",
        name="Organiser effective feature",
        category="Operations",
        scope_type="ORGANIZATION",
        is_active=True,
    ))
    await db.commit()

    response = await client.get("/api/v1/organiser/entitlements/features", headers=auth_headers(organizer))

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["source"] == "ORGANISER_EFFECTIVE_ENTITLEMENTS"
    assert payload["items"]
    assert all(item["enabled"] is True for item in payload["items"])
    assert all(item["source_type"] == "INTERNAL_UNRESTRICTED" for item in payload["items"])


@pytest.mark.asyncio
async def test_entitlement_history_is_tenant_scoped_and_versioned(
    client: AsyncClient, db: AsyncSession, organization, organizer
):
    other_org = Organization(name="Other entitlement tenant", slug=f"other-ent-{uuid.uuid4().hex[:8]}")
    db.add(other_org)
    await db.flush()
    db.add_all([
        AuditLog(
            organization_id=organization.id,
            actor_user_id=organizer.id,
            action_type="ENTITLEMENT_UPDATED",
            resource_type="entitlement_grant",
            resource_id=uuid.uuid4(),
            new_state={"version": 3},
            occurred_at=datetime.now(timezone.utc),
        ),
        AuditLog(
            organization_id=other_org.id,
            action_type="ENTITLEMENT_UPDATED",
            resource_type="entitlement_grant",
            resource_id=uuid.uuid4(),
            new_state={"version": 8},
            occurred_at=datetime.now(timezone.utc),
        ),
    ])
    await db.commit()

    response = await client.get("/api/v1/organiser/entitlements/history", headers=auth_headers(organizer))

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["source"] == "IMMUTABLE_ENTITLEMENT_AUDIT"
    versions = {item["version"] for item in payload["items"]}
    assert 3 in versions
    assert 8 not in versions


@pytest.mark.asyncio
async def test_archived_event_is_listed_and_restore_is_idempotent(
    client: AsyncClient, db: AsyncSession, organization, organizer, event
):
    await make_owner(db, organization, organizer)
    event.status = "archived"
    event.deleted_at = datetime.now(timezone.utc)
    event.deleted_by = organizer.id
    await db.commit()

    archived = await client.get("/api/v1/organiser/events?status=archived", headers=auth_headers(organizer))
    assert archived.status_code == 200, archived.text
    assert any(item["id"] == str(event.id) for item in archived.json()["items"])

    headers = {
        **auth_headers(organizer),
        "Idempotency-Key": "restore-archived-event-test-key",
        "X-Change-Reason": "Event was archived during lifecycle verification.",
    }
    restored = await client.post(f"/api/v1/organiser/events/{event.id}/restore", headers=headers)
    replay = await client.post(f"/api/v1/organiser/events/{event.id}/restore", headers=headers)

    assert restored.status_code == 200, restored.text
    assert replay.status_code == 200, replay.text
    await db.refresh(event)
    assert event.status == "draft"
    assert event.deleted_at is None
    audits = (await db.scalars(select(AuditLog).where(
        AuditLog.organization_id == organization.id,
        AuditLog.resource_id == event.id,
        AuditLog.action_type == "EVENT_RESTORED",
    ))).all()
    assert len(audits) == 1


@pytest.mark.asyncio
async def test_api_webhook_settings_are_tenant_scoped_with_event_context(
    client: AsyncClient, db: AsyncSession, organization, organizer, event
):
    hook = Webhook(
        event_id=event.id,
        url="https://hooks.example.test/eventos",
        description="Registration updates",
        subscribed_events=["import.completed"],
        status="active",
    )
    db.add(hook)
    await db.commit()

    response = await client.get("/api/v1/organiser/settings/developer", headers=auth_headers(organizer))

    assert response.status_code == 200, response.text
    payload = response.json()
    assert "integrations.webhooks" in payload["source"]
    record = next(item for item in payload["webhooks"] if item["id"] == str(hook.id))
    assert record["event_id"] == str(event.id)
    assert record["event_name"] == event.name
    assert record["manage_href"].startswith(f"/events/{event.id}/settings/integrations")
    assert "secret" not in record
