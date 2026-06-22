# app/modules/platform/departments/repository.py
import uuid
from typing import List, Optional, Tuple
from sqlalchemy import select, func, or_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.platform.departments.models import Department, DepartmentMember
from app.modules.identity.models.user import User


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
            stmt = stmt.order_by(desc(order_col))
        else:
            stmt = stmt.order_by(asc(order_col))

        stmt = stmt.offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        items = result.scalars().all()
        return list(items), total

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

    async def list_members(self, dept_id: uuid.UUID) -> List[Tuple[DepartmentMember, User]]:
        stmt = (
            select(DepartmentMember, User)
            .join(User, DepartmentMember.user_id == User.id)
            .where(
                DepartmentMember.department_id == dept_id,
                DepartmentMember.deleted_at == None
            )
            .order_by(User.first_name, User.last_name)
        )
        result = await self.db.execute(stmt)
        return result.all()
