from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.rbac.models.organization_member import OrganizationMember

from app.modules.platform.models.organization_console import (
    OrganizationTeam,
    OrganizationTeamEvent,
    OrganizationTeamMember,
)


@dataclass(frozen=True)
class OrganizationTeamProjection:
    id: uuid.UUID
    name: str
    description: str | None
    version: int
    member_ids: list[uuid.UUID]
    events: list[dict]
    created_at: object
    updated_at: object


class OrganizationTeamQueryService:
    """Bounded organization-team list projection with batched assignments."""

    MAX_TEAMS = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_organization(
        self, *, organization_id: uuid.UUID
    ) -> list[OrganizationTeamProjection]:
        team_rows = (
            await self.db.execute(
                select(
                    OrganizationTeam.id,
                    OrganizationTeam.name,
                    OrganizationTeam.description,
                    OrganizationTeam.version,
                    OrganizationTeam.created_at,
                    OrganizationTeam.updated_at,
                )
                .where(
                    OrganizationTeam.organization_id == organization_id,
                    OrganizationTeam.deleted_at.is_(None),
                )
                .order_by(OrganizationTeam.name.asc(), OrganizationTeam.id.asc())
                .limit(self.MAX_TEAMS)
            )
        ).all()
        team_ids = [row.id for row in team_rows]
        members_by_team: dict[uuid.UUID, list[uuid.UUID]] = {team_id: [] for team_id in team_ids}
        events_by_team: dict[uuid.UUID, list[dict]] = {team_id: [] for team_id in team_ids}
        if team_ids:
            member_rows = await self.db.execute(
                select(
                    OrganizationTeamMember.team_id,
                    OrganizationTeamMember.organization_member_id,
                ).where(
                    OrganizationTeamMember.organization_id == organization_id,
                    OrganizationTeamMember.team_id.in_(team_ids),
                    self._owned_member(organization_id),
                )
            )
            for row in member_rows:
                members_by_team[row.team_id].append(row.organization_member_id)

            event_rows = await self.db.execute(
                select(
                    OrganizationTeamEvent.team_id,
                    OrganizationTeamEvent.event_id,
                    OrganizationTeamEvent.permissions,
                    OrganizationTeamEvent.authorization_version,
                ).where(
                    OrganizationTeamEvent.organization_id == organization_id,
                    OrganizationTeamEvent.team_id.in_(team_ids),
                    self._owned_event(organization_id),
                )
            )
            for row in event_rows:
                events_by_team[row.team_id].append(
                    {"event_id": row.event_id, "permissions": row.permissions, "authorization_version": row.authorization_version}
                )

        return [
            OrganizationTeamProjection(
                id=row.id,
                name=row.name,
                description=row.description,
                version=row.version,
                member_ids=members_by_team[row.id],
                events=events_by_team[row.id],
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
            for row in team_rows
        ]

    async def get_for_team(
        self, *, organization_id: uuid.UUID, team_id: uuid.UUID
    ) -> OrganizationTeamProjection | None:
        """Return one tenant-owned team and its assignments for mutation responses."""
        row = (await self.db.execute(select(
            OrganizationTeam.id,
            OrganizationTeam.name,
            OrganizationTeam.description,
            OrganizationTeam.version,
            OrganizationTeam.created_at,
            OrganizationTeam.updated_at,
        ).where(
            OrganizationTeam.id == team_id,
            OrganizationTeam.organization_id == organization_id,
            OrganizationTeam.deleted_at.is_(None),
        ))).one_or_none()
        if row is None:
            return None
        member_ids = list((await self.db.scalars(select(
            OrganizationTeamMember.organization_member_id
        ).where(
            OrganizationTeamMember.organization_id == organization_id,
            OrganizationTeamMember.team_id == team_id,
            self._owned_member(organization_id),
        ).order_by(OrganizationTeamMember.organization_member_id.asc()))).all())
        event_rows = (await self.db.execute(select(
            OrganizationTeamEvent.event_id,
            OrganizationTeamEvent.permissions,
            OrganizationTeamEvent.authorization_version,
        ).where(
            OrganizationTeamEvent.organization_id == organization_id,
            OrganizationTeamEvent.team_id == team_id,
            self._owned_event(organization_id),
        ).order_by(OrganizationTeamEvent.event_id.asc()))).all()
        return OrganizationTeamProjection(
            id=row.id,
            name=row.name,
            description=row.description,
            version=row.version,
            member_ids=member_ids,
            events=[
                {"event_id": event_id, "permissions": permissions, "authorization_version": authorization_version}
                for event_id, permissions, authorization_version in event_rows
            ],
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    @staticmethod
    def _owned_member(organization_id):
        # Recorded bindings cannot expose a foreign subject even before legacy
        # composite constraints have been reconciled and validated. Do not use
        # identity home tenancy as a substitute for membership ownership.
        member = OrganizationMember.__table__
        binding = OrganizationTeamMember.__table__
        return select(member.c.id).where(
            member.c.id == binding.c.organization_member_id,
            member.c.organization_id == organization_id,
        ).correlate(binding).exists()

    @staticmethod
    def _owned_event(organization_id):
        event = Event.__table__
        binding = OrganizationTeamEvent.__table__
        return select(event.c.id).where(
            event.c.id == binding.c.event_id,
            event.c.organization_id == organization_id,
        ).correlate(binding).exists()
