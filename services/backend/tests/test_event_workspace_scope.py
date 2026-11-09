"""Real PostgreSQL event-container scope and action-permission separation."""
from datetime import datetime, timezone, date
from types import SimpleNamespace
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.modules.identity.models.user import User
from app.modules.events.models.event import Event
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.access_foundation import OperationalWorkspace, WorkspaceRoleBinding, OrganizationAccessRevision
from app.modules.rbac.models.rbac import UserAccessNode, Permission, ScopedPermission
from app.modules.rbac.services.event_scope import customer_event, visible_event_predicate
from app.modules.rbac.services.permission_service import get_user_permissions
from app.modules.rbac.services.permission_catalogue import READ_ACTIONS
from app.modules.events.application.queries import EventQueryService
from app.modules.organiser.application.queries import OrganiserEventQueryService


async def cohort(db, organizer, organization):
    actor = User(organization_id=organization.id, email=f"{uuid.uuid4().hex}@example.test",
                 first_name="Test", last_name="Member", role="organiser", is_active=True)
    db.add(actor); await db.flush()
    member = OrganizationMember(organization_id=organization.id, user_id=actor.id, org_role="member",
                                accepted_at=datetime.now(timezone.utc))
    assigned = OperationalWorkspace(organization_id=organization.id, name="Assigned workspace")
    private = OperationalWorkspace(organization_id=organization.id, name="Private workspace")
    db.add_all([member, assigned, private])
    assert await db.get(OrganizationAccessRevision, organization.id) is not None
    await db.flush()
    events = [Event(organization_id=organization.id, created_by=organizer.id, name=name,
                    short_code=uuid.uuid4().hex[:8].upper(), start_date=date(2026, 10, 7), end_date=date(2026, 10, 8),
                    timezone="UTC", status="draft", operational_workspace_id=workspace.id)
              for name, workspace in (("Allowed one", assigned), ("Allowed two", assigned), ("Hidden event", private))]
    db.add_all(events); await db.flush()
    return actor, member, assigned, events


@pytest.mark.asyncio
async def test_global_role_labels_do_not_grant_event_containers(db, organizer, organization):
    actor, member, workspace, events = await cohort(db, organizer, organization)
    for label in ("organiser", "admin", "super_admin", "system_admin"):
        identity = SimpleNamespace(id=actor.id, organization_id=organization.id, role=label)
        with pytest.raises(HTTPException) as denied:
            await customer_event(db, identity, events[0].id)
        assert denied.value.status_code == 404
    member.org_role = "owner"; await db.flush()
    assert (await customer_event(db, actor, events[2].id)).id == events[2].id
    member.is_active = False; await db.flush()
    with pytest.raises(HTTPException) as suspended:
        await customer_event(db, actor, events[2].id)
    assert suspended.value.status_code == 404


@pytest.mark.asyncio
async def test_filter_before_limit_counts_and_revocation(db, organizer, organization, performance_metrics):
    actor, member, workspace, events = await cohort(db, organizer, organization)
    binding = WorkspaceRoleBinding(organization_id=organization.id, workspace_id=workspace.id, member_id=member.id, role="viewer")
    db.add(binding); await db.flush()
    predicate = visible_event_predicate(actor.id, organization.id)
    allowed_ids = select(Event.id).where(predicate)
    before = performance_metrics()[0]
    page = await EventQueryService(db).list_offset(organization_id=organization.id, page_size=1, allowed_event_ids=allowed_ids)
    small_count = performance_metrics()[0] - before
    before = performance_metrics()[0]
    all_rows = await EventQueryService(db).list_offset(organization_id=organization.id, page_size=100, allowed_event_ids=allowed_ids)
    assert performance_metrics()[0] - before == small_count
    assert len(page) == 1 and {row.id for row in all_rows} == {events[0].id, events[1].id}
    rows, total, summary = await OrganiserEventQueryService(db).list_events(organization_id=organization.id,
        status_filter=None, search=None, year=None, page=1, page_size=1, today=date(2026, 10, 7), access_predicate=predicate)
    assert len(rows) == 1 and total == 2 and summary["total"] == 2 and summary["draft"] == 2
    assert (await customer_event(db, actor, events[0].id)).id == events[0].id
    # The bounded workspace viewer role deliberately grants read-only actions
    # to descendants owned by that workspace, and nothing outside it.
    assert await get_user_permissions(db, actor.id, events[0].id, organization.id) == sorted(READ_ACTIONS)
    binding.is_active = False; await db.flush()
    assert await db.scalar(select(Event.id).where(Event.id == events[0].id, predicate)) is None
    with pytest.raises(HTTPException) as revoked:
        await customer_event(db, actor, events[0].id)
    assert revoked.value.status_code == 404
    db.add(UserAccessNode(user_id=actor.id, node_type="EVENT", node_id=events[0].id, permissions={}))
    await db.flush()
    assert (await customer_event(db, actor, events[0].id)).id == events[0].id  # Independent event-scoped assignment retained.
    with pytest.raises(HTTPException):
        await customer_event(db, actor, events[2].id)


@pytest.mark.asyncio
async def test_permission_endpoint_and_lists_use_customer_scope(client, db, organizer, organization):
    from app.modules.identity.services.auth_service import create_access_token
    actor, member, workspace, events = await cohort(db, organizer, organization)
    db.add(WorkspaceRoleBinding(organization_id=organization.id, workspace_id=workspace.id, member_id=member.id, role="viewer"))
    permission = Permission(code="EVENTS:VIEW", name="View events", module="EVENTS")
    db.add(permission); await db.flush()
    db.add(ScopedPermission(user_id=actor.id, permission_id=permission.id, scope_type="EVENT", scope_id=events[0].id, is_allowed=True))
    await db.flush()
    headers = {"Authorization": f"Bearer {create_access_token(actor)}"}
    legacy = await client.get("/api/v1/events?page_size=100", headers=headers)
    assert legacy.status_code == 200, legacy.text
    assert {row["id"] for row in legacy.json()} == {str(events[0].id), str(events[1].id)}
    cursor_page = await client.get("/api/v1/events/page?page_size=100", headers=headers)
    assert cursor_page.status_code == 200, cursor_page.text
    assert {row["id"] for row in cursor_page.json()["items"]} == {str(events[0].id), str(events[1].id)}
    assert (await client.get(f"/api/v1/events/{events[0].id}", headers=headers)).status_code == 200
    assert (await client.get(f"/api/v1/events/{events[2].id}", headers=headers)).status_code == 404
    assert (await client.get(f"/api/v1/events/page?organization_id={uuid.uuid4()}", headers=headers)).status_code == 404
    alias = await client.get("/api/v1/organiser/events?page_size=1", headers=headers)
    assert alias.status_code == 200, alias.text
    assert alias.json()["summary"]["total"] == 2
    permissions = await client.get(f"/api/v1/me/permissions?event_id={events[0].id}", headers=headers)
    assert permissions.status_code == 200 and permissions.headers["cache-control"] == "no-store"
    assert permissions.json()["permissions"] == sorted(READ_ACTIONS)
    assert permissions.json()["policy_revision"] == 1
    foreign = await client.get(f"/api/v1/events?organization_id={uuid.uuid4()}", headers=headers)
    assert foreign.status_code == 404
    assert (await client.get(f"/api/v1/me/permissions?event_id={events[2].id}", headers=headers)).json()["permissions"] == []
