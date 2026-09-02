"""Organization-scoped department persistence operations."""

from __future__ import annotations

import uuid
from typing import List, Optional, Tuple
from sqlalchemy import select, func, or_, desc, asc, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.platform.departments.models import Department, DepartmentMember
from app.modules.identity.models.user import User
from app.schemas.cursor_pagination import CursorPage, decode_cursor, encode_cursor


class DepartmentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, org_id: uuid.UUID, id: uuid.UUID) -> Optional[Department]:
        stmt = (
            select(Department)
            .where(
                Department.id == id,
                Department.organization_id == org_id,
                Department.deleted_at == None
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_code(self, org_id: uuid.UUID, code: str) -> Optional[Department]:
        stmt = (
            select(Department)
            .where(
                Department.code == code,
                Department.organization_id == org_id,
                Department.deleted_at == None
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_departments(
        self,
        org_id: uuid.UUID,
        skip: int = 0,
        limit: int = 20,
        search: Optional[str] = None,
        sort_by: str = "name",
        sort_order: str = "asc"
    ) -> Tuple[List[Department], int]:
        skip = max(0, skip)
        limit = max(1, min(limit, 100))
        # Count total
        count_stmt = select(func.count(Department.id)).where(
            Department.organization_id == org_id,
            Department.deleted_at == None
        )

        # Query items
        stmt = select(Department).where(
            Department.organization_id == org_id,
            Department.deleted_at == None
        )

        if search:
            search_filter = or_(
                Department.name.ilike(f"%{search}%"),
                Department.code.ilike(f"%{search}%")
            )
            count_stmt = count_stmt.where(search_filter)
            stmt = stmt.where(search_filter)

        # Count total after filtering
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar_one()

        # Sorting
        order_col = getattr(Department, sort_by, Department.name)
        if sort_order.lower() == "desc":
            stmt = stmt.order_by(desc(order_col), desc(Department.id))
        else:
            stmt = stmt.order_by(asc(order_col), asc(Department.id))

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
        search: Optional[str] = None,
    ) -> List[Department]:
        items, _ = await self.list_departments(
            org_id=org_id,
            skip=offset,
            limit=limit,
            search=search,
        )
        return items

    async def count_for_organization(self, org_id: uuid.UUID) -> int:
        statement = select(func.count(Department.id)).where(
            Department.organization_id == org_id,
            Department.deleted_at.is_(None),
        )
        return int((await self.db.scalar(statement)) or 0)

    async def exists_for_organization(
        self, org_id: uuid.UUID, record_id: uuid.UUID
    ) -> bool:
        statement = select(Department.id).where(
            Department.id == record_id,
            Department.organization_id == org_id,
            Department.deleted_at.is_(None),
        )
        return (await self.db.scalar(statement)) is not None

    async def update(self, entity: Department, values: dict) -> Department:
        for key, value in values.items():
            if hasattr(entity, key):
                setattr(entity, key, value)
        self.db.add(entity)
        await self.db.flush()
        return entity

    async def delete(self, entity: Department) -> None:
        await self.db.delete(entity)
        await self.db.flush()

    async def cursor_page(
        self,
        org_id: uuid.UUID,
        *,
        cursor: str | None = None,
        limit: int = 20,
        search: Optional[str] = None,
    ) -> CursorPage[Department]:
        bounded_limit = max(1, min(limit, 100))
        statement = select(Department).where(
            Department.organization_id == org_id,
            Department.deleted_at.is_(None),
        )
        if search:
            needle = f"%{search.strip()}%"
            statement = statement.where(
                or_(Department.name.ilike(needle), Department.code.ilike(needle))
            )
        if cursor:
            position = decode_cursor(cursor)
            statement = statement.where(
                or_(
                    Department.created_at < position.occurred_at,
                    and_(
                        Department.created_at == position.occurred_at,
                        Department.id < position.record_id,
                    ),
                )
            )
        rows = list(
            (
                await self.db.scalars(
                    statement.order_by(
                        Department.created_at.desc(), Department.id.desc()
                    ).limit(bounded_limit + 1)
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

    async def create(self, org_id: uuid.UUID, name: str, code: str, description: Optional[str], creator_id: uuid.UUID) -> Department:
        dept = Department(
            organization_id=org_id,
            name=name,
            code=code,
            description=description,
            created_by=creator_id,
            updated_by=creator_id
        )
        self.db.add(dept)
        await self.db.flush()
        return dept

    async def save(self, dept: Department) -> Department:
        self.db.add(dept)
        await self.db.flush()
        return dept

    # Department Members operations
    async def get_member(self, dept_id: uuid.UUID, user_id: uuid.UUID) -> Optional[DepartmentMember]:
        stmt = (
            select(DepartmentMember)
            .where(
                DepartmentMember.department_id == dept_id,
                DepartmentMember.user_id == user_id,
                DepartmentMember.deleted_at == None
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def add_member(self, dept_id: uuid.UUID, user_id: uuid.UUID) -> DepartmentMember:
        member = DepartmentMember(
            department_id=dept_id,
            user_id=user_id
        )
        self.db.add(member)
        await self.db.flush()
        return member

    async def list_members(
        self, dept_id: uuid.UUID, *, limit: int = 100
    ) -> List[Tuple[DepartmentMember, User]]:
        limit = max(1, min(limit, 100))
        stmt = (
            select(DepartmentMember, User)
            .join(User, DepartmentMember.user_id == User.id)
            .where(
                DepartmentMember.department_id == dept_id,
                DepartmentMember.deleted_at == None
            )
            .order_by(User.first_name, User.last_name, User.id)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return result.all()
