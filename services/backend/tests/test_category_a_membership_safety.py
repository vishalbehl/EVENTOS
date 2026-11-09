"""Membership isolation and real PostgreSQL transaction ordering, on test tenants."""
import asyncio
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import delete, select

from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.organiser.application.member_commands import OrganizationMemberCommandService
from app.modules.platform.models.organization import Organization
from app.modules.rbac.models.access_foundation import OrganizationAccessRevision
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.services.access_foundation import accepted_member


async def cohort(db):
    org = Organization(name="Membership safety test", slug=f"member-safety-{uuid.uuid4().hex}")
    db.add(org)
    await db.flush()
    users = [User(organization_id=org.id, email=f"{uuid.uuid4().hex}@example.test",
                  first_name="Test", last_name="Owner", role="organiser", is_active=True)
             for _ in range(3)]
    db.add_all(users)
    await db.flush()
    members = [OrganizationMember(organization_id=org.id, user_id=user.id,
               org_role="owner" if i < 2 else "member", accepted_at=datetime.now(timezone.utc))
               for i, user in enumerate(users)]
    db.add_all(members)
    db.add(OrganizationAccessRevision(organization_id=org.id))
    await db.flush()
    return org, users, members


@pytest.mark.asyncio
async def test_suspension_preserves_identity_and_other_tenant(db):
    org, users, members = await cohort(db)
    other = Organization(name="Other test tenant", slug=f"other-safety-{uuid.uuid4().hex}")
    db.add(other)
    await db.flush()
    db.add(OrganizationMember(organization_id=other.id, user_id=users[2].id,
                             org_role="member", accepted_at=datetime.now(timezone.utc)))
    await db.flush()
    revision = await db.get(OrganizationAccessRevision, org.id)
    await OrganizationMemberCommandService(db).update_status(organization_id=org.id,
        member_id=members[2].id, actor=users[0], is_active=False, if_match=1, reason="Suspend test access")
    assert users[2].is_active
    assert revision.revision == 2
    assert (await accepted_member(db, users[2].id, other.id)).is_active
    with pytest.raises(HTTPException) as failure:
        await accepted_member(db, users[2].id, org.id)
    assert failure.value.status_code == 404
    audit = await db.scalar(select(AuditLog).where(AuditLog.organization_id == org.id))
    assert audit.correlation_id and audit.new_state["target_organization_id"] == str(org.id)


@pytest.mark.asyncio
async def test_bulk_suspension_preserves_global_account(db):
    org, users, members = await cohort(db)
    await OrganizationMemberCommandService(db).bulk_update_status(organization_id=org.id,
        members=[(members[2].id, 1)], actor=users[0], is_active=False,
        reason="Bulk test suspension", idempotency_key=uuid.uuid4().hex)
    assert users[2].is_active and not members[2].is_active


@pytest.mark.asyncio
async def test_revoked_admin_cannot_mutate_or_replay(db):
    org, users, members = await cohort(db)
    members[1].org_role = "admin"
    await db.flush()
    key = uuid.uuid4().hex
    await OrganizationMemberCommandService(db).update_role(organization_id=org.id,
        member_id=members[2].id, actor=users[1], org_role="admin", if_match=1,
        reason="Old administrator request", idempotency_key=key)
    await OrganizationMemberCommandService(db).update_status(organization_id=org.id,
        member_id=members[1].id, actor=users[0], is_active=False, if_match=1, reason="Revoke test administrator")
    with pytest.raises(HTTPException) as failure:
        await OrganizationMemberCommandService(db).update_role(organization_id=org.id,
            member_id=members[2].id, actor=users[1], org_role="admin", if_match=1,
            reason="Old administrator request", idempotency_key=key)
    assert failure.value.status_code == 404


@pytest.mark.asyncio
async def test_concurrent_owner_demotion_retains_final_owner(committed_session_factory):
    # Separate committed sessions prove locking. Never select the platform tenant.
    async with committed_session_factory() as db:
        org, users, members = await cohort(db)
        org_id, user_ids, member_ids = org.id, [u.id for u in users], [m.id for m in members]
        await db.commit()
    ready = [asyncio.Event(), asyncio.Event()]
    async def demote(index):
        async with committed_session_factory() as db:
            actor = await db.get(User, user_ids[index])
            # Warm ORM identities before the competing transaction commits.
            warm_member = await db.get(OrganizationMember, member_ids[index])
            assert warm_member.org_role == "owner"
            ready[index].set()
            await ready[1 - index].wait()
            try:
                await OrganizationMemberCommandService(db).update_role(organization_id=org_id,
                    member_id=member_ids[index], actor=actor, org_role="member",
                    if_match=1, reason="Concurrent owner test")
                return 200
            except HTTPException as error:
                return error.status_code
    try:
        outcomes = await asyncio.wait_for(asyncio.gather(demote(0), demote(1)), timeout=15)
        assert sorted(outcomes) == [200, 422]
        async with committed_session_factory() as db:
            owners = (await db.scalars(select(OrganizationMember).where(
                OrganizationMember.organization_id == org_id, OrganizationMember.org_role == "owner",
                OrganizationMember.is_active.is_(True), OrganizationMember.accepted_at.is_not(None)))).all()
            assert len(owners) == 1
            assert (await db.get(OrganizationAccessRevision, org_id)).revision == 2
    finally:
        async with committed_session_factory() as db:
            await db.execute(delete(AuditLog).where(AuditLog.organization_id == org_id))
            await db.execute(delete(OrganizationMember).where(OrganizationMember.organization_id == org_id))
            await db.execute(delete(User).where(User.id.in_(user_ids)))
            await db.execute(delete(OrganizationAccessRevision).where(OrganizationAccessRevision.organization_id == org_id))
            await db.execute(delete(Organization).where(Organization.id == org_id))
            await db.commit()


@pytest.mark.asyncio
async def test_pending_owner_does_not_allow_final_owner_demotion(db):
    org, users, members = await cohort(db)
    members[1].accepted_at = None
    await db.flush()
    with pytest.raises(HTTPException) as failure:
        await OrganizationMemberCommandService(db).update_role(organization_id=org.id,
            member_id=members[0].id, actor=users[0], org_role="admin", if_match=1, reason="Owner safety test")
    assert failure.value.status_code == 422


@pytest.mark.asyncio
async def test_admin_cannot_grant_ownership(db):
    org, users, members = await cohort(db)
    members[1].org_role = "admin"
    await db.flush()
    with pytest.raises(HTTPException) as failure:
        await OrganizationMemberCommandService(db).update_role(organization_id=org.id,
            member_id=members[2].id, actor=users[1], org_role="owner", if_match=1, reason="Escalation test")
    assert failure.value.status_code == 403


@pytest.mark.asyncio
async def test_membership_api_stale_versions_and_compatibility_routes(client, db):
    from app.modules.identity.services.auth_service import create_access_token
    org, users, members = await cohort(db)
    headers = {"Authorization": f"Bearer {create_access_token(users[0])}", "If-Match": "1"}
    target_id = members[2].id
    path = f"/api/v1/organiser/members/{target_id}/role"
    response = await client.patch(path, headers=headers, json={"org_role": "admin", "reason": "API role test"})
    assert response.status_code == 200, response.text
    response = await client.patch(path, headers=headers, json={"org_role": "member", "reason": "Stale API test"})
    assert response.status_code == 412, response.text
    alias = f"/api/v1/organisations/me/members/{target_id}"
    response = await client.put(alias, headers={**headers, "If-Match": "2"},
                               json={"org_role": "member", "reason": "Compatibility test"})
    assert response.status_code == 200, response.text
    response = await client.delete(alias + "?reason=Scoped+suspension", headers={**headers, "If-Match": "3"})
    assert response.status_code == 200, response.text
    await db.refresh(users[2])
    assert users[2].is_active


def test_bulk_limits_and_strict_mutation_inputs():
    from pydantic import ValidationError
    from app.modules.organiser.router import BulkMemberStatusWrite, MemberRoleWrite
    with pytest.raises(ValidationError):
        MemberRoleWrite.model_validate({"org_role": "member", "reason": " a ", "user_id": str(uuid.uuid4())})
    with pytest.raises(ValidationError):
        BulkMemberStatusWrite.model_validate({"members": [{"id": str(uuid.uuid4()), "version": 1}] * 101,
                                              "is_active": False, "reason": "Batch test"})
