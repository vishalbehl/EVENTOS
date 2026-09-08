"""Read-only department projections."""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform.departments.models import Department, DepartmentMember
from app.modules.identity.models.user import User
from app.modules.platform.departments.repository import DepartmentRepository
from app.modules.platform.teams.models import Team


class DepartmentQueryService:
    """Compose bounded department rows with batched relationship counts."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repository = DepartmentRepository(db)

    async def get_with_counts(
        self, *, organization_id: uuid.UUID, department_id: uuid.UUID
    ) -> Optional[dict[str, object]]:
        """Return one tenant-owned department projection with relationship counts."""
        department = await self.repository.get_by_id(organization_id, department_id)
        if department is None:
            return None

        member_count = int(
            await self.db.scalar(
                select(func.count(DepartmentMember.id)).where(
                    DepartmentMember.department_id == department_id,
                    DepartmentMember.deleted_at.is_(None),
                )
            )
            or 0
        )
        team_count = int(
            await self.db.scalar(
                select(func.count(Team.id)).where(
                    Team.department_id == department_id,
                    Team.organization_id == organization_id,
                    Team.deleted_at.is_(None),
                )
            )
            or 0
        )
        return {
            "id": department.id,
            "organization_id": department.organization_id,
            "name": department.name,
            "code": department.code,
            "description": department.description,
            "created_at": department.created_at,
            "updated_at": department.updated_at,
            "members_count": member_count,
            "teams_count": team_count,
        }

    async def get_member_user(
        self, *, organization_id: uuid.UUID, department_id: uuid.UUID, user_id: uuid.UUID
    ) -> Optional[dict[str, object]]:
        """Return only the tenant-owned identity fields needed by a member response."""
        row = (
            await self.db.execute(
                select(User.id, User.email, User.first_name, User.last_name)
                .join(DepartmentMember, DepartmentMember.user_id == User.id)
                .where(
                    DepartmentMember.department_id == department_id,
                    DepartmentMember.user_id == user_id,
                    DepartmentMember.deleted_at.is_(None),
                    User.organization_id == organization_id,
                    User.deleted_at.is_(None),
                )
            )
        ).mappings().one_or_none()
        return dict(row) if row else None

    async def list_with_counts(
        self,
        *,
        organization_id: uuid.UUID,
        skip: int = 0,
        limit: int = 20,
        search: Optional[str] = None,
        sort_by: str = "name",
        sort_order: str = "asc",
    ) -> tuple[list[Department], int, dict[uuid.UUID, tuple[int, int]]]:
        departments, total = await self.repository.list_departments(
            org_id=organization_id,
            skip=skip,
            limit=limit,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order,
        )
        department_ids = [department.id for department in departments]
        if not department_ids:
            return departments, total, {}

        member_rows = (
            await self.db.execute(
                select(DepartmentMember.department_id, func.count(DepartmentMember.id))
                .where(
                    DepartmentMember.department_id.in_(department_ids),
                    DepartmentMember.deleted_at.is_(None),
                )
                .group_by(DepartmentMember.department_id)
            )
        ).all()
        team_rows = (
            await self.db.execute(
                select(Team.department_id, func.count(Team.id))
                .where(
                    Team.department_id.in_(department_ids),
                    Team.deleted_at.is_(None),
                )
                .group_by(Team.department_id)
            )
        ).all()
        members = {row[0]: int(row[1] or 0) for row in member_rows}
        teams = {row[0]: int(row[1] or 0) for row in team_rows}
        counts = {
            department.id: (members.get(department.id, 0), teams.get(department.id, 0))
            for department in departments
        }
        return departments, total, counts
