from __future__ import annotations

import uuid

from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.identity.models.user import User
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.schemas.cursor_pagination import decode_cursor, encode_cursor


class UserQueryService:
    """Tenant-aware read boundary for user and assignment views."""

    @staticmethod
    def _options():
        return (selectinload(User.assignments).selectinload(UserEventAssignment.event),)

    async def list_users(self, *, actor: User, role: str | None = None, limit: int = 100) -> list[User]:
        bounded = max(1, min(int(limit), 100))
        query = select(User).options(*self._options()).order_by(User.created_at.desc(), User.id.desc()).limit(bounded)
        if role:
            query = query.where(User.role == role)
        if actor.role != "super_admin":
            query = query.where(
                User.organization_id == actor.organization_id,
                User.role.in_([
                    "admin", "registration_manager", "registration_coordinator",
                    "registration_reviewer", "badge_manager", "checkin_staff",
                    "registration_viewer", "speaker_manager", "session_manager",
                    "room_manager", "venue_operator", "technician", "volunteer", "viewer",
                ]),
            )
        return list((await self.db.scalars(query)).all())

    async def cursor_users(self, *, actor: User, cursor: str | None = None, role: str | None = None, limit: int = 50) -> dict:
        bounded = max(1, min(int(limit), 100))
        query = select(User).options(*self._options())
        if role:
            query = query.where(User.role == role)
        if actor.role != "super_admin":
            query = query.where(User.organization_id == actor.organization_id, User.role.in_([
                "admin", "registration_manager", "registration_coordinator", "registration_reviewer",
                "badge_manager", "checkin_staff", "registration_viewer", "speaker_manager",
                "session_manager", "room_manager", "venue_operator", "technician", "volunteer", "viewer",
            ]))
        if cursor:
            position = decode_cursor(cursor)
            query = query.where(or_(User.created_at < position.occurred_at, and_(User.created_at == position.occurred_at, User.id < position.record_id)))
        rows = list((await self.db.scalars(query.order_by(User.created_at.desc(), User.id.desc()).limit(bounded + 1))).all())
        has_next = len(rows) > bounded
        rows = rows[:bounded]
        next_cursor = encode_cursor(rows[-1].created_at, rows[-1].id) if has_next and rows else None
        return {"items": rows, "next_cursor": next_cursor, "has_next": has_next}

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, *, user_id: uuid.UUID, actor: User) -> User | None:
        query = select(User).options(*self._options()).where(User.id == user_id)
        if actor.role != "super_admin":
            query = query.where(User.organization_id == actor.organization_id)
        return await self.db.scalar(query)

    async def assignment_context(self, *, assignment_id: uuid.UUID, actor: User):
        from app.modules.events.models.event import Event

        row = await self.db.execute(
            select(UserEventAssignment, User, Event)
            .join(User, User.id == UserEventAssignment.user_id)
            .join(Event, Event.id == UserEventAssignment.event_id)
            .where(
                UserEventAssignment.id == assignment_id,
                User.organization_id == Event.organization_id,
                *(() if actor.role == "super_admin" else (User.organization_id == actor.organization_id,)),
            )
        )
        return row.one_or_none()
