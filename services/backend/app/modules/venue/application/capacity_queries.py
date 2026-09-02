"""Read-only capacity status queries for an event."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.agenda.models import Room, Session
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.registration.models.check_in import CheckIn
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.venue.schemas.capacity import CapacityStatusResponse


class CapacityQueryService:
    """Build capacity status with bounded, explicit, read-only queries."""

    MAX_RULES = 500

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_status(
        self,
        *,
        event_id: uuid.UUID,
        event_name: str,
    ) -> list[CapacityStatusResponse]:
        rules = (
            await self.db.execute(
                select(
                    CapacityRule.id,
                    CapacityRule.session_id,
                    CapacityRule.room_id,
                    CapacityRule.capacity,
                )
                .where(CapacityRule.event_id == event_id)
                .order_by(CapacityRule.id)
                .limit(self.MAX_RULES)
            )
        ).all()

        session_ids = {row.session_id for row in rules if row.session_id is not None}
        room_ids = {row.room_id for row in rules if row.room_id is not None}

        sessions = {}
        if session_ids:
            sessions = dict(
                (
                    row.id,
                    row,
                )
                for row in (
                    await self.db.execute(
                        select(Session.id, Session.name)
                        .where(
                            Session.event_id == event_id,
                            Session.id.in_(session_ids),
                        )
                    )
                ).all()
            )

        rooms = {}
        if room_ids:
            rooms = dict(
                (row.id, row)
                for row in (
                    await self.db.execute(
                        select(Room.id, Room.name)
                        .where(Room.event_id == event_id, Room.id.in_(room_ids))
                    )
                ).all()
            )

        session_occupancy = {}
        if session_ids:
            session_occupancy = dict(
                (
                    row.session_id,
                    int(row.occupancy or 0),
                )
                for row in (
                    await self.db.execute(
                        select(CheckIn.session_id, func.count(CheckIn.id).label("occupancy"))
                        .where(
                            CheckIn.event_id == event_id,
                            CheckIn.session_id.in_(session_ids),
                        )
                        .group_by(CheckIn.session_id)
                    )
                ).all()
            )

        room_occupancy = {}
        if room_ids:
            room_occupancy = dict(
                (
                    row.room_id,
                    int(row.occupancy or 0),
                )
                for row in (
                    await self.db.execute(
                        select(
                            Session.room_id,
                            func.count(CheckIn.id).label("occupancy"),
                        )
                        .join(CheckIn, CheckIn.session_id == Session.id)
                        .where(
                            Session.event_id == event_id,
                            Session.room_id.in_(room_ids),
                            CheckIn.event_id == event_id,
                        )
                        .group_by(Session.room_id)
                    )
                ).all()
            )

        event_occupancy = int(
            (
                await self.db.scalar(
                    select(func.count(Participant.id)).where(
                        Participant.event_id == event_id
                    )
                )
            )
            or 0
        )
        event_waitlist = int(
            (
                await self.db.scalar(
                    select(func.count(ParticipantRegistration.id)).where(
                        ParticipantRegistration.event_id == event_id,
                        ParticipantRegistration.registration_status == "waitlisted",
                    )
                )
            )
            or 0
        )

        response: list[CapacityStatusResponse] = []
        for rule in rules:
            if rule.session_id is None and rule.room_id is None:
                level = "event"
                target_id = event_id
                target_name = event_name
                occupancy = event_occupancy
                waitlist_count = event_waitlist
            elif rule.session_id is not None:
                session = sessions.get(rule.session_id)
                if session is None:
                    continue
                level = "session"
                target_id = session.id
                target_name = session.name
                occupancy = session_occupancy.get(session.id, 0)
                waitlist_count = 0
            else:
                room = rooms.get(rule.room_id)
                if room is None:
                    continue
                level = "room"
                target_id = room.id
                target_name = room.name
                occupancy = room_occupancy.get(room.id, 0)
                waitlist_count = 0

            response.append(
                CapacityStatusResponse(
                    id=rule.id,
                    level=level,
                    target_id=target_id,
                    target_name=target_name,
                    capacity=rule.capacity,
                    current_occupancy=occupancy,
                    waitlist_count=waitlist_count,
                    occupancy_rate=(
                        float(occupancy / rule.capacity)
                        if rule.capacity > 0
                        else 0.0
                    ),
                )
            )
        return response
