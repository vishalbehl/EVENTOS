"""Bounded related assignment projection for an already-authorised member page."""
from fastapi import HTTPException
from sqlalchemy import select

from app.modules.events.models.event import Event
from app.modules.rbac.models.user_assignment import UserEventAssignment

MAX_ASSIGNMENTS = 5000


async def member_event_assignments(db, organization_id, user_ids):
    subjects = set(user_ids)
    if len(subjects) > 100:
        raise HTTPException(422, detail={"code": "INVALID_PAGE_SIZE"})
    if not subjects:
        return {}
    rows = (await db.execute(select(UserEventAssignment.user_id, UserEventAssignment.event_id)
        .join(Event, Event.id == UserEventAssignment.event_id)
        .where(UserEventAssignment.user_id.in_(subjects), Event.organization_id == organization_id,
               Event.deleted_at.is_(None))
        .order_by(UserEventAssignment.user_id, UserEventAssignment.event_id)
        .limit(MAX_ASSIGNMENTS + 1))).all()
    if len(rows) > MAX_ASSIGNMENTS:
        # Never return partial assignments that a UI might mistake for no grant.
        raise HTTPException(503, detail={"code": "MEMBERSHIP_PROJECTION_LIMIT_EXCEEDED"})
    by_user = {}
    for user_id, event_id in rows:
        by_user.setdefault(user_id, []).append(str(event_id))
    return by_user
