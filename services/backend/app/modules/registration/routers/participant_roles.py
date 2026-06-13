# backend/app/routers/participant_roles.py
from __future__ import annotations

import re
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent
from app.modules.registration.models.participant_role import ParticipantRole
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/events/{event_id}/registration/roles", tags=["participant-roles"])


# ── All roles with their categories ──────────────────────────────────────────

ALL_ROLES: list[dict] = [
    # General Attendees
    {"category": "General Attendees", "name": "Delegate",               "is_default": True,  "sort_order": 3},
    {"category": "General Attendees", "name": "Student Delegate",       "is_default": True,  "sort_order": 4},
    {"category": "General Attendees", "name": "Faculty Delegate",       "is_default": False, "sort_order": 5},
    {"category": "General Attendees", "name": "Industry Professional",  "is_default": False, "sort_order": 6},
    {"category": "General Attendees", "name": "Research Scholar",       "is_default": False, "sort_order": 7},
    {"category": "General Attendees", "name": "International Delegate", "is_default": False, "sort_order": 8},
    {"category": "General Attendees", "name": "Corporate Attendee",     "is_default": False, "sort_order": 9},
    {"category": "General Attendees", "name": "Government Representative", "is_default": False, "sort_order": 10},
    {"category": "General Attendees", "name": "Academic Attendee",      "is_default": False, "sort_order": 11},
    {"category": "General Attendees", "name": "Organizer",              "is_default": True,  "sort_order": 12},
    # Presentation Related
    {"category": "Presentation Related", "name": "Speaker",             "is_default": True,  "sort_order": 20},
    {"category": "Presentation Related", "name": "Speaker / Presenter", "is_default": False, "sort_order": 21},
    {"category": "Presentation Related", "name": "Keynote Speaker",     "is_default": True,  "sort_order": 22},
    {"category": "Presentation Related", "name": "Invited Speaker",     "is_default": False, "sort_order": 23},
    {"category": "Presentation Related", "name": "Panel Speaker",       "is_default": False, "sort_order": 24},
    {"category": "Presentation Related", "name": "Session Chair",       "is_default": False, "sort_order": 25},
    {"category": "Presentation Related", "name": "Moderator",           "is_default": True,  "sort_order": 26},
    {"category": "Presentation Related", "name": "Workshop Instructor", "is_default": False, "sort_order": 27},
    # Business & Partners
    {"category": "Business & Partners", "name": "Sponsor Representative", "is_default": True,  "sort_order": 30},
    {"category": "Business & Partners", "name": "Exhibitor",             "is_default": True,  "sort_order": 31},
    {"category": "Business & Partners", "name": "Partner Organization Member", "is_default": False, "sort_order": 32},
    {"category": "Business & Partners", "name": "Investor",              "is_default": False, "sort_order": 33},
    {"category": "Business & Partners", "name": "Startup Founder",       "is_default": False, "sort_order": 34},
    {"category": "Business & Partners", "name": "Recruiter / Hiring Partner", "is_default": False, "sort_order": 35},
    # Media & Public Relations
    {"category": "Media & Public Relations", "name": "Media",               "is_default": True,  "sort_order": 40},
    {"category": "Media & Public Relations", "name": "Media Representative","is_default": False, "sort_order": 41},
    {"category": "Media & Public Relations", "name": "Journalist",          "is_default": False, "sort_order": 42},
    {"category": "Media & Public Relations", "name": "Photographer",        "is_default": False, "sort_order": 43},
    {"category": "Media & Public Relations", "name": "Videographer",        "is_default": False, "sort_order": 44},
    {"category": "Media & Public Relations", "name": "Content Creator / Influencer", "is_default": False, "sort_order": 45},
    # Event Operations
    {"category": "Event Operations", "name": "Volunteer",         "is_default": True,  "sort_order": 50},
    {"category": "Event Operations", "name": "Technical Staff",   "is_default": True,  "sort_order": 51},
    {"category": "Event Operations", "name": "AV Technician",     "is_default": False, "sort_order": 52},
    {"category": "Event Operations", "name": "Event Coordinator", "is_default": False, "sort_order": 53},
    {"category": "Event Operations", "name": "Organizer Staff",   "is_default": False, "sort_order": 55},
    {"category": "Event Operations", "name": "Support Staff",     "is_default": False, "sort_order": 56},
    # Special Access
    {"category": "Special Access", "name": "VIP Guest",             "is_default": True,  "sort_order": 60},
    {"category": "Special Access", "name": "Chief Guest",           "is_default": False, "sort_order": 61},
    {"category": "Special Access", "name": "Guest of Honor",        "is_default": False, "sort_order": 62},
    {"category": "Special Access", "name": "Jury Member",           "is_default": False, "sort_order": 63},
    {"category": "Special Access", "name": "Advisory Board Member", "is_default": False, "sort_order": 64},
    {"category": "Special Access", "name": "Committee Member",      "is_default": False, "sort_order": 65},
    # Session Specific
    {"category": "Session Specific", "name": "Workshop Participant",          "is_default": True,  "sort_order": 70},
    {"category": "Session Specific", "name": "Hands-on Training Participant", "is_default": False, "sort_order": 71},
    {"category": "Session Specific", "name": "Competition Participant",       "is_default": False, "sort_order": 72},
    {"category": "Session Specific", "name": "Poster Presenter",              "is_default": True,  "sort_order": 73},
    {"category": "Session Specific", "name": "ePoster Presenter",             "is_default": False, "sort_order": 74},
    {"category": "Session Specific", "name": "Networking Participant",        "is_default": False, "sort_order": 75},
]

ROLE_CODE_OVERRIDES = {
    "Delegate": "DEL",
    "Student Delegate": "STU",
    "Faculty Delegate": "FAC",
    "Organizer": "ORG",
    "Speaker": "SPK",
    "Speaker / Presenter": "SP",
    "Keynote Speaker": "KEY",
    "Moderator": "MOD",
    "Sponsor Representative": "SPO",
    "Exhibitor": "EXH",
    "Media": "MED",
    "Volunteer": "VOL",
    "Technical Staff": "TEC",
    "VIP Guest": "VIP",
    "Workshop Participant": "WOR",
    "Poster Presenter": "POS",
}


def make_role_code(name: str) -> str:
    override = ROLE_CODE_OVERRIDES.get(name)
    if override:
        return override
    compact = re.sub(r"[^A-Za-z0-9]", "", name or "REG").upper()
    return (compact[:3] or "REG")


async def seed_default_roles(event_id: uuid.UUID, db: AsyncSession) -> None:
    """Seed only default platform roles for a newly created event."""
    for r in ALL_ROLES:
        if r["is_default"]:
            db.add(ParticipantRole(
                event_id=event_id,
                category=r["category"],
                name=r["name"],
                role_code=make_role_code(r["name"]),
                is_default=True,
                is_active=True,
                sort_order=r["sort_order"],
            ))
    await db.commit()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ParticipantRoleOut(BaseModel):
    id: uuid.UUID
    category: str
    name: str
    role_code: str
    is_active: bool
    is_default: bool
    sort_order: int

    class Config:
        from_attributes = True


class BulkRoleToggle(BaseModel):
    """Payload to toggle active state of multiple roles at once."""
    updates: List[dict]  # [{id: str, is_active: bool}]


class AddRolePayload(BaseModel):
    category: str
    name: str
    role_code: Optional[str] = None
    is_active: bool = True
    sort_order: int = 99


class UpdateRolePayload(BaseModel):
    role_code: Optional[str] = None
    is_active: Optional[bool] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ParticipantRoleOut])
async def list_roles(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> List[ParticipantRoleOut]:
    """Return all participant roles for this event. Auto-seeds if none exist yet."""
    result = await db.execute(
        select(ParticipantRole)
        .where(ParticipantRole.event_id == event.id)
        .order_by(ParticipantRole.sort_order, ParticipantRole.name)
    )
    roles = result.scalars().all()

    # ── Auto-seed for events created before this feature was added ──
    if not roles:
        await seed_default_roles(event.id, db)
        result = await db.execute(
            select(ParticipantRole)
            .where(ParticipantRole.event_id == event.id)
            .order_by(ParticipantRole.sort_order, ParticipantRole.name)
        )
        roles = result.scalars().all()

    return roles



@router.post("", response_model=ParticipantRoleOut, status_code=status.HTTP_201_CREATED)
async def add_role(
    payload: AddRolePayload,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> ParticipantRoleOut:
    # Check ticket category limit
    from app.modules.billing.services.limit_guard import LimitGuard
    await LimitGuard.check_ticket_categories(db, event.organization_id, event.id)

    role = ParticipantRole(
        event_id=event.id,
        category=payload.category,
        name=payload.name,
        role_code=(payload.role_code or make_role_code(payload.name)).strip().upper()[:10],
        is_active=payload.is_active,
        is_default=False,
        sort_order=payload.sort_order,
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role


@router.patch("/bulk-toggle", response_model=MessageResponse)
async def bulk_toggle_roles(
    payload: BulkRoleToggle,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Enable or disable multiple roles at once."""
    for update in payload.updates:
        role_id = uuid.UUID(update["id"])
        is_active = bool(update["is_active"])
        result = await db.execute(
            select(ParticipantRole).where(
                ParticipantRole.id == role_id,
                ParticipantRole.event_id == event.id
            )
        )
        role = result.scalar_one_or_none()
        if role:
            role.is_active = is_active
            if "role_code" in update and update["role_code"]:
                role.role_code = str(update["role_code"]).strip().upper()[:10]
    await db.commit()
    return MessageResponse(message="Roles updated successfully.")


@router.patch("/{role_id}", response_model=ParticipantRoleOut)
async def update_role(
    role_id: uuid.UUID,
    payload: UpdateRolePayload,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> ParticipantRoleOut:
    result = await db.execute(
        select(ParticipantRole).where(
            ParticipantRole.id == role_id,
            ParticipantRole.event_id == event.id
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found.")

    if payload.role_code is not None:
        code = payload.role_code.strip().upper()
        if len(code) < 2:
            raise HTTPException(status_code=400, detail="Role code must be at least 2 characters.")
        role.role_code = code[:10]
    if payload.is_active is not None:
        role.is_active = payload.is_active

    await db.commit()
    await db.refresh(role)
    return role


@router.delete("/{role_id}", response_model=MessageResponse)
async def delete_role(
    role_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Delete a custom participant role (platform defaults cannot be deleted)."""
    result = await db.execute(
        select(ParticipantRole).where(
            ParticipantRole.id == role_id,
            ParticipantRole.event_id == event.id
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found.")
    await db.delete(role)
    await db.commit()
    return MessageResponse(message="Role deleted.")
