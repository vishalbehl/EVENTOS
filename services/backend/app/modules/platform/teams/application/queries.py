"""Explicit, bounded read projections for platform teams."""

from __future__ import annotations

import uuid
from typing import Any, Optional

from sqlalchemy import and_, asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models.user import User
from app.modules.platform.departments.models import Department
from app.modules.platform.teams.models import Team, TeamMember


class TeamQueryService:
    """Read-only team projections; transaction ownership stays with callers."""

    _SORT_COLUMNS = {
        "name": Team.name,
        "code": Team.code,
        "created_at": Team.created_at,
        "updated_at": Team.updated_at,
    }

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_member_user(
        self, *, organization_id: uuid.UUID, team_id: uuid.UUID, user_id: uuid.UUID
    ) -> Optional[dict[str, object]]:
        """Return only the tenant-owned identity fields needed by a member response."""
        row = (
            await self.db.execute(
                select(User.id, User.email, User.first_name, User.last_name)
                .join(TeamMember, TeamMember.user_id == User.id)
                .where(
                    TeamMember.team_id == team_id,
                    TeamMember.user_id == user_id,
                    TeamMember.deleted_at.is_(None),
                    User.organization_id == organization_id,
                    User.deleted_at.is_(None),
                )
            )
        ).mappings().one_or_none()
        return dict(row) if row else None

    @staticmethod
    def _filters(
        org_id: uuid.UUID,
        department_id: Optional[uuid.UUID],
        search: Optional[str],
    ) -> list[Any]:
        filters: list[Any] = [
            Team.organization_id == org_id,
            Team.deleted_at.is_(None),
        ]
        if department_id:
            filters.append(Team.department_id == department_id)
        if search and search.strip():
            needle = f"%{search.strip()}%"
            filters.append(or_(Team.name.ilike(needle), Team.code.ilike(needle)))
        return filters

    @classmethod
    def _projection(cls):
        return (
            Team.id.label("id"),
            Team.department_id.label("department_id"),
            Team.organization_id.label("organization_id"),
            Team.name.label("name"),
            Team.code.label("code"),
            Team.description.label("description"),
            Team.created_at.label("created_at"),
            Team.updated_at.label("updated_at"),
            Department.name.label("department_name"),
            func.count(TeamMember.id).label("members_count"),
        )

    @classmethod
    def _statement(
        cls,
        org_id: uuid.UUID,
        department_id: Optional[uuid.UUID],
        search: Optional[str],
    ):
        return (
            select(*cls._projection())
            .outerjoin(Department, Department.id == Team.department_id)
            .outerjoin(
                TeamMember,
                and_(
                    TeamMember.team_id == Team.id,
                    TeamMember.deleted_at.is_(None),
                ),
            )
            .where(*cls._filters(org_id, department_id, search))
            .group_by(
                Team.id,
                Team.department_id,
                Team.organization_id,
                Team.name,
                Team.code,
                Team.description,
                Team.created_at,
                Team.updated_at,
                Department.name,
            )
        )

    async def list_with_counts(
        self,
        org_id: uuid.UUID,
        *,
        department_id: Optional[uuid.UUID] = None,
        offset: int = 0,
        limit: int = 20,
        search: Optional[str] = None,
        sort_by: str = "name",
        sort_order: str = "asc",
    ) -> tuple[list[dict[str, Any]], int]:
        bounded_offset = max(0, offset)
        bounded_limit = max(1, min(limit, 100))
        filters = self._filters(org_id, department_id, search)
        total = int(
            (await self.db.scalar(select(func.count(Team.id)).where(*filters))) or 0
        )
        order_column = self._SORT_COLUMNS.get(sort_by, Team.name)
        direction = desc if sort_order.lower() == "desc" else asc
        rows = (
            await self.db.execute(
                self._statement(org_id, department_id, search)
                .order_by(direction(order_column), direction(Team.id))
                .offset(bounded_offset)
                .limit(bounded_limit)
            )
        ).mappings().all()
        return [dict(row) for row in rows], total

    async def get_with_count(
        self, org_id: uuid.UUID, team_id: uuid.UUID
    ) -> Optional[dict[str, Any]]:
        row = (
            await self.db.execute(
                self._statement(org_id, None, None).where(Team.id == team_id)
            )
        ).mappings().one_or_none()
        return dict(row) if row else None
