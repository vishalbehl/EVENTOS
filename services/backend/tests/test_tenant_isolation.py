import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform.models.organization import Organization
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.rbac.models.organization_member import OrganizationMember as UserOrganizationMembership
from app.modules.rbac.models.rbac import UserAccessNode
from app.modules.rbac.models.user_assignment import UserEventAssignment
from tests.conftest import auth_headers, hash_password

@pytest.fixture
async def second_organization(db: AsyncSession) -> Organization:
    """Create and persist a second test Organization."""
    org = Organization(
        name="Second Test Org",
        slug=f"second-org-{uuid.uuid4().hex[:8]}",
        plan="pro",
    )
    db.add(org)
    await db.flush()
    return org

@pytest.fixture
async def organizer_b(db: AsyncSession, second_organization: Organization) -> User:
    """Create and persist an event_organizer User for the second Org."""
    user = User(
        organization_id=second_organization.id,
        email=f"organizer-b-{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("testpassword123"),
        first_name="Organizer",
        last_name="B",
        role="organiser",
        is_active=True,
    )
    db.add(user)
    await db.flush()

    # Link user to the second organization via membership table as well
    membership = UserOrganizationMembership(
        user_id=user.id,
        organization_id=second_organization.id,
        org_role="organiser"
    )
    db.add(membership)
    await db.flush()
    return user

@pytest.fixture
async def event_b(db: AsyncSession, second_organization: Organization, organizer_b: User) -> Event:
    """Create and persist a draft Event for the second Org."""
    from datetime import date
    ev = Event(
        organization_id=second_organization.id,
        created_by=organizer_b.id,
        name="Second Conference 2026",
        short_code=f"TB{uuid.uuid4().hex[:4].upper()}",
        location="Second City",
        venue_name="Second Hall",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 3),
        timezone="UTC",
        status="draft",
        max_file_size_mb=500,
        allowed_formats=["pptx", "pdf", "mp4"],
    )
    db.add(ev)
    await db.flush()

    # Assign organiser B to the event
    assignment = UserAccessNode(
        user_id=organizer_b.id,
        node_id=ev.id,
        node_type="EVENT",
    )
    db.add(assignment)
    await db.flush()

    return ev


class TestTenantIsolation:
    @pytest.mark.asyncio
    async def test_organizer_only_sees_own_events_list(
        self,
        db: AsyncSession,
        client: AsyncClient,
        event: Event,              # Event A (Org A, via organizer A)
        event_b: Event,            # Event B (Org B, via organizer B)
        organizer: User,          # User A (Org A)
        organizer_b: User,        # User B (Org B)
    ):
        from sqlalchemy import select
        all_users = (await db.execute(select(User).execution_options(skip_tenant_filter=True))).scalars().all()
        print(f"DEBUG: ALL USERS IN DB: {[(u.id, u.email, u.organization_id) for u in all_users]}")

        # 1. Fetch events using Organizer A credentials
        resp_a = await client.get("/events", headers=auth_headers(organizer))
        assert resp_a.status_code == 200
        data_a = resp_a.json()
        
        # Should only see Event A
        event_ids_a = [uuid.UUID(e["id"]) for e in data_a]
        assert event.id in event_ids_a
        assert event_b.id not in event_ids_a

        # 2. Fetch events using Organizer B credentials
        resp_b = await client.get("/events", headers=auth_headers(organizer_b))
        assert resp_b.status_code == 200
        data_b = resp_b.json()
        
        # Should only see Event B
        event_ids_b = [uuid.UUID(e["id"]) for e in data_b]
        assert event_b.id in event_ids_b
        assert event.id not in event_ids_b

    @pytest.mark.asyncio
    async def test_organizer_cannot_get_other_org_event_details(
        self,
        client: AsyncClient,
        event: Event,              # Event A (Org A)
        organizer_b: User,        # User B (Org B)
    ):
        # Try to load Event A details using Organizer B credentials
        resp = await client.get(f"/events/{event.id}", headers=auth_headers(organizer_b))
        
        # Should return 404 (not found / hidden) instead of success or 403
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_super_admin_is_tenant_scoped_without_impersonation(
        self,
        client: AsyncClient,
        event: Event,              # Event A (Org A)
        event_b: Event,            # Event B (Org B)
        super_admin: User,        # Super Admin
    ):
        # Fetch events using Super Admin credentials
        resp = await client.get("/events", headers=auth_headers(super_admin))
        assert resp.status_code == 200
        data = resp.json()
        
        # Privileged users remain scoped until a step-up impersonation token is issued.
        event_ids = [uuid.UUID(e["id"]) for e in data]
        assert event.id in event_ids
        assert event_b.id not in event_ids

    @pytest.mark.asyncio
    async def test_event_assignment_rejects_cross_tenant_user_and_event(
        self,
        client: AsyncClient,
        organizer: User,
        event_b: Event,
    ):
        response = await client.post(
            "/users/assignments",
            json={
                "user_id": str(organizer.id),
                "event_id": str(event_b.id),
                "permissions": {"level": "full"},
            },
            headers={
                **auth_headers(organizer),
                "Idempotency-Key": f"cross-tenant-{uuid.uuid4()}",
            },
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_event_assignment_update_is_tenant_scoped(
        self,
        client: AsyncClient,
        db: AsyncSession,
        organizer: User,
        organizer_b: User,
        event_b: Event,
    ):
        assignment = UserEventAssignment(
            user_id=organizer_b.id,
            event_id=event_b.id,
            permissions={"level": "full"},
        )
        db.add(assignment)
        await db.flush()

        response = await client.patch(
            f"/users/assignments/{assignment.id}",
            json={"permissions": {"level": "partial"}},
            headers=auth_headers(organizer),
        )
        assert response.status_code == 404
