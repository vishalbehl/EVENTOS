import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.core.encryption import decrypt, encrypt
from app.modules.platform.models.organization import Organization
from app.modules.search.models.search import SearchJob
from app.modules.technology_services.models import ServiceRequest
from app.modules.operations_control.models import SourceApiKey
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_operations_control_routes_require_super_admin(client: AsyncClient, organizer: User):
    headers = auth_headers(organizer)
    for path in (
        "/platform/operations/overview",
        "/platform/operations/storage",
        "/platform/operations/requests",
        "/platform/operations/risks",
        "/platform/operations/venue/readiness",
    ):
        response = await client.get(path, headers=headers)
        assert response.status_code == 403, path


@pytest.mark.asyncio
async def test_operations_overview_is_event_scoped_and_not_table_existence_only(
    client: AsyncClient, db: AsyncSession, super_admin: User, event: Event
):
    key = SourceApiKey(
        event_id=event.id,
        organization_id=event.organization_id,
        name="Registration Server",
        key_prefix="regsrc_test",
        key_hash="ops-overview-test-hash",
        source_type="registration_server",
        permissions={"read": True, "push": True},
        created_by=super_admin.id,
    )
    db.add(key)
    await db.commit()

    response = await client.get(
        f"/platform/operations/overview?organization_id={event.organization_id}&event_id={event.id}",
        headers=auth_headers(super_admin),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["scope"]["event_id"] == str(event.id)
    assert data["deployment_profile"]
    sources = {item["key"]: item for item in data["sources"]}
    assert "cloud_db" in sources
    assert sources["source_api_keys"]["status"] in {"HEALTHY", "STALE"}
    assert "table is unavailable" not in sources["source_api_keys"]["detail"].lower()


@pytest.mark.asyncio
async def test_operations_source_access_create_list_and_revoke_audits(
    client: AsyncClient, db: AsyncSession, super_admin: User, event: Event
):
    payload = {
        "organization_id": str(event.organization_id),
        "event_id": str(event.id),
        "source_type": "registration_server",
        "name": "Registration Server",
        "permissions": {"read": True, "push": True},
    }
    create = await client.post(
        "/platform/operations/source-access",
        json=payload,
        headers={**auth_headers(super_admin), "Idempotency-Key": "ops-source-create"},
    )
    assert create.status_code == 201
    created = create.json()
    assert created["api_key_visible_once"] is False
    assert created["api_key"].startswith("regsrc_")
    assert created["source_type"] == "registration_server"
    stored_key = await db.get(SourceApiKey, uuid.UUID(created["id"]))
    assert stored_key is not None
    assert stored_key.api_key_encrypted
    assert stored_key.api_key_encrypted != created["api_key"]
    assert decrypt(stored_key.api_key_encrypted) == created["api_key"]

    listed = await client.get(
        f"/platform/operations/source-access?organization_id={event.organization_id}&event_id={event.id}",
        headers=auth_headers(super_admin),
    )
    assert listed.status_code == 200
    listed_items = listed.json()["items"]
    assert any(item["id"] == created["id"] and item["api_key"] == created["api_key"] for item in listed_items)
    assert listed.json()["kpis"]["active"] >= 1

    revoke = await client.post(
        f"/platform/operations/source-access/{created['id']}/revoke",
        json={"organization_id": str(event.organization_id), "reason": "Revoke the test source access key."},
        headers=auth_headers(super_admin),
    )
    assert revoke.status_code == 200
    assert revoke.json()["status"] == "REVOKED"


@pytest.mark.asyncio
async def test_operations_source_access_expiration_validation_and_status(
    client: AsyncClient, db: AsyncSession, super_admin: User, event: Event
):
    future_expiry = datetime.now(timezone.utc) + timedelta(days=2)
    payload = {
        "organization_id": str(event.organization_id),
        "event_id": str(event.id),
        "source_type": "registration_server",
        "name": "Expiring Registration Server",
        "permissions": {"read": True, "push": True},
        "expires_at": future_expiry.isoformat(),
    }
    create = await client.post(
        "/platform/operations/source-access",
        json=payload,
        headers={**auth_headers(super_admin), "Idempotency-Key": "ops-source-expiring-create"},
    )
    assert create.status_code == 201
    assert create.json()["expires_at"] is not None

    past_payload = {
        **payload,
        "expires_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(),
    }
    rejected = await client.post(
        "/platform/operations/source-access",
        json=past_payload,
        headers={**auth_headers(super_admin), "Idempotency-Key": "ops-source-expired-create"},
    )
    assert rejected.status_code == 422

    db.add(SourceApiKey(
        event_id=event.id,
        organization_id=event.organization_id,
        name="Already Expired Key",
        key_prefix="regsrc_expired",
        key_hash=f"expired-{uuid.uuid4().hex}",
        source_type="registration_server",
        permissions={"read": True, "push": True},
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        created_by=super_admin.id,
    ))
    await db.commit()

    listed = await client.get(
        f"/platform/operations/source-access?organization_id={event.organization_id}&event_id={event.id}",
        headers=auth_headers(super_admin),
    )
    assert listed.status_code == 200
    assert any(item["name"] == "Already Expired Key" and item["status"] == "EXPIRED" for item in listed.json()["items"])


@pytest.mark.asyncio
async def test_platform_admin_can_list_events_for_selected_organization(
    client: AsyncClient, db: AsyncSession, super_admin: User, event: Event
):
    response = await client.get(
        f"/platform/organizations/{event.organization_id}/events",
        headers=auth_headers(super_admin),
    )

    assert response.status_code == 200
    assert any(row["id"] == str(event.id) for row in response.json())


@pytest.mark.asyncio
async def test_operations_source_access_and_readiness_allow_selected_cross_org_event(
    client: AsyncClient, db: AsyncSession, super_admin: User
):
    from datetime import date

    other_org = Organization(
        name="Cross Org",
        slug=f"cross-org-{uuid.uuid4().hex[:8]}",
        plan="pro",
    )
    db.add(other_org)
    await db.flush()
    other_event = Event(
        organization_id=other_org.id,
        created_by=super_admin.id,
        name="Cross Org Event",
        short_code=f"XO{uuid.uuid4().hex[:4].upper()}",
        location="Test City",
        venue_name="Test Hall",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 2),
        timezone="UTC",
        status="draft",
    )
    db.add(other_event)
    await db.flush()
    raw_key = "regsrc_" + uuid.uuid4().hex
    db.add(SourceApiKey(
        event_id=other_event.id,
        organization_id=other_org.id,
        name="Cross Registration Server",
        key_prefix=raw_key[:16],
        key_hash=uuid.uuid4().hex + uuid.uuid4().hex,
        api_key_encrypted=encrypt(raw_key),
        source_type="registration_server",
        permissions={"read": True, "push": True},
        created_by=super_admin.id,
    ))
    await db.commit()

    query = f"organization_id={other_org.id}&event_id={other_event.id}"
    readiness = await client.get(
        f"/platform/operations/venue/readiness?{query}",
        headers=auth_headers(super_admin),
    )
    assert readiness.status_code == 200
    assert readiness.json()["scope"]["event_id"] == str(other_event.id)

    source_access = await client.get(
        f"/platform/operations/source-access?{query}",
        headers=auth_headers(super_admin),
    )
    assert source_access.status_code == 200
    data = source_access.json()
    assert data["kpis"]["active"] == 1
    assert data["items"][0]["event_name"] == "Cross Org Event"
    assert data["items"][0]["organization_name"] == "Cross Org"
    assert data["items"][0]["api_key"] == raw_key


@pytest.mark.asyncio
async def test_supplier_assignment_endpoint_is_removed(client: AsyncClient, super_admin: User):
    response = await client.get(
        "/platform/operations/venue/supplier-assignments",
        headers=auth_headers(super_admin),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_request_transition_uses_optimistic_version_and_audit(
    client: AsyncClient, db: AsyncSession, super_admin: User, event: Event
):
    request = ServiceRequest(
        organization_id=event.organization_id,
        event_id=event.id,
        request_number=f"OPS-{uuid.uuid4().hex[:8]}",
        title="Venue connectivity review",
        status="SUBMITTED",
        priority="HIGH",
        request_type="NETWORK",
        requested_by=super_admin.id,
        version=1,
    )
    db.add(request)
    await db.commit()

    payload = {
        "organization_id": str(event.organization_id),
        "version": 1,
        "target_status": "TRIAGED",
        "reason": "Assign the request to the operations triage queue.",
    }
    response = await client.post(
        f"/platform/operations/requests/{request.id}/transition",
        json=payload,
        headers=auth_headers(super_admin),
    )
    assert response.status_code == 200
    assert response.json()["status"] == "TRIAGED"
    assert response.json()["version"] == 2

    stale = await client.post(
        f"/platform/operations/requests/{request.id}/transition",
        json=payload,
        headers=auth_headers(super_admin),
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "VERSION_CONFLICT"


@pytest.mark.asyncio
async def test_job_control_idempotency_conflict_is_tenant_scoped(
    client: AsyncClient, db: AsyncSession, super_admin: User
):
    job = SearchJob(
        organization_id=super_admin.organization_id,
        status="failed",
        entity_types=["events"],
        records_processed=0,
        error_code="QUEUE_UNAVAILABLE",
    )
    db.add(job)
    await db.commit()
    headers = {**auth_headers(super_admin), "Idempotency-Key": "job-retry-test-key"}
    payload = {
        "organization_id": str(super_admin.organization_id),
        "reason": "Retry after the search worker queue has recovered.",
    }
    first = await client.post(f"/platform/operations/jobs/search_index/{job.id}/retry", json=payload, headers=headers)
    assert first.status_code == 202
    replay = await client.post(f"/platform/operations/jobs/search_index/{job.id}/retry", json=payload, headers=headers)
    assert replay.status_code == 202
    assert replay.json()["replayed"] is True

    conflict_payload = {**payload, "reason": "A materially different retry request reason is supplied."}
    conflict = await client.post(f"/platform/operations/jobs/search_index/{job.id}/retry", json=conflict_payload, headers=headers)
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"
