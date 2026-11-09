"""Real PostgreSQL discovery, identity projection and fail-closed activation."""
import ast
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
import uuid

from fastapi import HTTPException
import pytest
import pytest_asyncio
from sqlalchemy import delete, func, select, text

from app.modules.platform.models.organization import Organization
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.access_foundation import OperationalWorkspace, WorkspaceRoleBinding, OrganizationAccessRevision
from app.modules.rbac.services.access_contexts import available_contexts, verify_direct_context


@pytest_asyncio.fixture
async def organizer(organizer, db):
    """Discovery subjects begin without an accepted home-tenant membership."""
    home = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.user_id == organizer.id,
        OrganizationMember.organization_id == organizer.organization_id,
    ))
    home.accepted_at = None
    await db.flush()
    return organizer


async def membership(db, user, *, accepted=True, active=True):
    org = Organization(name="Separate context test", slug=f"context-test-{uuid.uuid4().hex}")
    db.add(org); await db.flush()
    member = OrganizationMember(organization_id=org.id, user_id=user.id, org_role="member", is_active=active,
                                accepted_at=datetime.now(timezone.utc) if accepted else None)
    db.add(member); await db.flush()
    return org, member


@pytest.mark.asyncio
async def test_machine_and_support_audiences_cannot_enumerate_portfolios():
    from app.modules.rbac.routers.access_foundation import browser_context_audience
    await browser_context_audience(SimpleNamespace(role="organiser", amr=("pwd",), impersonator_id=None))
    for token in (SimpleNamespace(role="developer", amr=("pwd",), impersonator_id=None),
                  SimpleNamespace(role="organiser", amr=("api_key",), impersonator_id=None),
                  SimpleNamespace(role="organiser", amr=("pwd",), impersonator_id=uuid.uuid4())):
        with pytest.raises(HTTPException) as denied:
            await browser_context_audience(token)
        assert denied.value.status_code == 403


@pytest.mark.asyncio
async def test_contexts_are_accepted_active_only_and_keyset_paginated(db, organizer, performance_metrics):
    first, _ = await membership(db, organizer)
    second, _ = await membership(db, organizer)
    pending, _ = await membership(db, organizer, accepted=False)
    revoked, _ = await membership(db, organizer, active=False)
    suspended, _ = await membership(db, organizer)
    suspended.suspended_at = datetime.now(timezone.utc)
    platform_only, _ = await membership(db, organizer)
    platform_only.is_platform_org = True
    await db.flush()
    before = performance_metrics()[0]
    page = await available_contexts(db, organizer, limit=1)
    assert performance_metrics()[0] - before == 3  # One business query plus two identity-setting statements.
    next_page = await available_contexts(db, organizer, after=page["next_cursor"], limit=1)
    assert {item["organization_id"] for item in page["items"] + next_page["items"]} == {first.id, second.id}
    assert next_page["next_cursor"] is None
    assert page["delegation_available"] and not page["items"][0]["activation_available"]
    assert await db.scalar(text("SELECT current_setting('app.access_discovery_user_id', true)")) == ""
    for org in (pending, revoked, suspended, platform_only):
        with pytest.raises(HTTPException) as denied:
            await verify_direct_context(db, organizer, org.id)
        assert denied.value.status_code == 404


@pytest.mark.asyncio
async def test_workspace_scope_foreign_ids_and_archives(db, organizer):
    org, member = await membership(db, organizer)
    allowed = OperationalWorkspace(organization_id=org.id, name="Assigned")
    private = OperationalWorkspace(organization_id=org.id, name="Not assigned")
    db.add_all([allowed, private]); await db.flush()
    db.add(WorkspaceRoleBinding(organization_id=org.id, member_id=member.id, workspace_id=allowed.id, role="viewer"))
    await db.flush()
    await verify_direct_context(db, organizer, org.id, allowed.id)
    for selected in (private.id, uuid.uuid4()):
        with pytest.raises(HTTPException) as denied:
            await verify_direct_context(db, organizer, org.id, selected)
        assert denied.value.status_code == 404
    allowed.status = "ARCHIVED"; await db.flush()
    with pytest.raises(HTTPException) as archived:
        await verify_direct_context(db, organizer, org.id, allowed.id)
    assert archived.value.status_code == 404


@pytest.mark.asyncio
async def test_context_policy_restricted_runtime_role(db, organizer):
    org, _ = await membership(db, organizer)
    actor = SimpleNamespace(id=organizer.id, organization_id=organizer.organization_id)
    role = "context_rls_" + uuid.uuid4().hex
    await db.execute(text(f'CREATE ROLE "{role}" NOSUPERUSER NOBYPASSRLS NOLOGIN'))
    await db.execute(text(f'GRANT USAGE ON SCHEMA organizer_access, platform TO "{role}"'))
    await db.execute(text(f'GRANT SELECT ON organizer_access.organization_members, platform.organizations, '
        f'organizer_access.emc_client_delegations, organizer_access.emc_client_relationships, '
        f'organizer_access.operational_workspaces TO "{role}"'))
    await db.execute(text("ALTER TABLE organizer_access.organization_members ENABLE ROW LEVEL SECURITY"))
    await db.execute(text("ALTER TABLE organizer_access.organization_members FORCE ROW LEVEL SECURITY"))
    for migration in ("20261006_3220_access_discovery.py", "20261008_3440_session_access_context.py"):
        source = Path(__file__).parents[1] / "alembic/versions" / migration
        for node in ast.walk(ast.parse(source.read_text())):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "execute" and node.args:
                value = node.args[0]
                if isinstance(value, ast.Constant) and isinstance(value.value, str) and "CREATE POLICY" in value.value:
                    await db.execute(text(value.value))
    await db.execute(text(f'SET LOCAL ROLE "{role}"'))
    try:
        assert await db.scalar(select(func.count()).select_from(OrganizationMember.__table__)) == 0
        page = await available_contexts(db, actor)
        assert [row["organization_id"] for row in page["items"]] == [org.id]
        assert await db.scalar(select(func.count()).select_from(OrganizationMember.__table__)) == 0
        foreign = SimpleNamespace(id=uuid.uuid4(), organization_id=actor.organization_id)
        assert (await available_contexts(db, foreign))["items"] == []
    finally:
        await db.execute(text("RESET ROLE"))


@pytest.mark.asyncio
async def test_api_does_not_activate_unverified_context(client, db, organizer):
    from app.modules.identity.services.auth_service import create_access_token
    org, member = await membership(db, organizer)
    db.add(OrganizationAccessRevision(organization_id=org.id, revision=1))
    allowed = OperationalWorkspace(organization_id=org.id, name="API assigned workspace")
    private = OperationalWorkspace(organization_id=org.id, name="API private workspace")
    db.add_all([allowed, private]); await db.flush()
    db.add(WorkspaceRoleBinding(organization_id=org.id, workspace_id=allowed.id, member_id=member.id, role="viewer"))
    await db.flush()
    headers = {"Authorization": f"Bearer {create_access_token(organizer)}"}
    from app.config import settings
    from jose import jwt
    claims = jwt.decode(headers["Authorization"][7:], settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    claims["amr"] = ["api_key"]
    machine_token = jwt.encode(claims, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    machine = await client.get("/api/v1/access/contexts", headers={"Authorization": f"Bearer {machine_token}"})
    assert machine.status_code == 403 and machine.json()["detail"]["code"] == "CONTEXT_AUDIENCE_DENIED"
    page = await client.get("/api/v1/access/contexts", headers=headers)
    assert page.status_code == 200 and page.headers["cache-control"] == "no-store"
    assert len(page.json()["items"]) == 1
    workspaces = await client.get(f"/api/v1/organizations/{org.id}/workspaces", headers=headers)
    assert workspaces.status_code == 200 and workspaces.headers["cache-control"] == "no-store"
    assert [row["id"] for row in workspaces.json()["items"]] == [str(allowed.id)]
    assert (await client.get(f"/api/v1/organizations/{uuid.uuid4()}/workspaces", headers=headers)).status_code == 404
    assert (await client.get("/api/v1/access/contexts?limit=101", headers=headers)).status_code == 422
    foreign = await client.post("/api/v1/access/context", json={"organization_id": str(uuid.uuid4())}, headers=headers)
    assert foreign.status_code == 404
    selected = await client.post("/api/v1/access/context", json={"organization_id": str(org.id)}, headers=headers)
    assert selected.status_code == 503 and selected.json()["detail"]["code"] == "CONTEXT_ACTIVATION_UNAVAILABLE"
    assert selected.headers["x-correlation-id"] == selected.json()["detail"]["correlation_id"]
    assert "access_token" not in selected.json()
    assert organizer.organization_id != org.id


@pytest.mark.asyncio
async def test_direct_request_scope_restores_home_and_rechecks_revocation(db, organizer):
    from app.core.tenant_context import tenant_org_id
    from app.modules.rbac.services.access_contexts import direct_request_context
    org, member = await membership(db, organizer)
    db.add(OrganizationAccessRevision(organization_id=org.id, revision=7)); await db.flush()
    home = organizer.organization_id
    previous = tenant_org_id.set(home)
    try:
        async with direct_request_context(db, organizer, org.id) as context:
            assert tenant_org_id.get() == org.id
            assert context.actor_id == organizer.id and context.organization_id == org.id
            assert context.policy_revision == 7 and "workspace:create" not in context.actions
            assert organizer.organization_id == home
        assert tenant_org_id.get() == home
        member.is_active = False; await db.flush()
        with pytest.raises(HTTPException) as revoked:
            async with direct_request_context(db, organizer, org.id, write=True):
                pytest.fail("Revoked access must not establish a scope")
        assert revoked.value.status_code == 404
        assert tenant_org_id.get() == home
    finally:
        tenant_org_id.reset(previous)


@pytest.mark.asyncio
async def test_request_selector_validation_marker_expires_at_transaction_end(
    db, organizer, monkeypatch
):
    from app.modules.rbac.services import access_contexts

    org, _ = await membership(db, organizer)
    db.add(OrganizationAccessRevision(organization_id=org.id, revision=1))
    await db.flush()
    selector = SimpleNamespace(
        organization_id=organizer.organization_id,
        access_mode="DIRECT",
        active_organization_id=org.id,
        acting_organization_id=org.id,
        active_workspace_id=None,
        active_event_id=None,
        relationship_id=None,
    )
    validations = 0

    async def count_validation(*args, **kwargs):
        nonlocal validations
        validations += 1

    monkeypatch.setattr(
        access_contexts,
        "validate_request_selector",
        count_validation,
    )
    db.info.update(
        customer_request_identity=organizer.id,
        customer_request_selector=selector,
        customer_request_selector_validated=(selector, db.get_transaction()),
    )
    try:
        async with access_contexts.actor_request_context(
            db, organizer.id, org.id
        ):
            pass
        assert validations == 0

        await db.commit()

        async with access_contexts.actor_request_context(
            db, organizer.id, org.id
        ):
            pass
        assert validations == 1
    finally:
        db.info.pop("customer_request_identity", None)
        db.info.pop("customer_request_selector", None)
        db.info.pop("customer_request_selector_validated", None)


@pytest.mark.asyncio
async def test_cross_organization_workspace_commands_keep_identity_home(client, db, organizer):
    from app.modules.identity.services.auth_service import create_access_token
    org, member = await membership(db, organizer)
    member.org_role = "admin"
    db.add(OrganizationAccessRevision(organization_id=org.id, revision=1)); await db.flush()
    home = organizer.organization_id
    headers = {"Authorization": f"Bearer {create_access_token(organizer)}", "Idempotency-Key": uuid.uuid4().hex}
    bootstrap = await client.get(f"/api/v1/access/bootstrap?organization_id={org.id}", headers=headers)
    assert bootstrap.status_code == 200 and bootstrap.headers["cache-control"] == "no-store"
    assert bootstrap.json()["organization_id"] == str(org.id)
    assert "workspace:create" in bootstrap.json()["actions"]
    foreign = await client.get(f"/api/v1/access/bootstrap?organization_id={uuid.uuid4()}", headers=headers)
    assert foreign.status_code == 404
    payload = {"name": "Separate operational scope", "reason": "Scoped administration test"}
    created = await client.post(f"/api/v1/organizations/{org.id}/workspaces", headers=headers, json=payload)
    assert created.status_code == 200, created.text
    row = created.json()
    assert row["organization_id"] == str(org.id) and organizer.organization_id == home
    replay = await client.post(f"/api/v1/organizations/{org.id}/workspaces", headers=headers, json=payload)
    assert replay.status_code == 200 and replay.json()["id"] == row["id"]
    member.is_active = False; await db.flush()
    denied = await client.post(f"/api/v1/organizations/{org.id}/workspaces", headers=headers, json=payload)
    assert denied.status_code == 404  # Replays also require current authority.
    assert organizer.organization_id == home


@pytest.mark.asyncio
async def test_waiting_request_denied_after_committed_revocation(committed_session_factory):
    from app.modules.identity.models.user import User
    from app.modules.rbac.services.access_foundation import lock_revision
    from app.modules.rbac.services.access_contexts import direct_request_context
    async with committed_session_factory() as db:
        org = Organization(name="Revocation ordering test", slug=f"context-race-{uuid.uuid4().hex}")
        db.add(org); await db.flush()
        user = User(organization_id=org.id, email=f"{uuid.uuid4().hex}@example.test",
                    first_name="Test", last_name="Actor", role="organiser", is_active=True)
        db.add(user); await db.flush()
        member = OrganizationMember(organization_id=org.id, user_id=user.id, org_role="admin",
                                    accepted_at=datetime.now(timezone.utc))
        db.add_all([member, OrganizationAccessRevision(organization_id=org.id, revision=1)])
        await db.flush()
        org_id, user_id, member_id = org.id, user.id, member.id
        await db.commit()
    request_task = None
    try:
        async with committed_session_factory() as revoker, committed_session_factory() as requester:
            # Warm ORM state before revocation: a stale identity map is not authority.
            warm = await requester.get(OrganizationMember, member_id)
            assert warm.is_active
            request_pid = await requester.scalar(text("SELECT pg_backend_pid()"))
            revision = await lock_revision(revoker, org_id, write=True)
            target = await revoker.get(OrganizationMember, member_id)
            target.is_active = False
            target.version += 1
            revision.revision += 1
            await revoker.flush()

            async def waiting_request():
                actor = SimpleNamespace(id=user_id, organization_id=org_id)
                try:
                    async with direct_request_context(requester, actor, org_id, write=True):
                        pytest.fail("A request ordered after revocation must be denied")
                except HTTPException as error:
                    return error.status_code

            request_task = asyncio.create_task(waiting_request())
            # Observe the actual PostgreSQL lock wait, rather than timing a sleep
            # and assuming the request performed discovery before revocation.
            async def observe_wait():
                while not await revoker.scalar(text("SELECT cardinality(pg_blocking_pids(:pid)) > 0"), {"pid": request_pid}):
                    if request_task.done():
                        pytest.fail("Request did not wait on the revocation transaction")
                    await asyncio.sleep(0.02)
            await asyncio.wait_for(observe_wait(), timeout=10)
            await revoker.commit()
            assert await asyncio.wait_for(request_task, timeout=10) == 404
            assert warm.is_active  # Stale ORM state existed but did not grant authority.
    finally:
        if request_task is not None and not request_task.done():
            request_task.cancel()
            await asyncio.gather(request_task, return_exceptions=True)
        async with committed_session_factory() as db:
            await db.execute(delete(OrganizationMember).where(OrganizationMember.id == member_id))
            await db.execute(delete(User).where(User.id == user_id))
            await db.execute(delete(OrganizationAccessRevision).where(OrganizationAccessRevision.organization_id == org_id))
            await db.execute(delete(Organization).where(Organization.id == org_id))
            await db.commit()
