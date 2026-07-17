import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.operations_control.models import VenueSupplierAssignment
from app.modules.procurement.models import Vendor
from app.modules.search.models.search import SearchJob
from app.modules.technology_services.models import ServiceRequest
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


@pytest.mark.asyncio
async def test_supplier_assignment_cannot_bind_event_from_another_tenant(
    client: AsyncClient, db: AsyncSession, super_admin: User, event: Event
):
    other_org_id = uuid.uuid4()
    vendor = Vendor(
        name=f"Supplier {uuid.uuid4().hex[:6]}", type="hardware", country="IN",
        city="Mumbai", email="ops@example.test", status="ACTIVE",
    )
    db.add(vendor)
    await db.commit()
    response = await client.post(
        "/platform/operations/venue/supplier-assignments",
        json={
            "organization_id": str(other_org_id),
            "event_id": str(event.id),
            "vendor_id": str(vendor.id),
            "responsibility_scope": {"rooms": ["main"]},
            "reason": "Assign supplier for this event operations contract.",
        },
        headers={**auth_headers(super_admin), "Idempotency-Key": "supplier-cross-tenant"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_supplier_assignments_are_event_specific(
    client: AsyncClient, db: AsyncSession, super_admin: User, event: Event
):
    vendor = Vendor(
        name=f"Supplier {uuid.uuid4().hex[:6]}", type="hardware", country="IN",
        city="Delhi", email="venue@example.test", status="ACTIVE",
    )
    db.add(vendor)
    await db.commit()
    response = await client.post(
        "/platform/operations/venue/supplier-assignments",
        json={
            "organization_id": str(event.organization_id),
            "event_id": str(event.id),
            "vendor_id": str(vendor.id),
            "contract_reference": "CONTRACT-A",
            "responsibility_scope": {"rooms": ["main"]},
            "reason": "Assign the contracted supplier to this event only.",
        },
        headers={**auth_headers(super_admin), "Idempotency-Key": "supplier-event-a"},
    )
    assert response.status_code == 201
    assignment = await db.get(VenueSupplierAssignment, uuid.UUID(response.json()["id"]))
    assert assignment.event_id == event.id
    assert assignment.organization_id == event.organization_id
