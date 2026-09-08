import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.crm.models.crm_domain_tables import ProposalShare
from tests.conftest import auth_headers


def quote_payload(organization_id: uuid.UUID, event_id: uuid.UUID) -> dict:
    return {
        "organization_id": str(organization_id),
        "event_id": str(event_id),
        "title": "Annual Conference Technology Quote",
        "currency": "INR",
        "validity_days": 30,
        "discount_type": "PERCENTAGE",
        "discount_value": "10.00",
        "tax_rate": "18.00",
        "line_items": [
            {
                "category": "Hardware",
                "name": "Projection package",
                "quantity": "2.00",
                "duration_days": 3,
                "unit_rate": "1000.00",
            },
            {
                "category": "Staffing",
                "name": "Room technician",
                "quantity": "1.00",
                "duration_days": 2,
                "unit_rate": "500.00",
            },
        ],
    }


@pytest.mark.asyncio
async def test_quote_create_is_server_calculated_idempotent_and_versioned(
    client: AsyncClient,
    super_admin: User,
    organization: Organization,
    event: Event,
):
    payload = quote_payload(organization.id, event.id)
    headers = {**auth_headers(super_admin), "Idempotency-Key": f"quote-{uuid.uuid4()}"}

    response = await client.post("/service-requests/quotes", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["status"] == "DRAFT"
    assert created["subtotal"] == "7000.00"
    assert created["discount_amount"] == "700.00"
    assert created["taxable_amount"] == "6300.00"
    assert created["tax_amount"] == "1134.00"
    assert created["total_amount"] == "7434.00"
    assert created["version"] == 1

    retry = await client.post("/service-requests/quotes", json=payload, headers=headers)
    assert retry.status_code == 201
    assert retry.json()["id"] == created["id"]

    conflict_payload = {**payload, "title": "Different commercial request"}
    conflict = await client.post("/service-requests/quotes", json=conflict_payload, headers=headers)
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "IDEMPOTENCY_CONFLICT"

    revisions = await client.get(
        f"/service-requests/quotes/{created['id']}/revisions?organization_id={organization.id}",
        headers=auth_headers(super_admin),
    )
    assert revisions.status_code == 200
    assert [item["version"] for item in revisions.json()] == [1]
    assert revisions.json()[0]["snapshot_json"]["total_amount"] == "7434.00"


@pytest.mark.asyncio
async def test_quote_update_requires_current_version_and_preserves_revision(
    client: AsyncClient,
    super_admin: User,
    organization: Organization,
    event: Event,
):
    payload = quote_payload(organization.id, event.id)
    created = (await client.post(
        "/service-requests/quotes",
        json=payload,
        headers={**auth_headers(super_admin), "Idempotency-Key": f"quote-{uuid.uuid4()}"},
    )).json()
    update = {
        **{key: value for key, value in payload.items() if key not in {"organization_id", "event_id"}},
        "expected_version": 1,
        "reason": "Customer reduced projection package quantity",
        "line_items": [{**payload["line_items"][0], "quantity": "1.00"}],
    }
    response = await client.patch(
        f"/service-requests/quotes/{created['id']}?organization_id={organization.id}",
        json=update,
        headers=auth_headers(super_admin),
    )
    assert response.status_code == 200, response.text
    assert response.json()["version"] == 2
    assert response.json()["subtotal"] == "3000.00"

    stale = await client.patch(
        f"/service-requests/quotes/{created['id']}?organization_id={organization.id}",
        json=update,
        headers=auth_headers(super_admin),
    )
    assert stale.status_code == 409
    assert stale.json()["detail"] == "QUOTE_VERSION_CONFLICT"

    revisions = await client.get(
        f"/service-requests/quotes/{created['id']}/revisions?organization_id={organization.id}",
        headers=auth_headers(super_admin),
    )
    assert [item["version"] for item in revisions.json()] == [2, 1]


@pytest.mark.asyncio
async def test_quote_scope_hides_foreign_tenant_event(
    client: AsyncClient,
    organizer: User,
    super_admin: User,
    event: Event,
    db: AsyncSession,
):
    foreign_org = Organization(
        name="Foreign Quote Org",
        slug=f"foreign-quote-{uuid.uuid4().hex[:8]}",
        plan="pro",
    )
    db.add(foreign_org)
    await db.flush()
    payload = quote_payload(foreign_org.id, event.id)

    response = await client.post(
        "/service-requests/quotes",
        json=payload,
        headers={**auth_headers(organizer), "Idempotency-Key": f"quote-{uuid.uuid4()}"},
    )
    assert response.status_code == 404

    admin_response = await client.post(
        "/service-requests/quotes",
        json=payload,
        headers={**auth_headers(super_admin), "Idempotency-Key": f"quote-{uuid.uuid4()}"},
    )
    assert admin_response.status_code == 404


@pytest.mark.asyncio
async def test_quote_approval_is_version_bound_permissioned_and_idempotent(
    client: AsyncClient,
    organizer: User,
    super_admin: User,
    organization: Organization,
    event: Event,
):
    payload = quote_payload(organization.id, event.id)
    created = (await client.post(
        "/service-requests/quotes",
        json=payload,
        headers={**auth_headers(super_admin), "Idempotency-Key": f"quote-{uuid.uuid4()}"},
    )).json()
    submit_key = f"approval-submit-{uuid.uuid4()}"
    submission = {
        "expected_quote_version": created["version"],
        "reason": "Commercial terms are ready for accountable review",
    }
    submitted = await client.post(
        f"/service-requests/quotes/{created['id']}/approval/submit?organization_id={organization.id}",
        json=submission,
        headers={**auth_headers(super_admin), "Idempotency-Key": submit_key},
    )
    assert submitted.status_code == 200, submitted.text
    workflow = submitted.json()
    assert workflow["status"] == "PENDING"
    assert workflow["quote_version"] == created["version"]
    assert workflow["workflow_version"] == 1
    assert workflow["steps"][0]["required_permission"] == "quotes.approve"

    replay = await client.post(
        f"/service-requests/quotes/{created['id']}/approval/submit?organization_id={organization.id}",
        json=submission,
        headers={**auth_headers(super_admin), "Idempotency-Key": submit_key},
    )
    assert replay.status_code == 200
    assert replay.json()["id"] == workflow["id"]

    step_id = workflow["steps"][0]["id"]
    decision = {
        "action": "APPROVE",
        "reason": "Pricing and scope validated against the persisted quote version",
        "expected_workflow_version": 1,
    }
    denied = await client.post(
        f"/service-requests/quotes/{created['id']}/approval/steps/{step_id}/action",
        json=decision,
        headers={**auth_headers(organizer), "Idempotency-Key": f"approval-{uuid.uuid4()}"},
    )
    assert denied.status_code == 403

    decision_key = f"approval-{uuid.uuid4()}"
    approved = await client.post(
        f"/service-requests/quotes/{created['id']}/approval/steps/{step_id}/action?organization_id={organization.id}",
        json=decision,
        headers={**auth_headers(super_admin), "Idempotency-Key": decision_key},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "APPROVED"
    assert approved.json()["workflow_version"] == 2
    assert approved.json()["steps"][0]["decision_reason"] == decision["reason"]

    decision_replay = await client.post(
        f"/service-requests/quotes/{created['id']}/approval/steps/{step_id}/action?organization_id={organization.id}",
        json=decision,
        headers={**auth_headers(super_admin), "Idempotency-Key": decision_key},
    )
    assert decision_replay.status_code == 200
    assert decision_replay.json()["status"] == "APPROVED"

    stored_quote = await client.get(
        f"/service-requests/quotes/{created['id']}?organization_id={organization.id}",
        headers=auth_headers(super_admin),
    )
    assert stored_quote.status_code == 200
    assert stored_quote.json()["status"] == "APPROVED"


@pytest.mark.asyncio
async def test_quote_approval_rejects_stale_quote_submission(
    client: AsyncClient,
    super_admin: User,
    organization: Organization,
    event: Event,
):
    payload = quote_payload(organization.id, event.id)
    created = (await client.post(
        "/service-requests/quotes",
        json=payload,
        headers={**auth_headers(super_admin), "Idempotency-Key": f"quote-{uuid.uuid4()}"},
    )).json()
    response = await client.post(
        f"/service-requests/quotes/{created['id']}/approval/submit?organization_id={organization.id}",
        json={"expected_quote_version": created["version"] + 1, "reason": "Stale client submission"},
        headers={**auth_headers(super_admin), "Idempotency-Key": f"approval-submit-{uuid.uuid4()}"},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "QUOTE_VERSION_CONFLICT"


@pytest.mark.asyncio
async def test_approved_quote_converts_to_immutable_proposal_and_durable_document(
    client: AsyncClient,
    super_admin: User,
    organizer: User,
    organization: Organization,
    event: Event,
    db: AsyncSession,
    monkeypatch,
):
    request_response = await client.post(
        f"/service-requests?event_id={event.id}",
        json={
            "title": "Venue Ops quotation brief",
            "description": "Approved operational scope",
            "priority": "HIGH",
            "request_type": "VENUE_OPS",
            "items": [],
            "requirements": [],
        },
        headers=auth_headers(super_admin),
    )
    assert request_response.status_code == 200, request_response.text
    payload = {**quote_payload(organization.id, event.id), "service_request_id": request_response.json()["id"], "internal_notes": "Never expose this internal note"}
    created = (await client.post(
        "/service-requests/quotes",
        json=payload,
        headers={**auth_headers(super_admin), "Idempotency-Key": f"quote-{uuid.uuid4()}"},
    )).json()
    workflow = (await client.post(
        f"/service-requests/quotes/{created['id']}/approval/submit?organization_id={organization.id}",
        json={"expected_quote_version": 1, "reason": "Ready for proposal approval"},
        headers={**auth_headers(super_admin), "Idempotency-Key": f"approval-submit-{uuid.uuid4()}"},
    )).json()
    approved = await client.post(
        f"/service-requests/quotes/{created['id']}/approval/steps/{workflow['steps'][0]['id']}/action?organization_id={organization.id}",
        json={"action": "APPROVE", "reason": "Commercial terms approved", "expected_workflow_version": 1},
        headers={**auth_headers(super_admin), "Idempotency-Key": f"approval-{uuid.uuid4()}"},
    )
    assert approved.status_code == 200

    conversion_key = f"proposal-{uuid.uuid4()}"
    conversion_payload = {"expected_quote_version": 1, "reason": "Create client proposal from approved terms"}
    converted = await client.post(
        f"/service-requests/quotes/{created['id']}/proposal?organization_id={organization.id}",
        json=conversion_payload,
        headers={**auth_headers(super_admin), "Idempotency-Key": conversion_key},
    )
    assert converted.status_code == 201, converted.text
    proposal = converted.json()
    assert proposal["quote_id"] == created["id"]
    assert proposal["current_version"] == 1
    snapshot = proposal["versions"][0]["snapshot_json"]
    assert snapshot["total_amount"] == created["total_amount"]
    assert "internal_notes" not in snapshot

    send_key = f"proposal-send-{uuid.uuid4()}"
    sent = await client.post(
        f"/service-requests/proposals/{proposal['id']}/send?organization_id={organization.id}",
        json={"expected_version": 1, "reason": "Send approved Venue Ops proposal to organiser"},
        headers={**auth_headers(super_admin), "Idempotency-Key": send_key},
    )
    assert sent.status_code == 200, sent.text
    assert sent.json()["status"] == "SENT"
    sent_replay = await client.post(
        f"/service-requests/proposals/{proposal['id']}/send?organization_id={organization.id}",
        json={"expected_version": 1, "reason": "Send approved Venue Ops proposal to organiser"},
        headers={**auth_headers(super_admin), "Idempotency-Key": send_key},
    )
    assert sent_replay.status_code == 200
    assert sent_replay.json()["id"] == proposal["id"]

    organiser_quotes = await client.get(
        f"/service-requests/events/{event.id}/venue-ops/quotes",
        headers=auth_headers(organizer),
    )
    assert organiser_quotes.status_code == 200, organiser_quotes.text
    assert organiser_quotes.json()[0]["id"] == created["id"]
    organiser_review = await client.get(
        f"/service-requests/quotes/{created['id']}/organiser-review",
        headers=auth_headers(organizer),
    )
    assert organiser_review.status_code == 200, organiser_review.text
    assert organiser_review.json()["status"] == "SENT"
    assert "internal_notes" not in organiser_review.json()
    decision_key = f"venue-ops-organiser-decision-{uuid.uuid4()}"
    organiser_decision = await client.post(
        f"/service-requests/quotes/{created['id']}/organiser-decision",
        json={"expected_version": 2, "action": "APPROVE", "reason": "Organiser approved the Venue Ops scope and pricing"},
        headers={**auth_headers(organizer), "Idempotency-Key": decision_key},
    )
    assert organiser_decision.status_code == 200, organiser_decision.text
    assert organiser_decision.json()["status"] == "ORGANISER_APPROVED"
    handoff = await client.get(
        f"/service-requests/events/{event.id}/venue-ops/fulfilment",
        headers=auth_headers(organizer),
    )
    assert handoff.status_code == 200, handoff.text
    assert handoff.json()[0]["quote_id"] == created["id"]

    replay = await client.post(
        f"/service-requests/quotes/{created['id']}/proposal?organization_id={organization.id}",
        json=conversion_payload,
        headers={**auth_headers(super_admin), "Idempotency-Key": conversion_key},
    )
    assert replay.status_code == 201
    assert replay.json()["id"] == proposal["id"]

    dispatched = []
    monkeypatch.setattr(
        "app.modules.commercial.quotes_router.celery_app.send_task",
        lambda name, kwargs: dispatched.append((name, kwargs)),
    )
    document_key = f"proposal-document-{uuid.uuid4()}"
    document = await client.post(
        f"/service-requests/proposals/{proposal['id']}/documents?organization_id={organization.id}",
        json={"expected_version": 1, "reason": "Generate approved client PDF"},
        headers={**auth_headers(super_admin), "Idempotency-Key": document_key},
    )
    assert document.status_code == 202, document.text
    export_data = document.json()
    assert export_data["status"] == "QUEUED"
    assert dispatched[0][0] == "workers.tasks.report_tasks.generate_quote_proposal_pdf"

    listed = await client.get(
        f"/service-requests/proposals/{proposal['id']}/documents?organization_id={organization.id}",
        headers=auth_headers(super_admin),
    )
    assert listed.status_code == 200, listed.text
    assert [item["export_id"] for item in listed.json()] == [export_data["export_id"]]

    monkeypatch.setattr(
        "app.modules.commercial.quotes_router.celery_app.send_task",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("broker unavailable")),
    )
    failed_key = f"proposal-document-{uuid.uuid4()}"
    failed_dispatch = await client.post(
        f"/service-requests/proposals/{proposal['id']}/documents?organization_id={organization.id}",
        json={"expected_version": 1, "reason": "Verify durable dispatch failure"},
        headers={**auth_headers(super_admin), "Idempotency-Key": failed_key},
    )
    assert failed_dispatch.status_code == 503
    assert failed_dispatch.json()["detail"]["code"] == "DOCUMENT_DISPATCH_FAILED"
    failed_export = await db.scalar(select(DataExport).where(DataExport.idempotency_key == failed_key))
    assert failed_export.status == "FAILED"
    assert failed_export.failure_reason == "Document worker dispatch failed."

    not_ready = await client.get(
        f"/service-requests/proposals/{proposal['id']}/documents/{export_data['export_id']}/download?organization_id={organization.id}",
        headers=auth_headers(super_admin),
    )
    assert not_ready.status_code == 409
    assert not_ready.json()["detail"]["code"] == "EXPORT_NOT_READY"

    export = await db.get(DataExport, uuid.UUID(export_data["export_id"]))
    export.status = "COMPLETED"
    export.storage_key = f"{organization.id}/events/{event.id}/proposals/{proposal['id']}/v1/proposal.pdf"
    await db.commit()
    download = await client.get(
        f"/service-requests/proposals/{proposal['id']}/documents/{export_data['export_id']}/download?organization_id={organization.id}",
        headers=auth_headers(super_admin),
    )
    assert download.status_code == 200, download.text
    assert download.json()["expires_in"] <= 300
    if settings.STORAGE_MODE == "local":
        assert "organization_id=" in download.json()["download_url"]
    else:
        assert "X-Amz-Signature=" in download.json()["download_url"]

    share_key = f"proposal-share-{uuid.uuid4()}"
    share_payload = {
        "expected_version": 1,
        "recipient_name": "Client Approver",
        "recipient_email": "approver@example.com",
        "expires_in_hours": 72,
        "reason": "Send approved commercial proposal to client",
    }
    created_share = await client.post(
        f"/service-requests/proposals/{proposal['id']}/shares?organization_id={organization.id}",
        json=share_payload,
        headers={**auth_headers(super_admin), "Idempotency-Key": share_key},
    )
    assert created_share.status_code == 201, created_share.text
    share = created_share.json()
    assert share["status"] == "ACTIVE"
    assert share["token"]
    stored_share = await db.get(ProposalShare, uuid.UUID(share["id"]))
    assert stored_share.token_hash != share["token"]
    assert len(stored_share.token_hash) == 64

    share_replay = await client.post(
        f"/service-requests/proposals/{proposal['id']}/shares?organization_id={organization.id}",
        json=share_payload,
        headers={**auth_headers(super_admin), "Idempotency-Key": share_key},
    )
    assert share_replay.status_code == 201
    assert share_replay.json()["token"] == share["token"]

    share_auth = {"Authorization": f"ProposalShare {share['token']}"}
    public_view = await client.get("/public/proposals/share", headers=share_auth)
    assert public_view.status_code == 200, public_view.text
    assert public_view.json()["snapshot"]["total_amount"] == created["total_amount"]
    assert "internal_notes" not in public_view.json()["snapshot"]

    access_log = await client.get(
        f"/service-requests/proposals/{proposal['id']}/shares/{share['id']}/accesses?organization_id={organization.id}",
        headers=auth_headers(super_admin),
    )
    assert access_log.status_code == 200
    assert access_log.json()[0]["action"] == "VIEWED"

    revoke_share = await client.post(
        f"/service-requests/proposals/{proposal['id']}/shares?organization_id={organization.id}",
        json={**share_payload, "recipient_email": "revoked@example.com"},
        headers={**auth_headers(super_admin), "Idempotency-Key": f"proposal-share-{uuid.uuid4()}"},
    )
    revoked = await client.post(
        f"/service-requests/proposals/{proposal['id']}/shares/{revoke_share.json()['id']}/revoke?organization_id={organization.id}",
        json={"reason": "Recipient changed before review"},
        headers={**auth_headers(super_admin), "Idempotency-Key": f"proposal-revoke-{uuid.uuid4()}"},
    )
    assert revoked.status_code == 200
    assert revoked.json()["status"] == "REVOKED"
    assert (await client.get("/public/proposals/share", headers={"Authorization": f"ProposalShare {revoke_share.json()['token']}"})).status_code == 410

    decision_key = f"proposal-decision-{uuid.uuid4()}"
    decision_payload = {
        "decision": "ACCEPTED",
        "signer_name": "Authorized Client Signer",
        "signer_title": "Procurement Director",
        "reason": "Commercial proposal accepted for contracting",
        "consent_confirmed": True,
    }
    decision = await client.post(
        "/public/proposals/share/decision",
        json=decision_payload,
        headers={**share_auth, "Idempotency-Key": decision_key},
    )
    assert decision.status_code == 200, decision.text
    assert decision.json()["decision"] == "ACCEPTED"
    decision_replay = await client.post(
        "/public/proposals/share/decision",
        json=decision_payload,
        headers={**share_auth, "Idempotency-Key": decision_key},
    )
    assert decision_replay.status_code == 200
    assert decision_replay.json()["decided_at"] == decision.json()["decided_at"]
    assert (await client.get("/public/proposals/share", headers=share_auth)).status_code == 410
    tampered = f"{share['token'][:-1]}{'a' if share['token'][-1] != 'a' else 'b'}"
    assert (await client.get("/public/proposals/share", headers={"Authorization": f"ProposalShare {tampered}"})).status_code == 404

    accepted_proposal = await client.get(
        f"/service-requests/proposals/{proposal['id']}?organization_id={organization.id}",
        headers=auth_headers(super_admin),
    )
    assert accepted_proposal.json()["status"] == "ACCEPTED"
