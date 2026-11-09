"""Real PostgreSQL/Redis checks; no mocked admission or database failures."""
import asyncio
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select

from app.core.distributed_rate_limit import Budget, admit
from app.middleware.access_body_limit import AccessBodyLimitMiddleware
from app.modules.rbac.models.access_foundation import OperationalWorkspace, OrganizationAccessRevision
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.services.access_foundation import accepted_member, mutate_workspace, list_workspaces
from app.modules.rbac.services.permission_service import get_user_permissions, resolve_overrides
from app.modules.platform.models.organization import Organization


def test_denial_wins_and_wildcard_never_grants():
    assert resolve_overrides({"*", "read"}, [("write", True), ("write", False)]) == {"read"}


def test_release_gate_fails_without_production_evidence():
    from ops.category_a_release_gate import validate_evidence
    assert validate_evidence(None)


def test_workspace_inputs_reject_non_text_and_short_trimmed_reason():
    from pydantic import ValidationError
    from app.modules.rbac.routers.access_foundation import WorkspaceWrite
    for payload in ({"name": {}, "reason": "normal reason"}, {"name": "Good", "reason": " a "}):
        with pytest.raises(ValidationError):
            WorkspaceWrite.model_validate(payload)


@pytest.mark.parametrize("capacity,window,burst", [(0, 60, 1), (1, 0, 1), (1, 60, 2)])
def test_invalid_rate_policy_rejected(capacity, window, burst):
    with pytest.raises(ValueError):
        Budget("test", capacity, window, burst)


@pytest.mark.asyncio
async def test_redis_concurrent_admission_and_no_partial_consumption():
    prefix = f"test:category-a:{uuid.uuid4().hex}"
    # A long refill interval prevents a second token becoming available during
    # this short concurrency probe. Redis TIME, not process clocks, decides.
    tight = Budget(prefix + ":tight", 7, 86400, 7)
    ample = Budget(prefix + ":ample", 100, 86400, 100)
    from redis.asyncio import Redis
    from app.config import settings
    replicas = [Redis.from_url(settings.redis_lock_url, socket_connect_timeout=10, max_connections=8) for _ in range(2)]
    slots = [asyncio.Semaphore(8), asyncio.Semaphore(8)]

    async def request(index, budgets):
        replica = index % 2
        async with slots[replica]:
            return await admit(budgets, replicas[replica])

    try:
        results = await asyncio.gather(*(request(i, [tight, ample]) for i in range(80)))
        assert sum(result.allowed for result in results) == 7
        # Failed all-bucket checks must not spend the larger budget.
        results = await asyncio.gather(*(request(i, [ample]) for i in range(100)))
        assert sum(result.allowed for result in results) == 93
        assert 0 < await replicas[0].ttl(tight.key) <= 86401
        assert await replicas[0].hlen(tight.key) == 2
    finally:
        await replicas[0].delete(tight.key, ample.key)
        await asyncio.gather(*(client.aclose() for client in replicas))


@pytest.mark.asyncio
async def test_chunked_body_rejected_before_parser():
    dispatched = False
    messages = iter([
        {"type": "http.request", "body": b"x" * 10000, "more_body": True},
        {"type": "http.request", "body": b"x" * 10000, "more_body": False},
    ])
    outputs = []

    async def inner(scope, receive, send):
        nonlocal dispatched
        dispatched = True

    async def receive():
        return next(messages)

    async def send(message):
        outputs.append(message)

    await AccessBodyLimitMiddleware(inner)({"type": "http", "path": "/api/v1/auth/login", "headers": []}, receive, send)
    assert not dispatched
    assert outputs[0]["status"] == 413


@pytest.mark.asyncio
async def test_invited_and_platform_labels_do_not_manufacture_membership(db, organizer, organization):
    organizer.role = "super_admin"
    member = await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == organizer.id))
    member.org_role = "owner"
    member.accepted_at = None
    await db.flush()
    with pytest.raises(HTTPException) as failure:
        await accepted_member(db, organizer.id, organization.id)
    assert failure.value.status_code == 404
    assert await get_user_permissions(db, organizer.id) == []


@pytest.mark.asyncio
async def test_workspace_versions_and_scoped_visibility(db, organizer, organization):
    member = await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == organizer.id))
    member.org_role = "owner"
    member.accepted_at = datetime.now(timezone.utc)
    assert await db.get(OrganizationAccessRevision, organization.id) is not None
    await db.flush()
    workspace = await mutate_workspace(db, organizer, organization.id, name="Operations", reason="New team")
    assert workspace.version == 1
    rows, cursor = await list_workspaces(db, organizer, organization.id, None, 50)
    assert [row.id for row in rows] == [workspace.id]
    assert cursor is None
    await mutate_workspace(db, organizer, organization.id, workspace_id=workspace.id,
        name="Operations west", expected=1, reason="Rename team")
    with pytest.raises(HTTPException) as failure:
        await mutate_workspace(db, organizer, organization.id, workspace_id=workspace.id,
            name="Stale change", expected=1, reason="Stale retry")
    assert failure.value.status_code == 412
    member.org_role = "member"
    await db.flush()
    rows, _ = await list_workspaces(db, organizer, organization.id, None, 50)
    assert rows == []  # No binding means no inferred workspace authority.


@pytest.mark.asyncio
async def test_database_rejects_cross_organization_workspace(db, event):
    other = Organization(name="Other", slug=f"other-{uuid.uuid4().hex}")
    db.add(other)
    await db.flush()
    workspace = OperationalWorkspace(organization_id=other.id, name="Other operations")
    db.add(workspace)
    await db.flush()
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            event.operational_workspace_id = workspace.id
            await db.flush()


@pytest.mark.asyncio
async def test_authenticated_workspace_api_persistence_replay_and_conflicts(client, db, organizer, organization):
    from app.modules.identity.services.auth_service import create_access_token
    member = await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == organizer.id))
    member.org_role = "owner"
    member.accepted_at = datetime.now(timezone.utc)
    assert await db.get(OrganizationAccessRevision, organization.id) is not None
    await db.flush()
    token = create_access_token(organizer)
    headers = {"Authorization": f"Bearer {token}", "Idempotency-Key": uuid.uuid4().hex}
    route = f"/api/v1/organizations/{organization.id}/workspaces"
    payload = {"name": "Production operations", "reason": "Create team scope"}
    first = await client.post(route, json=payload, headers=headers)
    assert first.status_code == 200, first.text
    record = first.json()
    replay = await client.post(route, json=payload, headers=headers)
    assert replay.status_code == 200
    assert replay.json() == record
    changed = await client.post(route, json={**payload, "name": "Changed payload"}, headers=headers)
    assert changed.status_code == 409
    await db.rollback()
    assert await db.scalar(select(OperationalWorkspace.id).where(OperationalWorkspace.id == uuid.UUID(record["id"])))
    listed = await client.get(route, headers=headers)
    assert listed.status_code == 200
    assert any(row["id"] == record["id"] for row in listed.json()["items"])
    bootstrap = await client.get("/api/v1/access/bootstrap", headers=headers)
    assert bootstrap.status_code == 200
    assert bootstrap.headers["cache-control"] == "no-store"
    mutation = {"name": "Renamed", "reason": "Rename operations"}
    path = route + "/" + record["id"]
    fresh_headers = {**headers, "Idempotency-Key": uuid.uuid4().hex}
    missing = await client.patch(path, json=mutation, headers=fresh_headers)
    assert missing.status_code == 428
    saved = await client.patch(path, json=mutation, headers={**fresh_headers, "If-Match": "1"})
    assert saved.status_code == 200, saved.text
    stale = await client.patch(path, json=mutation, headers={**headers, "Idempotency-Key": uuid.uuid4().hex, "If-Match": "1"})
    assert stale.status_code == 412
