import uuid
from typing import List, Optional
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.agenda.models.session import Session
from app.modules.agenda.models.session_person import SessionPerson
from app.modules.agenda.models.agenda_conflict import AgendaConflict


class ConflictService:
    @staticmethod
    async def scan_event_conflicts(db: AsyncSession, event_id: uuid.UUID) -> List[AgendaConflict]:
        """
        Scans all scheduled sessions in an event for:
        1. Room Overlaps (same room, overlapping time window)
        2. Speaker/Faculty Overlaps (same speaker assigned to overlapping sessions)
        """
        # Fetch active sessions with relationships
        q = (
            select(Session)
            .options(
                selectinload(Session.session_people),
                selectinload(Session.room)
            )
            .where(
                Session.event_id == event_id,
                Session.deleted_at.is_(None)
            )
            .order_by(Session.start_time)
        )
        result = await db.execute(q)
        sessions = result.scalars().all()

        detected_conflicts: List[AgendaConflict] = []

        for i, s1 in enumerate(sessions):
            for s2 in sessions[i + 1:]:
                # Check for time overlap
                overlap = (s1.start_time < s2.end_time) and (s1.end_time > s2.start_time)
                if not overlap:
                    continue

                # 1. Room Conflict
                if s1.room_id and s2.room_id and s1.room_id == s2.room_id:
                    room_name = s1.room.name if s1.room else "Room"
                    conflict = AgendaConflict(
                        id=uuid.uuid4(),
                        event_id=event_id,
                        agenda_id=s1.agenda_id,
                        session_id=s1.id,
                        conflict_type="ROOM_CONFLICT",
                        severity="critical",
                        related_session_id=s2.id,
                        related_room_id=s1.room_id,
                        message=f"Room collision in '{room_name}': '{s1.title}' overlaps with '{s2.title}'."
                    )
                    detected_conflicts.append(conflict)

                # 2. Speaker / Faculty Conflict
                s1_speakers = {p.speaker_id for p in s1.session_people if p.speaker_id}
                s2_speakers = {p.speaker_id for p in s2.session_people if p.speaker_id}
                shared_speakers = s1_speakers.intersection(s2_speakers)
                for sp_id in shared_speakers:
                    conflict = AgendaConflict(
                        id=uuid.uuid4(),
                        event_id=event_id,
                        agenda_id=s1.agenda_id,
                        session_id=s1.id,
                        conflict_type="SPEAKER_CONFLICT",
                        severity="warning",
                        related_session_id=s2.id,
                        related_person_id=sp_id,
                        message=f"Faculty double-booking: Faculty member is scheduled simultaneously in '{s1.title}' and '{s2.title}'."
                    )
                    detected_conflicts.append(conflict)

        return detected_conflicts
