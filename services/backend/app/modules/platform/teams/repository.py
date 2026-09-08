"""Organization-scoped team persistence operations."""

from __future__ import annotations

import uuid
from typing import List, Optional, Tuple
from sqlalchemy import inspect as sa_inspect, select, func, or_, desc, asc, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.platform.teams.models import Team, TeamMember
from app.modules.platform.departments.models import Department
from app.modules.identity.models.user import User
from app.schemas.cursor_pagination import CursorPage, bounded_page_size, decode_cursor, encode_cursor


class TeamRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, org_id: uuid.UUID, id: uuid.UUID) -> Optional[Team]:
        stmt = (
            select(Team)
            .options(selectinload(Team.department))
            .where(
                Team.id == id,
                Team.organization_id == org_id,
                Team.deleted_at == None
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_code(self, dept_id: uuid.UUID, code: str) -> Optional[Team]:
        stmt = (
            select(Team)
            .where(
                Team.department_id == dept_id,
                Team.code == code,
                Team.deleted_at == None
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_teams(
        self,
        org_id: uuid.UUID,
        department_id: Optional[uuid.UUID] = None,
        skip: int = 0,
        limit: int = 20,
        search: Optional[str] = None,
        sort_by: str = "name",
        sort_order: str = "asc"
    ) -> Tuple[List[Team], int]:
        skip = max(0, skip)
        limit = max(1, min(limit, 100))
        # Count total
        count_stmt = select(func.count(Team.id)).where(
            Team.organization_id == org_id,
            Team.deleted_at == None
        )

        # Query items
        stmt = select(Team).options(selectinload(Team.department)).where(
            Team.organization_id == org_id,
            Team.deleted_at == None
        )

        if department_id:
            count_stmt = count_stmt.where(Team.department_id == department_id)
            stmt = stmt.where(Team.department_id == department_id)

        if search:
            search_filter = or_(
                Team.name.ilike(f"%{search}%"),
                Team.code.ilike(f"%{search}%")
            )
            count_stmt = count_stmt.where(search_filter)
            stmt = stmt.where(search_filter)

        # Count total after filtering
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar_one()

        # Sorting
        order_col = getattr(Team, sort_by, Team.name)
        if sort_order.lower() == "desc":
            stmt = stmt.order_by(desc(order_col), desc(Team.id))
        else:
            stmt = stmt.order_by(asc(order_col), asc(Team.id))

        stmt = stmt.offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        items = result.scalars().all()
        return list(items), total

    async def list_page(
        self,
        org_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 100,
        department_id: Optional[uuid.UUID] = None,
        search: Optional[str] = None,
    ) -> List[Team]:
        """Standard bounded list contract; transaction ownership stays external."""
        items, _ = await self.list_teams(
            org_id=org_id,
            department_id=department_id,
            skip=offset,
            limit=limit,
            search=search,
        )
        return items

    async def count_for_organization(self, org_id: uuid.UUID) -> int:
        statement = select(func.count(Team.id)).where(
            Team.organization_id == org_id, Team.deleted_at.is_(None)
        )
        return int((await self.db.scalar(statement)) or 0)

    async def exists_for_organization(
        self, org_id: uuid.UUID, record_id: uuid.UUID
    ) -> bool:
        statement = select(Team.id).where(
            Team.id == record_id,
            Team.organization_id == org_id,
            Team.deleted_at.is_(None),
        )
        return (await self.db.scalar(statement)) is not None

    async def update(self, entity: Team, values: dict) -> Team:
        mapped_fields = {attribute.key for attribute in sa_inspect(entity).mapper.column_attrs}
        for key, value in values.items():
            if key.startswith("_") or key not in mapped_fields:
                raise ValueError(f"Unsupported repository update field: {key}")
            setattr(entity, key, value)
        self.db.add(entity)
        await self.db.flush()
        return entity

    async def delete(self, entity: Team) -> None:
        await self.db.delete(entity)
        await self.db.flush()

    async def cursor_page(
        self,
        org_id: uuid.UUID,
        *,
        cursor: str | None = None,
        limit: int = 20,
        department_id: Optional[uuid.UUID] = None,
        search: Optional[str] = None,
    ) -> CursorPage[Team]:
        bounded_limit = bounded_page_size(limit, default=20, maximum=100)
        statement = select(Team).where(
            Team.organization_id == org_id, Team.deleted_at.is_(None)
        )
        if department_id:
            statement = statement.where(Team.department_id == department_id)
        if search:
            needle = f"%{search.strip()}%"
            statement = statement.where(
                or_(Team.name.ilike(needle), Team.code.ilike(needle))
            )
        if cursor:
            position = decode_cursor(cursor)
            statement = statement.where(
                or_(
                    Team.created_at < position.occurred_at,
                    and_(
                        Team.created_at == position.occurred_at,
                        Team.id < position.record_id,
                    ),
                )
            )
        rows = list(
            (
                await self.db.scalars(
                    statement.order_by(Team.created_at.desc(), Team.id.desc()).limit(
                        bounded_limit + 1
                    )
                )
            ).all()
        )
        page_rows = rows[:bounded_limit]
        has_next = len(rows) > bounded_limit
        next_cursor = (
            encode_cursor(page_rows[-1].created_at, page_rows[-1].id)
            if has_next and page_rows
            else None
        )
        return CursorPage(items=page_rows, next_cursor=next_cursor, has_next=has_next)

    async def create(
        self,
        org_id: uuid.UUID,
        dept_id: uuid.UUID,
        name: str,
        code: str,
        description: Optional[str],
        creator_id: uuid.UUID
    ) -> Team:
        team = Team(
            organization_id=org_id,
            department_id=dept_id,
            name=name,
            code=code,
            description=description,
            created_by=creator_id,
            updated_by=creator_id
        )
        self.db.add(team)
        await self.db.flush()
        return team

    async def save(self, team: Team) -> Team:
        self.db.add(team)
        await self.db.flush()
        return team

    # Team Members operations
    async def get_member(self, team_id: uuid.UUID, user_id: uuid.UUID) -> Optional[TeamMember]:
        stmt = (
            select(TeamMember)
            .where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == user_id,
                TeamMember.deleted_at == None
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def add_member(self, team_id: uuid.UUID, user_id: uuid.UUID) -> TeamMember:
        member = TeamMember(
            team_id=team_id,
            user_id=user_id
        )
        self.db.add(member)
        await self.db.flush()
        return member

    async def list_members(
        self, org_id: uuid.UUID, team_id: uuid.UUID, *, limit: int = 100
    ) -> List[Tuple[TeamMember, User]]:
        limit = max(1, min(limit, 100))
        stmt = (
            select(TeamMember, User)
            .join(User, TeamMember.user_id == User.id)
            .where(
                TeamMember.team_id == team_id,
                TeamMember.deleted_at == None,
                Team.organization_id == org_id,
                User.organization_id == org_id,
                User.deleted_at == None,
            )
            .order_by(User.first_name, User.last_name, User.id)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return result.all()

    async def get_user_for_organization(
        self, org_id: uuid.UUID, user_id: uuid.UUID
    ) -> Optional[User]:
        return await self.db.scalar(
            select(User).where(
                User.id == user_id,
                User.organization_id == org_id,
                User.deleted_at.is_(None),
            )
        )
