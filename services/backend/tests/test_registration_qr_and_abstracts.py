from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.modules.abstracts.models import AbstractCall, AbstractForm
from app.modules.registration.models.participant import Participant
from tests.conftest import activate_event_for_test, auth_headers


pytestmark = pytest.mark.asyncio


async def test_abstract_setup_and_form_gets_are_read_only_when_unconfigured(
    client,
    db,
    event,
    organizer,
):
    await activate_event_for_test(db, event)
    headers = auth_headers(organizer)

    setup = await client.get(f"/api/v1/events/{event.id}/abstracts/setup", headers=headers)
    form = await client.get(f"/api/v1/events/{event.id}/abstracts/form", headers=headers)

    assert setup.status_code == 200
    assert setup.json()["status"] == "DRAFT"
    assert form.status_code == 200
    assert form.json()["schema"]["fields"]
    assert await db.scalar(select(AbstractCall).where(AbstractCall.event_id == event.id)) is None
    assert await db.scalar(select(AbstractForm).where(AbstractForm.event_id == event.id)) is None


async def test_registration_confirmation_qr_issue_rotate_and_verify(
    client,
    db,
    event,
    organizer,
):
    await activate_event_for_test(db, event)
    participant = Participant(
        event_id=event.id,
        regno="REG-QR-001",
        first_name="QR",
        last_name="Delegate",
        email=f"qr-{uuid.uuid4().hex[:8]}@example.test",
        approval_status="Approved",
    )
    db.add(participant)
    await db.commit()
    await db.refresh(participant)

    issue_key = f"qr-issue-{uuid.uuid4()}"
    issue = await client.post(
        f"/api/v1/events/{event.id}/participants/{participant.id}/confirmation-qr",
        json={
            "reason": "Issue registration confirmation credential",
            "case_reference": "TEST-QR-1",
        },
        headers={
            **auth_headers(organizer),
            "If-Match": "0",
            "Idempotency-Key": issue_key,
        },
    )
    assert issue.status_code == 200, issue.text
    first = issue.json()
    assert first["participant_id"] == str(participant.id)
    assert first["version"] == 1
    assert first["status"] == "ACTIVE"

    replay = await client.post(
        f"/api/v1/events/{event.id}/participants/{participant.id}/confirmation-qr",
        json={
            "reason": "Issue registration confirmation credential",
            "case_reference": "TEST-QR-1",
        },
        headers={
            **auth_headers(organizer),
            "If-Match": "0",
            "Idempotency-Key": issue_key,
        },
    )
    assert replay.status_code == 200, replay.text
    assert replay.json()["credential_id"] == first["credential_id"]
    assert replay.json()["version"] == 1

    current = await client.get(
        f"/api/v1/events/{event.id}/participants/{participant.id}/confirmation-qr",
        headers=auth_headers(organizer),
    )
    assert current.status_code == 200, current.text
    assert current.json()["version"] == 1

    first_token = first["verification_url"].rsplit("/", 1)[-1]
    verified = await client.get(
        f"/api/v1/public/registration-confirmations/{first_token}"
    )
    assert verified.status_code == 200, verified.text
    verification = verified.json()
    assert verification["valid"] is True
    assert verification["event_id"] == str(event.id)
    assert verification["participant_name"] == "QR Delegate"
    assert verification["registration_number"] == "REG-QR-001"
    assert verification["approval_status"] == "Approved"
    image = await client.get(
        f"/api/v1/public/registration-confirmations/{first_token}/image"
    )
    assert image.status_code == 200, image.text
    assert image.headers["content-type"] == "image/png"
    assert image.content.startswith(b"\x89PNG\r\n\x1a\n")

    rotate = await client.post(
        f"/api/v1/events/{event.id}/participants/{participant.id}/confirmation-qr",
        json={
            "reason": "Rotate exposed registration confirmation credential",
            "case_reference": "TEST-QR-2",
        },
        headers={
            **auth_headers(organizer),
            "If-Match": "1",
            "Idempotency-Key": f"qr-rotate-{uuid.uuid4()}",
        },
    )
    assert rotate.status_code == 200, rotate.text
    second = rotate.json()
    assert second["credential_id"] == first["credential_id"]
    assert second["version"] == 2
    assert second["verification_url"] != first["verification_url"]

    stale = await client.get(
        f"/api/v1/public/registration-confirmations/{first_token}"
    )
    assert stale.status_code == 404
    second_token = second["verification_url"].rsplit("/", 1)[-1]
    assert (
        await client.get(
            f"/api/v1/public/registration-confirmations/{second_token}"
        )
    ).status_code == 200


async def test_registration_confirmation_qr_requires_event_entitlement(
    client,
    event,
    organizer,
    db,
):
    participant = Participant(
        event_id=event.id,
        first_name="Locked",
        last_name="Delegate",
        email=f"locked-{uuid.uuid4().hex[:8]}@example.test",
    )
    db.add(participant)
    await db.commit()
    await db.refresh(participant)

    response = await client.post(
        f"/api/v1/events/{event.id}/participants/{participant.id}/confirmation-qr",
        json={"reason": "Attempt without an active event contract"},
        headers={
            **auth_headers(organizer),
            "If-Match": "0",
            "Idempotency-Key": f"qr-locked-{uuid.uuid4()}",
        },
    )
    assert response.status_code == 403
    denial = response.json()
    denial_code = denial.get("code") or (denial.get("detail") or {}).get("code")
    assert denial_code in {
        "CONTRACT_REQUIRED",
        "NOT_ENTITLED",
    }


async def test_organiser_standalone_abstract_workflow(
    client,
    db,
    event,
    organizer,
):
    await activate_event_for_test(db, event)
    abstract_text = (
        "This study evaluates a resilient entitlement architecture across "
        "event-scoped workloads using deterministic capability resolution."
    )

    setup = await client.put(
        f"/api/v1/events/{event.id}/abstracts/setup",
        json={
            "status": "OPEN",
            "min_words": 5,
            "max_words": 500,
            "abstract_types": ["ORAL", "POSTER"],
            "topics": ["Architecture"],
            "author_rules": {},
            "attachment_rules": {},
            "disclosure_rules": {},
            "email_triggers": {},
            "blind_review_enabled": True,
        },
        headers={**auth_headers(organizer), "Idempotency-Key": f"abstract-setup-{uuid.uuid4()}"},
    )
    assert setup.status_code == 200, setup.text
    assert setup.json()["status"] == "OPEN"

    submitted = await client.post(
        f"/api/v1/events/{event.id}/abstracts/submissions",
        json={
            "title": "Deterministic entitlement resolution",
            "body": abstract_text,
            "keywords": ["entitlements", "events", "entitlements"],
            "abstract_type": "ORAL",
            "topic": "Architecture",
            "authors": [{"full_name": "Case Author", "email": "case@example.com", "is_presenter": True}],
        },
        headers={**auth_headers(organizer), "Idempotency-Key": f"abstract-submit-{uuid.uuid4()}"},
    )
    assert submitted.status_code == 200, submitted.text
    submission = submitted.json()
    assert submission["status"] == "SUBMITTED"
    assert submission["keywords"] == ["entitlements", "events"]
    assert submission["authors"][0]["full_name"] == "Case Author"

    reviewer = await client.post(
        f"/api/v1/events/{event.id}/abstracts/reviewers",
        json={
            "full_name": "Committee Reviewer",
            "email": "reviewer@example.com",
            "expertise_topics": ["Architecture"],
            "capacity": 5,
            "status": "ACTIVE",
        },
        headers={**auth_headers(organizer), "Idempotency-Key": f"abstract-reviewer-{uuid.uuid4()}"},
    )
    assert reviewer.status_code == 200, reviewer.text

    assigned = await client.post(
        f"/api/v1/events/{event.id}/abstracts/submissions/{submission['id']}/assignments",
        json={"reviewer_id": reviewer.json()["id"]},
        headers={**auth_headers(organizer), "Idempotency-Key": f"abstract-assign-{uuid.uuid4()}"},
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["status"] == "UNDER_REVIEW"

    assignments = await client.get(
        f"/api/v1/events/{event.id}/abstracts/assignments",
        headers=auth_headers(organizer),
    )
    assert assignments.status_code == 200, assignments.text
    assignment_id = assignments.json()[0]["id"]

    reviewed = await client.post(
        f"/api/v1/events/{event.id}/abstracts/assignments/{assignment_id}/reviews",
        json={"scores": {"scientific_merit": 5, "clarity": 4}, "recommendation": "ACCEPT", "comments_to_committee": "Strong fit."},
        headers={**auth_headers(organizer), "Idempotency-Key": f"abstract-score-{uuid.uuid4()}"},
    )
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["review_count"] == 1

    current = reviewed.json()
    accepted = await client.post(
        f"/api/v1/events/{event.id}/abstracts/submissions/{current['id']}/decision",
        json={
            "decision": "ACCEPTED",
            "presentation_type": "ORAL",
            "reason": "Committee accepted the abstract",
        },
        headers={
            **auth_headers(organizer),
            "If-Match": str(current["version"]),
            "Idempotency-Key": f"abstract-accept-{uuid.uuid4()}",
        },
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "ACCEPTED"
    assert accepted.json()["presentation_type"] == "ORAL"

    published = await client.post(
        f"/api/v1/events/{event.id}/abstracts/submissions/{current['id']}/publish",
        json={"publication_payload": {"visibility": "public_directory"}},
        headers={**auth_headers(organizer), "Idempotency-Key": f"abstract-publish-{uuid.uuid4()}"},
    )
    assert published.status_code == 200, published.text
    assert published.json()["published_at"] is not None
