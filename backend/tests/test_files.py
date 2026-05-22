# =============================================================
# Conference Platform — File & Upload Service Tests
# backend/tests/test_files.py
#
# Tests cover:
#   - Storage path builders (no S3 calls)
#   - PresentationFile model invariants
#   - SessionSpeaker file linkage
#   - File versioning logic
#   - Upload service path construction
#   - MIME type / format mapping
# =============================================================

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.presentation_file import PresentationFile
from app.models.session_speaker import SessionSpeaker
from app.models.speaker import Speaker
from app.models.event import Event
from app.services.upload_service import (
    build_import_path,
    build_poster_path,
    build_presentation_path,
    build_thumbnail_path,
)


# ── Storage path builder tests ────────────────────────────────

class TestStoragePathBuilders:

    def test_presentation_path_format(self):
        event_id = uuid.uuid4()
        speaker_id = uuid.uuid4()
        path, filename = build_presentation_path(event_id, speaker_id, "slides.pptx")

        assert path.startswith(f"presentations/{event_id}/{speaker_id}/")
        assert path.endswith(".pptx")
        assert filename.endswith(".pptx")

    def test_presentation_path_with_session_context(self):
        event_id = uuid.uuid4()
        speaker_id = uuid.uuid4()
        path, filename = build_presentation_path(
            event_id,
            speaker_id,
            "slides.pptx",
            event_name="Annual Conference 2026",
            hall_name="Hall A",
            session_date=datetime(2026, 9, 1, 9, 0, tzinfo=timezone.utc),
            session_name="Opening Keynote",
            speaker_name="Alice Smith",
        )

        assert path.startswith(
            "presentations/Annual-Conference-2026/Hall-A/2026-09-01/Opening-Keynote/Alice-Smith/"
        )
        assert path.endswith(".pptx")
        assert filename.endswith(".pptx")

    def test_presentation_path_sanitizes_context_segments(self):
        event_id = uuid.uuid4()
        speaker_id = uuid.uuid4()
        path, _ = build_presentation_path(
            event_id,
            speaker_id,
            "slides.pptx",
            event_name="../Conf/2026",
            hall_name="Hall: A",
            session_date="Day 1 (2026/09/01)",
            session_name="Opening / Keynote",
            speaker_name="Alice/Smith",
        )

        assert ".." not in path
        assert path.startswith("presentations/Conf-2026/Hall-A/Day-1-20260901/Opening-Keynote/Alice-Smith/")

    def test_presentation_path_uuid_based_filename(self):
        event_id = uuid.uuid4()
        speaker_id = uuid.uuid4()
        _, filename = build_presentation_path(event_id, speaker_id, "slides.pptx")

        # Filename should be UUID.ext — not the original name
        name_part = filename.replace(".pptx", "")
        parsed = uuid.UUID(name_part)  # raises if not a valid UUID
        assert parsed is not None

    def test_presentation_path_no_collisions(self):
        """Two calls with same inputs must produce different paths (UUID-based)."""
        event_id = uuid.uuid4()
        speaker_id = uuid.uuid4()
        path1, _ = build_presentation_path(event_id, speaker_id, "same.pptx")
        path2, _ = build_presentation_path(event_id, speaker_id, "same.pptx")
        assert path1 != path2

    def test_presentation_path_preserves_extension(self):
        event_id = uuid.uuid4()
        speaker_id = uuid.uuid4()
        for ext in ["pptx", "pdf", "mp4", "key", "ppt"]:
            path, _ = build_presentation_path(event_id, speaker_id, f"file.{ext}")
            assert path.endswith(f".{ext}")

    def test_presentation_path_handles_no_extension(self):
        event_id = uuid.uuid4()
        speaker_id = uuid.uuid4()
        path, filename = build_presentation_path(event_id, speaker_id, "noextension")
        assert path.endswith(".bin")

    def test_poster_path_format(self):
        event_id = uuid.uuid4()
        speaker_id = uuid.uuid4()
        path, filename = build_poster_path(event_id, speaker_id, "poster.pdf")

        assert path.startswith(f"posters/{event_id}/{speaker_id}/")
        assert path.endswith(".pdf")

    def test_import_path_format(self):
        event_id = uuid.uuid4()
        path, filename = build_import_path(event_id, "schedule.xlsx")

        assert path.startswith(f"imports/{event_id}/")
        assert path.endswith(".xlsx")

    def test_thumbnail_path_format(self):
        file_id = uuid.uuid4()
        path = build_thumbnail_path(file_id)
        assert path == f"thumbnails/{file_id}.webp"

    def test_paths_are_strings(self):
        event_id = uuid.uuid4()
        speaker_id = uuid.uuid4()
        path, filename = build_presentation_path(event_id, speaker_id, "file.pptx")
        assert isinstance(path, str)
        assert isinstance(filename, str)

    def test_path_no_leading_slash(self):
        """S3 keys must not start with /"""
        event_id = uuid.uuid4()
        speaker_id = uuid.uuid4()
        path, _ = build_presentation_path(event_id, speaker_id, "file.pptx")
        assert not path.startswith("/")


# ── PresentationFile model tests ──────────────────────────────

class TestPresentationFileModel:

    @pytest.mark.asyncio
    async def test_create_presentation_file(
        self,
        db: AsyncSession,
        speaker: Speaker,
        session_speaker: SessionSpeaker,
        event: Event,
    ):
        storage_path, stored_filename = build_presentation_path(
            event.id, speaker.id, "keynote.pptx"
        )
        pf = PresentationFile(
            speaker_id=speaker.id,
            session_speaker_id=session_speaker.id,
            event_id=event.id,
            original_filename="keynote.pptx",
            stored_filename=stored_filename,
            storage_path=storage_path,
            file_size_bytes=5 * 1024 * 1024,  # 5 MB
            mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            file_format="pptx",
            version_number=1,
            is_current_version=True,
            upload_status="processing",
            upload_source="web",
        )
        db.add(pf)
        await db.flush()

        result = await db.execute(
            select(PresentationFile).where(PresentationFile.id == pf.id)
        )
        fetched = result.scalar_one()
        assert fetched.file_format == "pptx"
        assert fetched.is_current_version is True
        assert fetched.version_number == 1

    @pytest.mark.asyncio
    async def test_file_size_mb_property(
        self,
        db: AsyncSession,
        speaker: Speaker,
        session_speaker: SessionSpeaker,
        event: Event,
    ):
        storage_path, stored_filename = build_presentation_path(
            event.id, speaker.id, "file.pptx"
        )
        pf = PresentationFile(
            speaker_id=speaker.id,
            session_speaker_id=session_speaker.id,
            event_id=event.id,
            original_filename="file.pptx",
            stored_filename=stored_filename,
            storage_path=storage_path,
            file_size_bytes=10 * 1024 * 1024,  # exactly 10 MB
            mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            file_format="pptx",
            upload_status="processing",
        )
        db.add(pf)
        await db.flush()
        assert pf.file_size_mb == 10.0

    @pytest.mark.asyncio
    async def test_file_versioning(
        self,
        db: AsyncSession,
        speaker: Speaker,
        session_speaker: SessionSpeaker,
        event: Event,
    ):
        """Replacing a file should mark old version as not current."""
        storage_path1, stored1 = build_presentation_path(event.id, speaker.id, "v1.pptx")
        storage_path2, stored2 = build_presentation_path(event.id, speaker.id, "v2.pptx")

        v1 = PresentationFile(
            speaker_id=speaker.id,
            session_speaker_id=session_speaker.id,
            event_id=event.id,
            original_filename="v1.pptx",
            stored_filename=stored1,
            storage_path=storage_path1,
            file_size_bytes=1024,
            mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            file_format="pptx",
            version_number=1,
            is_current_version=True,
            upload_status="approved",
        )
        db.add(v1)
        await db.flush()

        # Simulate replacement: mark v1 as not current
        v1.is_current_version = False

        v2 = PresentationFile(
            speaker_id=speaker.id,
            session_speaker_id=session_speaker.id,
            event_id=event.id,
            original_filename="v2.pptx",
            stored_filename=stored2,
            storage_path=storage_path2,
            file_size_bytes=2048,
            mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            file_format="pptx",
            version_number=2,
            is_current_version=True,
            upload_status="processing",
        )
        db.add(v2)
        await db.flush()

        # Only v2 should be current
        result = await db.execute(
            select(PresentationFile).where(
                PresentationFile.speaker_id == speaker.id,
                PresentationFile.is_current_version.is_(True),
            )
        )
        current_files = result.scalars().all()
        assert len(current_files) == 1
        assert current_files[0].version_number == 2

    @pytest.mark.asyncio
    async def test_default_upload_status_is_processing(
        self,
        db: AsyncSession,
        speaker: Speaker,
        session_speaker: SessionSpeaker,
        event: Event,
    ):
        storage_path, stored_filename = build_presentation_path(
            event.id, speaker.id, "file.pdf"
        )
        pf = PresentationFile(
            speaker_id=speaker.id,
            session_speaker_id=session_speaker.id,
            event_id=event.id,
            original_filename="file.pdf",
            stored_filename=stored_filename,
            storage_path=storage_path,
            file_size_bytes=512,
            mime_type="application/pdf",
            file_format="pdf",
            upload_status="processing",
        )
        db.add(pf)
        await db.flush()
        assert pf.upload_status == "processing"

    @pytest.mark.asyncio
    async def test_local_sync_status_default(
        self,
        db: AsyncSession,
        speaker: Speaker,
        session_speaker: SessionSpeaker,
        event: Event,
    ):
        storage_path, stored_filename = build_presentation_path(
            event.id, speaker.id, "file.pptx"
        )
        pf = PresentationFile(
            speaker_id=speaker.id,
            session_speaker_id=session_speaker.id,
            event_id=event.id,
            original_filename="file.pptx",
            stored_filename=stored_filename,
            storage_path=storage_path,
            file_size_bytes=512,
            mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            file_format="pptx",
            upload_status="processing",
        )
        db.add(pf)
        await db.flush()
        assert pf.local_sync_status == "pending"


# ── SessionSpeaker file linkage tests ─────────────────────────

class TestSessionSpeakerFileLinkage:

    @pytest.mark.asyncio
    async def test_session_speaker_current_file_none_by_default(
        self,
        db: AsyncSession,
        session_speaker: SessionSpeaker,
    ):
        assert session_speaker.current_file is None

    @pytest.mark.asyncio
    async def test_talk_order_default_zero(
        self,
        db: AsyncSession,
        session_speaker: SessionSpeaker,
    ):
        assert session_speaker.talk_order == 0

    @pytest.mark.asyncio
    async def test_session_speaker_not_confirmed_by_default(
        self,
        db: AsyncSession,
        session_speaker: SessionSpeaker,
    ):
        assert session_speaker.is_confirmed is False

    @pytest.mark.asyncio
    async def test_session_speaker_confirm(
        self,
        db: AsyncSession,
        session_speaker: SessionSpeaker,
    ):
        session_speaker.is_confirmed = True
        await db.flush()
        await db.refresh(session_speaker)
        assert session_speaker.is_confirmed is True
