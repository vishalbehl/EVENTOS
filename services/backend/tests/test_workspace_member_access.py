"""Workspace grants against real PostgreSQL, on isolated test tenants."""
from datetime import datetime, timezone
import asyncio
from types import SimpleNamespace
import uuid

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.access_foundation import OperationalWorkspace, OrganizationAccessRevision, WorkspaceRoleBinding
from app.modules.rbac.services.access_contexts import verify_direct_context
from app.modules.rbac.services.workspace_members import member_page, save_binding


async def setup_workspace(db, organizer, organization):
    owner = await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == organizer.id))
    owner.org_role = "owner"; owner.accepted_at = datetime.now(timezone.utc)
    workspace = OperationalWorkspace(organization_id=organization.id, name="Separate access test")
    db.add(workspace)
    assert await db.get(OrganizationAccessRevision, organization.id) is not None
    other = Organization(name="Identity home test", slug=f"workspace-subject-{uuid.uuid4().hex}")
    db.add(other); await db.flush()
    subject = User(organization_id=other.id, email=f"{uuid.uuid4().hex}@example.test",
                   first_name="Accepted", last_name="Member", role="organiser", is_active=True)
    db.add(subject); await db.flush()
    member = OrganizationMember(organization_id=organization.id, user_id=subject.id, org_role="member", accepted_at=datetime.now(timezone.utc))
    db.add(member); await db.flush()
    return workspace, subject, member


@pytest.mark.asyncio
async def test_workspace_member_api_persists_revokes_and_resists_replays(client, db, organizer, organization):
    from app.modules.identity.services.auth_service import create_access_token
    workspace, subject, member = await setup_workspace(db, organizer, organization)
    route = f"/api/v1/organizations/{organization.id}/workspaces/{workspace.id}/members"
    token_headers = {"Authorization": f"Bearer {create_access_token(organizer)}"}
    page = await client.get(route, headers=token_headers)
    assert page.status_code == 200 and page.headers["cache-control"] == "no-store"
    assert next(row for row in page.json()["items"] if row["member_id"] == str(member.id))["version"] == 0
    headers = {**token_headers, "Idempotency-Key": uuid.uuid4().hex, "If-Match": "0"}
    payload = {"role": "viewer", "reason": "Approve workspace viewing"}
    first = await client.put(f"{route}/{member.id}", headers=headers, json=payload)
    assert first.status_code == 200, first.text
    assert first.json()["version"] == 1
    binding = await db.scalar(select(WorkspaceRoleBinding).where(WorkspaceRoleBinding.member_id == member.id))
    binding_id = binding.id
    actor = SimpleNamespace(id=subject.id, organization_id=subject.organization_id)
    await verify_direct_context(db, actor, organization.id, workspace.id)
    replay = await client.put(f"{route}/{member.id}", headers=headers, json=payload)
    assert replay.status_code == 200 and replay.json() == first.json()
    conflict = await client.put(f"{route}/{member.id}", headers=headers, json={**payload, "role": "admin"})
    assert conflict.status_code == 409
    stale = await client.put(f"{route}/{member.id}", headers={**headers, "Idempotency-Key": uuid.uuid4().hex}, json=payload)
    assert stale.status_code == 412
    revoke = await client.put(f"{route}/{member.id}", headers={**headers, "If-Match": "1", "Idempotency-Key": uuid.uuid4().hex},
                              json={"role": None, "reason": "Revoke workspace assignment"})
    assert revoke.status_code == 200 and revoke.json()["version"] == 2
    with pytest.raises(HTTPException) as denied:
        await verify_direct_context(db, actor, organization.id, workspace.id)
    assert denied.value.status_code == 404
    # Binding is retained, so pre-revocation versions cannot recreate it (ABA).
    fresh = await client.get(route, headers=token_headers)
    row = next(row for row in fresh.json()["items"] if row["member_id"] == str(member.id))
    assert row["role"] is None and row["version"] == 2
    grant = await client.put(f"{route}/{member.id}", headers={**headers, "If-Match": "2", "Idempotency-Key": uuid.uuid4().hex}, json=payload)
    assert grant.status_code == 200 and grant.json()["version"] == 3
    await db.refresh(binding)
    assert binding.id == binding_id and binding.is_active
    assert await db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.organization_id == organization.id,
                            AuditLog.action_type == "WORKSPACE_MEMBER_CHANGED")) == 3


@pytest.mark.asyncio
async def test_workspace_member_scope_and_accepted_identity(db, organizer, organization, performance_metrics):
    workspace, subject, member = await setup_workspace(db, organizer, organization)
    before = performance_metrics()[0]
    page = await member_page(db, organizer, organization.id, workspace.id, limit=1)
    query_count = performance_metrics()[0] - before
    assert len(page["items"]) == 1 and page["next_cursor"]
    before = performance_metrics()[0]
    complete = await member_page(db, organizer, organization.id, workspace.id, limit=100)
    assert performance_metrics()[0] - before == query_count  # No per-row identity queries.
    assert len(complete["items"]) == 2
    member.accepted_at = None; await db.flush()
    assert len((await member_page(db, organizer, organization.id, workspace.id))["items"]) == 1
    for member_id in (member.id, uuid.uuid4()):
        with pytest.raises(HTTPException) as denied:
            await save_binding(db, organizer, organization.id, workspace.id, member_id,
                role="viewer", reason="Rejected pending grant", expected=0, key=uuid.uuid4().hex)
        assert denied.value.status_code == 404
    with pytest.raises(HTTPException) as foreign:
        await member_page(db, organizer, organization.id, uuid.uuid4())
    assert foreign.value.status_code == 404
    owner = await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == organizer.id))
    owner.org_role = "member"; await db.flush()
    with pytest.raises(HTTPException) as member_denied:
        await member_page(db, organizer, organization.id, workspace.id)
    assert member_denied.value.status_code == 403


@pytest.mark.asyncio
async def test_workspace_binding_ownership_constraint(db, organizer, organization):
    workspace, subject, member = await setup_workspace(db, organizer, organization)
    foreign = OrganizationMember(organization_id=subject.organization_id, user_id=subject.id, org_role="member",
                                 accepted_at=datetime.now(timezone.utc))
    db.add(foreign); await db.flush()
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(WorkspaceRoleBinding(organization_id=organization.id, workspace_id=workspace.id, member_id=foreign.id, role="viewer"))
            await db.flush()


def test_workspace_grant_input_rejects_privilege_fields_and_empty_reason():
    from app.modules.rbac.routers.access_foundation import WorkspaceMemberWrite
    for payload in ({"role": "owner", "reason": "No ownership grants"},
                    {"role": "viewer", "reason": " a "},
                    {"role": "viewer", "reason": "Valid reason", "name": None},
                    {"role": "viewer", "reason": "Valid reason", "organization_id": str(uuid.uuid4())}):
        with pytest.raises(ValidationError):
            WorkspaceMemberWrite.model_validate(payload)


@pytest.mark.asyncio
async def test_concurrent_workspace_grants_require_fresh_version(committed_session_factory):
    from app.modules.platform.models.idempotency import IdempotencyRecord
    async with committed_session_factory() as db:
        org = Organization(name="Grant concurrency test", slug=f"binding-race-{uuid.uuid4().hex}")
        db.add(org); await db.flush()
        actor = User(organization_id=org.id, email=f"{uuid.uuid4().hex}@example.test", first_name="Test", last_name="Owner",
                     role="organiser", is_active=True)
        db.add(actor); await db.flush()
        owner = OrganizationMember(organization_id=org.id, user_id=actor.id, org_role="owner", accepted_at=datetime.now(timezone.utc))
        subject = User(organization_id=org.id, email=f"{uuid.uuid4().hex}@example.test", first_name="Test", last_name="Member",
                       role="organiser", is_active=True)
        db.add_all([owner, subject]); await db.flush()
        target = OrganizationMember(organization_id=org.id, user_id=subject.id, org_role="member", accepted_at=datetime.now(timezone.utc))
        workspace = OperationalWorkspace(organization_id=org.id, name="Concurrent grant target")
        db.add_all([target, workspace, OrganizationAccessRevision(organization_id=org.id)])
        await db.flush()
        org_id, actor_id, target_id, workspace_id = org.id, actor.id, target.id, workspace.id
        user_ids = [actor.id, subject.id]
        await db.commit()
    ready = [asyncio.Event(), asyncio.Event()]
    async def grant(index):
        async with committed_session_factory() as db:
            actor = await db.get(User, actor_id)
            ready[index].set(); await ready[1-index].wait()
            try:
                await save_binding(db, actor, org_id, workspace_id, target_id,
                    role="viewer" if index == 0 else "member", reason="Concurrent grant test", expected=0, key=uuid.uuid4().hex)
                return 200
            except HTTPException as failure:
                await db.rollback()
                return failure.status_code
    try:
        assert sorted(await asyncio.wait_for(asyncio.gather(grant(0), grant(1)), timeout=15)) == [200, 412]
        async with committed_session_factory() as db:
            assert await db.scalar(select(func.count()).select_from(WorkspaceRoleBinding).where(WorkspaceRoleBinding.workspace_id == workspace_id)) == 1
            assert (await db.get(OrganizationAccessRevision, org_id)).revision == 2
    finally:
        async with committed_session_factory() as db:
            for model in (IdempotencyRecord, AuditLog, WorkspaceRoleBinding, OperationalWorkspace, OrganizationMember, OrganizationAccessRevision):
                await db.execute(delete(model).where(model.organization_id == org_id))
            await db.execute(delete(User).where(User.id.in_(user_ids)))
            await db.execute(delete(Organization).where(Organization.id == org_id))
            await db.commit()
