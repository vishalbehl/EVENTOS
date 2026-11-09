# backend/app/routers/participant_roles.py
from __future__ import annotations

import re
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, get_current_user, CurrentEvent, require_active_user
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.registration.models.participant_role import ParticipantRole
from app.schemas.common import MessageResponse
from app.core.dependencies.feature_gate import enforce_event_operation, require_event_operation
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.core.cache import invalidate_event
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.registration.application.role_commands import ParticipantRoleCommandService, role_projection
from app.modules.registration.application.queries import ParticipantRoleQueryService

router = APIRouter(prefix="/events/{event_id}/registration/roles", tags=["participant-roles"])


async def _invalidate_role_cache(event: CurrentEvent) -> None:
    # All event caches share the canonical versioned namespace. This also
    # invalidates form/pricing/dashboard projections after a role mutation.
    await invalidate_event(event.organization_id, event.id)


# ── All roles with their categories ──────────────────────────────────────────

ALL_ROLES: list[dict] = [
    # General Attendees
    {"category": "General Attendees", "name": "Delegate",               "is_default": True,  "sort_order": 1},
    {"category": "General Attendees", "name": "Student Delegate",       "is_default": True,  "sort_order": 2},
    {"category": "General Attendees", "name": "Organizer",              "is_default": True,  "sort_order": 3},
    {"category": "General Attendees", "name": "Faculty Delegate",       "is_default": False, "sort_order": 4},
    {"category": "General Attendees", "name": "Industry Professional",  "is_default": False, "sort_order": 5},
    {"category": "General Attendees", "name": "Research Scholar",       "is_default": False, "sort_order": 6},
    {"category": "General Attendees", "name": "International Delegate", "is_default": False, "sort_order": 7},
    {"category": "General Attendees", "name": "Corporate Attendee",     "is_default": False, "sort_order": 8},
    {"category": "General Attendees", "name": "Government Representative", "is_default": False, "sort_order": 9},
    {"category": "General Attendees", "name": "Academic Attendee",      "is_default": False, "sort_order": 10},
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


async def seed_default_roles(
    event_id: uuid.UUID,
    db: AsyncSession,
    *,
    commit: bool = True,
) -> None:
    """Seed default roles for explicit event setup, never for a read request."""
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
    if commit:
        await db.commit()
    else:
        await db.flush()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ParticipantRoleOut(BaseModel):
    id: uuid.UUID
    category: str
    name: str
    role_code: str
    is_active: bool
    is_default: bool
    sort_order: int
    version: int
    event_version: int

    class Config:
        from_attributes = True


class UpdateRolePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role_code: Optional[str] = Field(default=None, min_length=2, max_length=10, pattern=r"^[A-Za-z0-9]+$")
    is_active: Optional[StrictBool] = None


class VersionedRoleToggle(UpdateRolePayload):
    id: uuid.UUID
    version: int = Field(ge=1, strict=True)


class BulkRoleToggle(BaseModel):
    model_config = ConfigDict(extra="forbid")
    """Payload to toggle active state of multiple roles at once."""
    updates: List[VersionedRoleToggle] = Field(min_length=1, max_length=100)


class BulkRoleResult(BaseModel):
    message: str
    event_version: int
    roles: List[ParticipantRoleOut]


class DeleteRoleResult(BaseModel):
    message: str
    event_version: int


class AddRolePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    role_code: Optional[str] = Field(default=None, min_length=2, max_length=10, pattern=r"^[A-Za-z0-9]+$")
    is_active: StrictBool = True
    sort_order: int = Field(default=99, ge=0, le=10000)

    @field_validator("category", "name")
    @classmethod
    def nonempty(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Role name and category cannot be blank.")
        return value


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ParticipantRoleOut])
async def list_roles(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[ParticipantRoleOut]:
    """Return configured participant roles without mutating state on read."""
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "registration.ticket_types.read",
        user_id=current_user.id,
    )
    owned = await db.scalar(select(Event).where(Event.id == event.id,
        Event.organization_id == event.organization_id, Event.deleted_at.is_(None))
        .with_for_update(read=True).execution_options(populate_existing=True))
    if owned is None:
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
    roles = await ParticipantRoleQueryService(db).list_for_event(event_id=event.id)
    result = [role_projection(role, int(owned.version or 1)) for role in roles]
    await db.commit()
    return result



@router.post("", response_model=ParticipantRoleOut, status_code=status.HTTP_201_CREATED)
async def add_role(
    payload: AddRolePayload,
    event: CurrentEvent,
    actor: User = Depends(require_active_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
) -> ParticipantRoleOut:
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "registration.ticket_types.manage",
        user_id=actor.id,
    )
    role = await ParticipantRoleCommandService.create(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        actor_id=actor.id,
        category=payload.category,
        name=payload.name,
        role_code=payload.role_code or make_role_code(payload.name),
        is_active=payload.is_active,
        sort_order=payload.sort_order,
        idempotency_key=idempotency_key,
    )
    return ParticipantRoleOut.model_validate(role)


@router.patch("/bulk-toggle", response_model=BulkRoleResult, dependencies=[require_event_operation("registration.ticket_types.manage")])
async def bulk_toggle_roles(
    payload: BulkRoleToggle,
    event: CurrentEvent,
    actor: User = Depends(require_active_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    if_match: Optional[str] = Header(None, alias="If-Match"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Enable or disable multiple roles at once."""
    if actor is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    response = await ParticipantRoleCommandService.bulk_toggle(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        actor_id=actor.id,
        updates=[update.model_dump(mode="json", exclude_none=True) for update in payload.updates],
        idempotency_key=idempotency_key,
        if_match=if_match,
    )
    return response


@router.patch("/{role_id}", response_model=ParticipantRoleOut, dependencies=[require_event_operation("registration.ticket_types.manage")])
async def update_role(
    role_id: uuid.UUID,
    payload: UpdateRolePayload,
    event: CurrentEvent,
    actor: User = Depends(require_active_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    if_match: Optional[str] = Header(None, alias="If-Match"),
    db: AsyncSession = Depends(get_db),
) -> ParticipantRoleOut:
    if actor is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    return await ParticipantRoleCommandService.update(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        role_id=role_id,
        actor_id=actor.id,
        role_code=payload.role_code,
        is_active=payload.is_active,
        idempotency_key=idempotency_key,
        if_match=if_match,
    )


@router.delete("/{role_id}", response_model=DeleteRoleResult, dependencies=[require_event_operation("registration.ticket_types.manage")])
async def delete_role(
    role_id: uuid.UUID,
    event: CurrentEvent,
    actor: User = Depends(require_active_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    if_match: Optional[str] = Header(None, alias="If-Match"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a custom participant role (platform defaults cannot be deleted)."""
    if actor is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    result = await ParticipantRoleCommandService.delete(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        role_id=role_id,
        actor_id=actor.id,
        idempotency_key=idempotency_key,
        if_match=if_match,
    )
    return result
