# =============================================================
# Conference Platform — Events Tests
# backend/tests/test_events.py
#
# Tests cover:
#   - Event model invariants (field constraints, computed values)
#   - Event service-level operations (to be extended when router is built)
#   - Organization scoping (events isolated per org)
#   - Status transitions
#   - Date validation logic
# =============================================================

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.organization import Organization
from app.models.room import Room
from app.models.session import Session
from app.models.speaker import Speaker
from app.models.user import User


# ── Event model tests ─────────────────────────────────────────

class TestEventModel:

    @pytest.mark.asyncio
    async def test_event_created_with_correct_fields(self, db: AsyncSession, event: Event):
        result = await db.execute(select(Event).where(Event.id == event.id))
        fetched = result.scalar_one()

        assert fetched.name == "Test Conference 2026"
        assert fetched.status == "draft"
        assert fetched.max_file_size_mb == 500
        assert "pptx" in fetched.allowed_formats
        assert fetched.timezone == "UTC"

    @pytest.mark.asyncio
    async def test_event_short_code_is_unique(self, db: AsyncSession, organization: Organization, organizer: User):
        """Two events with the same short_code must fail at DB level."""
        short_code = f"UNIQ{uuid.uuid4().hex[:4].upper()}"
        ev1 = Event(
            organization_id=organization.id,
            created_by=organizer.id,
            name="Event One",
            short_code=short_code,
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 3),
            timezone="UTC",
        )
        ev2 = Event(
            organization_id=organization.id,
            created_by=organizer.id,
            name="Event Two",
            short_code=short_code,  # duplicate
            start_date=date(2026, 10, 1),
            end_date=date(2026, 10, 3),
            timezone="UTC",
        )
        db.add(ev1)
        await db.flush()
        db.add(ev2)

        from sqlalchemy.exc import IntegrityError
        with pytest.raises(IntegrityError):
            await db.flush()

    @pytest.mark.asyncio
    async def test_event_default_status_is_draft(self, db: AsyncSession, organization: Organization, organizer: User):
        ev = Event(
            organization_id=organization.id,
            created_by=organizer.id,
            name="New Event",
            short_code=f"NE{uuid.uuid4().hex[:6].upper()}",
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 2),
            timezone="UTC",
        )
        db.add(ev)
        await db.flush()
        assert ev.status == "draft"

    @pytest.mark.asyncio
    async def test_event_status_transition(self, db: AsyncSession, event: Event):
        event.status = "active"
        await db.flush()
        await db.refresh(event)
        assert event.status == "active"

    @pytest.mark.asyncio
    async def test_event_allowed_formats_default(self, db: AsyncSession, organization: Organization, organizer: User):
        ev = Event(
            organization_id=organization.id,
            created_by=organizer.id,
            name="Format Test",
            short_code=f"FT{uuid.uuid4().hex[:6].upper()}",
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 2),
            timezone="UTC",
        )
        db.add(ev)
        await db.flush()
        assert isinstance(ev.allowed_formats, list)
        assert "pptx" in ev.allowed_formats

    @pytest.mark.asyncio
    async def test_event_created_at_is_set_automatically(self, db: AsyncSession, event: Event):
        assert event.created_at is not None
        assert isinstance(event.created_at, datetime)

    @pytest.mark.asyncio
    async def test_event_updated_at_changes_on_update(self, db: AsyncSession, event: Event):
        original_updated = event.updated_at
        event.name = "Updated Name"
        await db.flush()
        await db.refresh(event)
        # updated_at should be >= original (onupdate triggers)
        assert event.updated_at >= original_updated


# ── Org scoping tests ─────────────────────────────────────────

class TestEventOrgScoping:

    @pytest.mark.asyncio
    async def test_event_belongs_to_org(self, db: AsyncSession, event: Event, organization: Organization):
        assert event.organization_id == organization.id

    @pytest.mark.asyncio
    async def test_event_not_visible_to_other_org(self, db: AsyncSession, event: Event):
        """Events should only be returned for the correct org."""
        other_org_id = uuid.uuid4()
        result = await db.execute(
            select(Event).where(
                Event.id == event.id,
                Event.organization_id == other_org_id,  # wrong org
            )
        )
        assert result.scalar_one_or_none() is None

    @pytest.mark.asyncio
    async def test_list_events_scoped_to_org(
        self,
        db: AsyncSession,
        event: Event,
        organization: Organization,
    ):
        result = await db.execute(
            select(Event).where(Event.organization_id == organization.id)
        )
        events = result.scalars().all()
        assert any(e.id == event.id for e in events)


# ── Room cascade tests ────────────────────────────────────────

class TestEventCascades:

    @pytest.mark.asyncio
    async def test_room_belongs_to_event(self, db: AsyncSession, room: Room, event: Event):
        assert room.event_id == event.id

    @pytest.mark.asyncio
    async def test_session_belongs_to_event(self, db: AsyncSession, session_obj: Session, event: Event):
        assert session_obj.event_id == event.id

    @pytest.mark.asyncio
    async def test_session_duration_minutes(self, db: AsyncSession, session_obj: Session):
        assert session_obj.duration_minutes == 60

    @pytest.mark.asyncio
    async def test_session_status_default(self, db: AsyncSession, session_obj: Session):
        assert session_obj.status == "scheduled"

    @pytest.mark.asyncio
    async def test_multiple_rooms_per_event(self, db: AsyncSession, event: Event):
        room_b = Room(
            event_id=event.id,
            name="Hall B",
            room_type="workshop",
            is_active=True,
        )
        room_c = Room(
            event_id=event.id,
            name="Hall C",
            room_type="poster",
            is_active=True,
        )
        db.add_all([room_b, room_c])
        await db.flush()

        result = await db.execute(
            select(Room).where(Room.event_id == event.id)
        )
        rooms = result.scalars().all()
        assert len(rooms) >= 3  # Hall A + B + C (from fixtures)


# ── Speaker tests ─────────────────────────────────────────────

class TestSpeakerModel:

    @pytest.mark.asyncio
    async def test_speaker_full_name_property(self, db: AsyncSession, speaker: Speaker):
        assert speaker.full_name == "Alice Smith"

    @pytest.mark.asyncio
    async def test_speaker_default_upload_status(self, db: AsyncSession, speaker: Speaker):
        assert speaker.upload_status == "pending"

    @pytest.mark.asyncio
    async def test_speaker_current_file_none_by_default(self, db: AsyncSession, speaker: Speaker):
        assert speaker.current_file is None

    @pytest.mark.asyncio
    async def test_speaker_belongs_to_event(self, db: AsyncSession, speaker: Speaker, event: Event):
        assert speaker.event_id == event.id

    @pytest.mark.asyncio
    async def test_speaker_upload_token_is_hashed(self, db: AsyncSession, speaker: Speaker):
        """Upload token stored in DB must be the hash, not the plain token."""
        import hashlib
        plain = speaker._plain_token
        expected_hash = hashlib.sha256(plain.encode()).hexdigest()
        assert speaker.upload_token == expected_hash
        assert speaker.upload_token != plain

    @pytest.mark.asyncio
    async def test_multiple_speakers_per_event(self, db: AsyncSession, event: Event, speaker: Speaker):
        import hashlib
        plain2 = str(uuid.uuid4())
        hash2 = hashlib.sha256(plain2.encode()).hexdigest()
        sp2 = Speaker(
            event_id=event.id,
            first_name="Bob",
            last_name="Jones",
            email=f"bob-{uuid.uuid4().hex[:6]}@example.com",
            upload_token=hash2,
            upload_status="pending",
        )
        db.add(sp2)
        await db.flush()

        result = await db.execute(
            select(Speaker).where(Speaker.event_id == event.id)
        )
        speakers = result.scalars().all()
        assert len(speakers) >= 2
