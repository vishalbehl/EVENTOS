from __future__ import annotations

import uuid

import pytest

from app.modules.registration.models.participant import Participant
from tests.conftest import activate_event_for_test, auth_headers


pytestmark = pytest.mark.asyncio


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


async def test_abstract_submission_review_and_acceptance_workflow(
    client,
    db,
    event,
    organizer,
    speaker,
    session_speaker,
):
    await activate_event_for_test(db, event)
    token = speaker._plain_token
    abstract_text = (
        "This study evaluates a resilient entitlement architecture across "
        "event-scoped workloads using deterministic capability resolution."
    )

    draft = await client.patch(
        f"/api/v1/portal/abstracts/{session_speaker.id}",
        params={"token": token},
        json={
            "abstract_text": abstract_text,
            "keywords": ["entitlements", "events", "entitlements"],
        },
        headers={
            "If-Match": "1",
            "Idempotency-Key": f"abstract-draft-{uuid.uuid4()}",
        },
    )
    assert draft.status_code == 200, draft.text
    assert draft.json()["status"] == "DRAFT"
    assert draft.json()["version"] == 2
    assert draft.json()["keywords"] == ["entitlements", "events"]

    submit_key = f"abstract-submit-{uuid.uuid4()}"
    submitted = await client.post(
        f"/api/v1/portal/abstracts/{session_speaker.id}/submit",
        params={"token": token},
        headers={
            "If-Match": "2",
            "Idempotency-Key": submit_key,
        },
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["status"] == "SUBMITTED"
    assert submitted.json()["version"] == 3

    replay = await client.post(
        f"/api/v1/portal/abstracts/{session_speaker.id}/submit",
        params={"token": token},
        headers={
            "If-Match": "2",
            "Idempotency-Key": submit_key,
        },
    )
    assert replay.status_code == 200, replay.text
    assert replay.json()["version"] == 3

    abstract_page = await client.get(
        f"/api/v1/events/{event.id}/abstracts",
        params={"status": "SUBMITTED"},
        headers=auth_headers(organizer),
    )
    assert abstract_page.status_code == 200, abstract_page.text
    assert len(abstract_page.json()["items"]) == 1
    assert (
        abstract_page.json()["items"][0]["session_speaker_id"]
        == str(session_speaker.id)
    )

    under_review = await client.patch(
        f"/api/v1/events/{event.id}/abstracts/{session_speaker.id}/review",
        json={
            "decision": "UNDER_REVIEW",
            "reason": "Begin committee assessment",
            "case_reference": "ABSTRACT-REVIEW-1",
        },
        headers={
            **auth_headers(organizer),
            "If-Match": "3",
            "Idempotency-Key": f"abstract-review-{uuid.uuid4()}",
        },
    )
    assert under_review.status_code == 200, under_review.text
    assert under_review.json()["status"] == "UNDER_REVIEW"
    assert under_review.json()["version"] == 4

    accepted = await client.patch(
        f"/api/v1/events/{event.id}/abstracts/{session_speaker.id}/review",
        json={
            "decision": "ACCEPTED",
            "reason": "Committee accepted the abstract",
            "case_reference": "ABSTRACT-REVIEW-2",
        },
        headers={
            **auth_headers(organizer),
            "If-Match": "4",
            "Idempotency-Key": f"abstract-accept-{uuid.uuid4()}",
        },
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "ACCEPTED"
    assert accepted.json()["version"] == 5

    locked = await client.patch(
        f"/api/v1/portal/abstracts/{session_speaker.id}",
        params={"token": token},
        json={
            "abstract_text": abstract_text + " Updated after acceptance.",
            "keywords": ["entitlements"],
        },
        headers={
            "If-Match": "5",
            "Idempotency-Key": f"abstract-locked-{uuid.uuid4()}",
        },
    )
    assert locked.status_code == 409
    assert locked.json()["detail"]["code"] == "ABSTRACT_LOCKED"
