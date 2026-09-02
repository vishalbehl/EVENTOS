"""Read-only department projections."""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform.departments.models import Department, DepartmentMember
from app.modules.platform.departments.repository import DepartmentRepository
from app.modules.platform.teams.models import Team


class DepartmentQueryService:
    """Compose bounded department rows with batched relationship counts."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repository = DepartmentRepository(db)

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
