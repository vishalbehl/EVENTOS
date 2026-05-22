# tests/test_queue.py
from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.rbac.models.event import Event
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.presentations.models.presentation_queue import PresentationQueue
from app.modules.speakers.models.session import Session
from app.modules.speakers.models.session_speaker import SessionSpeaker
from app.modules.speakers.models.speaker import Speaker
from app.modules.auth.models.user import User
from tests.conftest import auth_headers


QUEUE_BASE = "/events/{event_id}/queue"


@pytest.fixture
async def approved_file(
    db: AsyncSession, event: Event, session_speaker: SessionSpeaker, speaker: Speaker
) -> PresentationFile:
    """An approved presentation file ready to be queued."""
    pf = PresentationFile(
        speaker_id=speaker.id,
        session_speaker_id=session_speaker.id,
        event_id=event.id,
        original_filename="talk.pptx",
        stored_filename=f"{uuid.uuid4()}.pptx",
        storage_path=f"presentations/{event.id}/{speaker.id}/{uuid.uuid4()}.pptx",
        file_size_bytes=10_485_760,
        mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        file_format="pptx",
        upload_status="approved",
        upload_source="web",
        version_number=1,
        is_current_version=True,
    )
    db.add(pf)
    await db.flush()
    return pf


@pytest.fixture
async def queue_entry(
    db: AsyncSession,
    event: Event,
    session_obj: Session,
    session_speaker: SessionSpeaker,
    approved_file: PresentationFile,
) -> PresentationQueue:
    """A queued PresentationQueue entry."""
    entry = PresentationQueue(
        session_id=session_obj.id,
        session_speaker_id=session_speaker.id,
        file_id=approved_file.id,
        queue_order=0,
        status="queued",
    )
    db.add(entry)
    await db.flush()
    return entry


class TestQueueRead:
    async def test_get_session_queue_empty(
        self,
        client: AsyncClient,
        event: Event,
        session_obj: Session,
        organizer: User,
    ):
        resp = await client.get(
            f"{QUEUE_BASE.format(event_id=event.id)}/sessions/{session_obj.id}",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_entries"] == 0
        assert data["active_entry"] is None

    async def test_get_session_queue_with_entry(
        self,
        client: AsyncClient,
        event: Event,
        session_obj: Session,
        queue_entry: PresentationQueue,
        organizer: User,
    ):
        resp = await client.get(
            f"{QUEUE_BASE.format(event_id=event.id)}/sessions/{session_obj.id}",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_entries"] == 1
        assert data["entries"][0]["id"] == str(queue_entry.id)

    async def test_get_room_queue(
        self,
        client: AsyncClient,
        event: Event,
        room,
        queue_entry: PresentationQueue,
        organizer: User,
    ):
        resp = await client.get(
            f"{QUEUE_BASE.format(event_id=event.id)}/rooms/{room.id}",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        entries = resp.json()
        assert isinstance(entries, list)

    async def test_get_room_queue_no_sessions(
        self,
        client: AsyncClient,
        event: Event,
        organizer: User,
    ):
        resp = await client.get(
            f"{QUEUE_BASE.format(event_id=event.id)}/rooms/{uuid.uuid4()}",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        assert resp.json() == []


class TestQueueAdd:
    async def test_add_entry_to_queue(
        self,
        client: AsyncClient,
        event: Event,
        session_obj: Session,
        session_speaker: SessionSpeaker,
        approved_file: PresentationFile,
        organizer: User,
    ):
        resp = await client.post(
            f"{QUEUE_BASE.format(event_id=event.id)}/sessions/{session_obj.id}/entries",
            json={
                "session_speaker_id": str(session_speaker.id),
                "file_id": str(approved_file.id),
                "queue_order": 0,
            },
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "queued"

    async def test_add_unapproved_file_rejected(
        self,
        client: AsyncClient,
        event: Event,
        session_obj: Session,
        session_speaker: SessionSpeaker,
        db: AsyncSession,
        organizer: User,
        speaker: Speaker,
    ):
        # Create a pending file
        pending_file = PresentationFile(
            speaker_id=speaker.id,
            session_speaker_id=session_speaker.id,
            event_id=event.id,
            original_filename="pending.pptx",
            stored_filename=f"{uuid.uuid4()}.pptx",
            storage_path=f"presentations/{event.id}/{uuid.uuid4()}.pptx",
            file_size_bytes=5_242_880,
            mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            file_format="pptx",
            upload_status="pending_validation",
            upload_source="web",
            version_number=1,
            is_current_version=True,
        )
        db.add(pending_file)
        await db.flush()

        resp = await client.post(
            f"{QUEUE_BASE.format(event_id=event.id)}/sessions/{session_obj.id}/entries",
            json={
                "session_speaker_id": str(session_speaker.id),
                "file_id": str(pending_file.id),
                "queue_order": 0,
            },
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 409

    async def test_add_duplicate_entry_rejected(
        self,
        client: AsyncClient,
        event: Event,
        session_obj: Session,
        session_speaker: SessionSpeaker,
        approved_file: PresentationFile,
        organizer: User,
    ):
        payload = {
            "session_speaker_id": str(session_speaker.id),
            "file_id": str(approved_file.id),
            "queue_order": 0,
        }
        r1 = await client.post(
            f"{QUEUE_BASE.format(event_id=event.id)}/sessions/{session_obj.id}/entries",
            json=payload, headers=auth_headers(organizer),
        )
        assert r1.status_code == 201
        r2 = await client.post(
            f"{QUEUE_BASE.format(event_id=event.id)}/sessions/{session_obj.id}/entries",
            json=payload, headers=auth_headers(organizer),
        )
        assert r2.status_code == 409


class TestQueueStatusMachine:
    async def test_queued_to_active(
        self,
        client: AsyncClient,
        event: Event,
        queue_entry: PresentationQueue,
        organizer: User,
    ):
        resp = await client.patch(
            f"{QUEUE_BASE.format(event_id=event.id)}/entries/{queue_entry.id}/status",
            json={"status": "active"},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "active"
        assert data["started_at"] is not None

    async def test_active_to_completed(
        self,
        client: AsyncClient,
        event: Event,
        queue_entry: PresentationQueue,
        organizer: User,
    ):
        # Set to active first
        await client.patch(
            f"{QUEUE_BASE.format(event_id=event.id)}/entries/{queue_entry.id}/status",
            json={"status": "active"},
            headers=auth_headers(organizer),
        )
        # Complete
        resp = await client.patch(
            f"{QUEUE_BASE.format(event_id=event.id)}/entries/{queue_entry.id}/status",
            json={"status": "completed"},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "completed"
        assert data["ended_at"] is not None

    async def test_invalid_transition_rejected(
        self,
        client: AsyncClient,
        event: Event,
        queue_entry: PresentationQueue,
        organizer: User,
    ):
        # Can't go directly from queued to completed
        resp = await client.patch(
            f"{QUEUE_BASE.format(event_id=event.id)}/entries/{queue_entry.id}/status",
            json={"status": "completed"},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 409

    async def test_skip_entry(
        self,
        client: AsyncClient,
        event: Event,
        queue_entry: PresentationQueue,
        organizer: User,
    ):
        resp = await client.patch(
            f"{QUEUE_BASE.format(event_id=event.id)}/entries/{queue_entry.id}/status",
            json={"status": "skipped"},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "skipped"


class TestQueueManagement:
    async def test_remove_queued_entry(
        self,
        client: AsyncClient,
        event: Event,
        queue_entry: PresentationQueue,
        organizer: User,
    ):
        resp = await client.delete(
            f"{QUEUE_BASE.format(event_id=event.id)}/entries/{queue_entry.id}",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200

    async def test_cannot_remove_active_entry(
        self,
        client: AsyncClient,
        event: Event,
        queue_entry: PresentationQueue,
        organizer: User,
    ):
        await client.patch(
            f"{QUEUE_BASE.format(event_id=event.id)}/entries/{queue_entry.id}/status",
            json={"status": "active"},
            headers=auth_headers(organizer),
        )
        resp = await client.delete(
            f"{QUEUE_BASE.format(event_id=event.id)}/entries/{queue_entry.id}",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 409

    async def test_reorder_queue(
        self,
        client: AsyncClient,
        event: Event,
        session_obj: Session,
        queue_entry: PresentationQueue,
        organizer: User,
    ):
        resp = await client.post(
            f"{QUEUE_BASE.format(event_id=event.id)}/sessions/{session_obj.id}/reorder",
            json={"ordered_entry_ids": [str(queue_entry.id)]},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
