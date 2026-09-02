"""Transaction-owning capacity-rule commands."""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.agenda.models import Room, Session
from app.modules.events.models.capacity_rule import CapacityRule


class CapacityRuleCommandService:
    """Validate event-owned targets and own capacity-rule transactions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _validate_targets(
        self,
        *,
        event_id: uuid.UUID,
        session_id: uuid.UUID | None,
        room_id: uuid.UUID | None,
    ) -> None:
        if session_id is not None:
            session = await self.db.scalar(
                select(Session.id).where(Session.id == session_id, Session.event_id == event_id)
            )
            if session is None:
                raise HTTPException(status_code=404, detail="Session not found for this event")
        if room_id is not None:
            room = await self.db.scalar(
                select(Room.id).where(Room.id == room_id, Room.event_id == event_id)
            )
            if room is None:
                raise HTTPException(status_code=404, detail="Room not found for this event")

    async def create(self, *, event_id: uuid.UUID, data: dict) -> CapacityRule:
        session_id = data.get("session_id")
        room_id = data.get("room_id")
        await self._validate_targets(event_id=event_id, session_id=session_id, room_id=room_id)
        duplicate = await self.db.scalar(
            select(CapacityRule).where(
                CapacityRule.event_id == event_id,
                CapacityRule.session_id == session_id,
                CapacityRule.room_id == room_id,
            )
        )
        if duplicate:
            raise HTTPException(status_code=400, detail="Capacity rule already exists for this target.")
        rule = CapacityRule(event_id=event_id, **data)
        self.db.add(rule)
        await self.db.commit()
        await self.db.refresh(rule)
        return rule

    async def update(
        self,
        *,
        event_id: uuid.UUID,
        rule_id: uuid.UUID,
        data: dict,
    ) -> CapacityRule:
        rule = await self.db.scalar(
            select(CapacityRule)
            .where(CapacityRule.id == rule_id, CapacityRule.event_id == event_id)
            .with_for_update()
        )
        if rule is None:
            raise HTTPException(status_code=404, detail="Capacity rule not found")
        await self._validate_targets(
            event_id=event_id,
            session_id=data.get("session_id", rule.session_id),
            room_id=data.get("room_id", rule.room_id),
        )
        for field, value in data.items():
            setattr(rule, field, value)
        await self.db.commit()
        await self.db.refresh(rule)
        return rule
