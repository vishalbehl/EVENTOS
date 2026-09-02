"""Bounded, tenant-scoped role projections."""

from __future__ import annotations

import uuid
from typing import Any, Optional

from sqlalchemy import and_, asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform.departments.models import Department
from app.modules.platform.permissions.models import PlatformRolePermission
from app.modules.platform.roles.models import DepartmentRole, UserAssignment
from app.modules.platform.teams.models import Team
from app.modules.identity.models.user import User


class RoleQueryService:
    """Read-only role projections; callers retain transaction ownership."""

    _SORT_COLUMNS = {
        "name": DepartmentRole.name,
        "code": DepartmentRole.code,
        "created_at": DepartmentRole.created_at,
        "updated_at": DepartmentRole.updated_at,
    }

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _filters(
        organization_id: uuid.UUID,
        department_id: Optional[uuid.UUID],
        search: Optional[str],
    ) -> list[Any]:
        filters: list[Any] = [
            DepartmentRole.organization_id == organization_id,
            DepartmentRole.deleted_at.is_(None),
        ]
        if department_id:
            filters.append(DepartmentRole.department_id == department_id)
        if search and search.strip():
            needle = f"%{search.strip()}%"
            filters.append(
                or_(DepartmentRole.name.ilike(needle), DepartmentRole.code.ilike(needle))
            )
        return filters

    @classmethod
    def _statement(
        cls,
        organization_id: uuid.UUID,
        department_id: Optional[uuid.UUID],
        search: Optional[str],
    ):
        permission_counts = (
            select(
                PlatformRolePermission.role_id.label("role_id"),
                func.count(PlatformRolePermission.id).label("permissions_count"),
            )
            .group_by(PlatformRolePermission.role_id)
            .subquery()
        )
        user_counts = (
            select(
                UserAssignment.role_id.label("role_id"),
                func.count(UserAssignment.id).label("users_count"),
            )
            .where(UserAssignment.deleted_at.is_(None))
            .group_by(UserAssignment.role_id)
            .subquery()
        )
        return (
            select(
                DepartmentRole.id.label("id"),
                DepartmentRole.organization_id.label("organization_id"),
                DepartmentRole.department_id.label("department_id"),
                DepartmentRole.name.label("name"),
                DepartmentRole.code.label("code"),
                DepartmentRole.description.label("description"),
                DepartmentRole.access_level.label("access_level"),
                DepartmentRole.created_at.label("created_at"),
                DepartmentRole.updated_at.label("updated_at"),
                Department.name.label("department_name"),
                func.coalesce(permission_counts.c.permissions_count, 0).label(
                    "permissions_count"
                ),
                func.coalesce(user_counts.c.users_count, 0).label("users_count"),
            )
            .outerjoin(Department, Department.id == DepartmentRole.department_id)
            .outerjoin(permission_counts, permission_counts.c.role_id == DepartmentRole.id)
            .outerjoin(user_counts, user_counts.c.role_id == DepartmentRole.id)
            .where(*cls._filters(organization_id, department_id, search))
        )

    async def list_with_counts(
        self,
        organization_id: uuid.UUID,
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
        total = int(
            (await self.db.scalar(
                select(func.count(DepartmentRole.id)).where(
                    *self._filters(organization_id, department_id, search)
                )
            ))
            or 0
        )
        order_column = self._SORT_COLUMNS.get(sort_by, DepartmentRole.name)
        direction = desc if sort_order.lower() == "desc" else asc
        rows = (
            await self.db.execute(
                self._statement(organization_id, department_id, search)
                .order_by(direction(order_column), direction(DepartmentRole.id))
                .offset(bounded_offset)
                .limit(bounded_limit)
            )
        ).mappings().all()
        return [dict(row) for row in rows], total

    async def get_with_counts(
        self, organization_id: uuid.UUID, role_id: uuid.UUID
    ) -> Optional[dict[str, Any]]:
        row = (
            await self.db.execute(
                self._statement(organization_id, None, None).where(
                    DepartmentRole.id == role_id
                )
            )
        ).mappings().one_or_none()
        return dict(row) if row else None


class AssignmentQueryService:
    """Read-only assignment projections with verified organization scope."""

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _filters(
        organization_id: uuid.UUID,
        user_id: Optional[uuid.UUID],
        department_id: Optional[uuid.UUID],
        team_id: Optional[uuid.UUID],
        role_id: Optional[uuid.UUID],
    ) -> list[Any]:
        filters: list[Any] = [
            UserAssignment.organization_id == organization_id,
            UserAssignment.deleted_at.is_(None),
        ]
        for column, value in (
            (UserAssignment.user_id, user_id),
            (UserAssignment.department_id, department_id),
            (UserAssignment.team_id, team_id),
            (UserAssignment.role_id, role_id),
        ):
            if value:
                filters.append(column == value)
        return filters

    @classmethod
    def _statement(
        cls,
        organization_id: uuid.UUID,
        user_id: Optional[uuid.UUID],
        department_id: Optional[uuid.UUID],
        team_id: Optional[uuid.UUID],
        role_id: Optional[uuid.UUID],
    ):
        return (
            select(
                UserAssignment.id.label("id"),
                UserAssignment.organization_id.label("organization_id"),
                UserAssignment.user_id.label("user_id"),
                UserAssignment.department_id.label("department_id"),
                UserAssignment.team_id.label("team_id"),
                UserAssignment.role_id.label("role_id"),
                UserAssignment.created_at.label("created_at"),
                User.first_name.label("user_first_name"),
                User.last_name.label("user_last_name"),
                User.email.label("user_email"),
                Department.name.label("department_name"),
                Team.name.label("team_name"),
                DepartmentRole.name.label("role_name"),
            )
            .join(User, User.id == UserAssignment.user_id)
            .join(Department, Department.id == UserAssignment.department_id)
            .outerjoin(Team, Team.id == UserAssignment.team_id)
            .join(DepartmentRole, DepartmentRole.id == UserAssignment.role_id)
            .where(
                *cls._filters(
                    organization_id, user_id, department_id, team_id, role_id
                )
            )
        )

    async def list_page(
        self,
        organization_id: uuid.UUID,
        *,
        user_id: Optional[uuid.UUID] = None,
        department_id: Optional[uuid.UUID] = None,
        team_id: Optional[uuid.UUID] = None,
        role_id: Optional[uuid.UUID] = None,
        offset: int = 0,
        limit: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        bounded_offset = max(0, offset)
        bounded_limit = max(1, min(limit, 100))
        filters = self._filters(
            organization_id, user_id, department_id, team_id, role_id
        )
        total = int(
            (await self.db.scalar(select(func.count(UserAssignment.id)).where(*filters)))
            or 0
        )
        rows = (
            await self.db.execute(
                self._statement(
                    organization_id, user_id, department_id, team_id, role_id
                )
                .order_by(UserAssignment.created_at.desc(), UserAssignment.id.desc())
                .offset(bounded_offset)
                .limit(bounded_limit)
            )
        ).mappings().all()
        result = []
        for row in rows:
            value = dict(row)
            value["user_name"] = (
                f"{value.pop('user_first_name')} {value.pop('user_last_name')}"
            ).strip()
            if value["team_name"] is None:
                value["team_name"] = "None"
            result.append(value)
        return result, total
