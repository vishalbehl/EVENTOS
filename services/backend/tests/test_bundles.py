from __future__ import annotations

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.events.models.session_speaker import SessionSpeaker
from app.modules.identity.models.user import User
from tests.conftest import activate_event_for_test, auth_headers


BASE = "/events/{event_id}/bundles"


async def _file(
    db: AsyncSession,
    event: Event,
    session_speaker: SessionSpeaker,
    name: str,
    order: int,
) -> PresentationFile:
    file = PresentationFile(
        speaker_id=session_speaker.speaker_id,
        session_speaker_id=session_speaker.id,
        event_id=event.id,
        original_filename=name,
        stored_filename=f"{uuid.uuid4()}.pptx",
        storage_path=f"presentations/{event.id}/{name}",
        file_size_bytes=100,
        mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        file_format="pptx",
        version_number=order + 1,
        is_current_version=order == 0,
        upload_status="approved",
    )
    db.add(file)
    await db.flush()
    return file


class TestPresentationBundles:
    async def test_bundle_creation_and_file_ordering(
        self,
        client: AsyncClient,
        db: AsyncSession,
        event: Event,
        organizer: User,
        session_speaker: SessionSpeaker,
    ):
        await activate_event_for_test(db, event)
        first = await _file(db, event, session_speaker, "part-1.pptx", 0)
        second = await _file(db, event, session_speaker, "part-2.pptx", 1)

        resp = await client.post(
            BASE.format(event_id=event.id),
            json={
                "session_speaker_id": str(session_speaker.id),
                "name": "Keynote bundle",
                "chain_mode": "sequential",
                "files": [
                    {"file_id": str(second.id), "deck_order": 2},
                    {"file_id": str(first.id), "deck_order": 1, "is_primary": True},
                ],
            },
            headers=auth_headers(organizer),
        )

        assert resp.status_code == 201
        data = resp.json()
        assert data["chain_mode"] == "sequential"
        assert [item["file_id"] for item in data["files"]] == [str(first.id), str(second.id)]
        assert data["files"][0]["is_primary"] is True

    async def test_bundle_rejects_files_from_other_slot(
        self,
        client: AsyncClient,
        db: AsyncSession,
        event: Event,
        organizer: User,
        session_speaker: SessionSpeaker,
    ):
        await activate_event_for_test(db, event)
        other_slot = SessionSpeaker(
            session_id=session_speaker.session_id,
            speaker_id=session_speaker.speaker_id,
            presentation_title="Other talk",
            talk_order=1,
        )
        db.add(other_slot)
        await db.flush()
        wrong_file = await _file(db, event, other_slot, "wrong.pptx", 0)

        resp = await client.post(
            BASE.format(event_id=event.id),
            json={
                "session_speaker_id": str(session_speaker.id),
                "name": "Bad bundle",
                "files": [{"file_id": str(wrong_file.id), "deck_order": 0}],
            },
            headers=auth_headers(organizer),
        )

        assert resp.status_code == 400
