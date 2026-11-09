"""Code-owned starter teams for newly provisioned organisations.

Teams are operational containers, not authority.  This service never assigns
members, events, roles, or permissions; those remain explicit audited actions.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from app.modules.platform.models.organization_console import OrganizationTeam


DEFAULT_ORGANIZATION_TEAMS: tuple[tuple[str, str], ...] = (
    ("Management", "Organisation leadership, commercial ownership and approvals."),
    ("Events", "Event planning, configuration and delivery."),
    ("Registration", "Registration, check-in and attendee operations."),
    ("Content & Programme", "Sessions, abstracts, schedules and programme content."),
    ("Speakers", "Speaker onboarding, files and communications."),
    ("Operations", "Venue, devices, rooms and onsite operations."),
)


async def ensure_default_organization_teams(
    db,
    organization_id: uuid.UUID,
    *,
    created_by: uuid.UUID,
    owner_member_id: uuid.UUID | None = None,
) -> list[OrganizationTeam]:
    """Add only missing starter teams in one bounded read.

    Names are compared case-insensitively to respect the active-name uniqueness
    rule without reviving an archived user-owned team.
    """
    names = [name.lower() for name, _ in DEFAULT_ORGANIZATION_TEAMS]
    existing = set((await db.scalars(
        select(func.lower(OrganizationTeam.name)).where(
            OrganizationTeam.organization_id == organization_id,
            OrganizationTeam.deleted_at.is_(None),
            func.lower(OrganizationTeam.name).in_(names),
        )
    )).all())
    created: list[OrganizationTeam] = []
    for name, description in DEFAULT_ORGANIZATION_TEAMS:
        if name.lower() in existing:
            continue
        team = OrganizationTeam(
            organization_id=organization_id,
            name=name,
            description=description,
            owner_member_id=owner_member_id,
            created_by=created_by,
            status="ACTIVE",
        )
        db.add(team)
        created.append(team)
    if created:
        await db.flush()
    return created

