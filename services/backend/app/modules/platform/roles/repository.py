# app/modules/platform/roles/repository.py
import uuid
from typing import List, Optional, Tuple
from sqlalchemy import select, func, or_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.platform.roles.models import DepartmentRole, UserAssignment
from app.modules.platform.departments.models import Department
from app.modules.platform.teams.models import Team
from app.modules.identity.models.user import User


class RoleRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # Roles operations
    async def get_role_by_id(self, org_id: uuid.UUID, id: uuid.UUID) -> Optional[DepartmentRole]:
        stmt = (
            select(DepartmentRole)
            .options(selectinload(DepartmentRole.department))
            .where(
                DepartmentRole.id == id,
                DepartmentRole.organization_id == org_id,
                DepartmentRole.deleted_at == None
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_role_by_code(self, org_id: uuid.UUID, dept_id: Optional[uuid.UUID], code: str) -> Optional[DepartmentRole]:
        stmt = (
            select(DepartmentRole)
            .where(
                DepartmentRole.organization_id == org_id,
                DepartmentRole.department_id == dept_id,
                DepartmentRole.code == code,
                DepartmentRole.deleted_at == None
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_roles(
        self,
        org_id: uuid.UUID,
        department_id: Optional[uuid.UUID] = None,
        skip: int = 0,
        limit: int = 20,
        search: Optional[str] = None,
        sort_by: str = "name",
        sort_order: str = "asc"
    ) -> Tuple[List[DepartmentRole], int]:
        count_stmt = select(func.count(DepartmentRole.id)).where(
            DepartmentRole.organization_id == org_id,
            DepartmentRole.deleted_at == None
        )

        stmt = select(DepartmentRole).options(selectinload(DepartmentRole.department)).where(
            DepartmentRole.organization_id == org_id,
            DepartmentRole.deleted_at == None
        )

        if department_id:
            count_stmt = count_stmt.where(DepartmentRole.department_id == department_id)
            stmt = stmt.where(DepartmentRole.department_id == department_id)

        if search:
            search_filter = or_(
                DepartmentRole.name.ilike(f"%{search}%"),
                DepartmentRole.code.ilike(f"%{search}%")
            )
            count_stmt = count_stmt.where(search_filter)
            stmt = stmt.where(search_filter)

        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar_one()

        order_col = getattr(DepartmentRole, sort_by, DepartmentRole.name)
        if sort_order.lower() == "desc":
            stmt = stmt.order_by(desc(order_col))
        else:
            stmt = stmt.order_by(asc(order_col))

        stmt = stmt.offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        items = result.scalars().all()
        return list(items), total

    async def create_role(
        self,
        org_id: uuid.UUID,
        dept_id: Optional[uuid.UUID],
        name: str,
        code: str,
        description: Optional[str],
        access_level: str,
        creator_id: uuid.UUID
    ) -> DepartmentRole:
        role = DepartmentRole(
            organization_id=org_id,
            department_id=dept_id,
            name=name,
            code=code,
            description=description,
            access_level=access_level,
            created_by=creator_id,
            updated_by=creator_id
        )
        self.db.add(role)
        await self.db.flush()
        return role

    async def save_role(self, role: DepartmentRole) -> DepartmentRole:
        self.db.add(role)
        await self.db.flush()
        return role

    # User Assignments operations
    async def get_assignment_by_id(self, org_id: uuid.UUID, id: uuid.UUID) -> Optional[UserAssignment]:
        stmt = (
            select(UserAssignment)
            .options(
                selectinload(UserAssignment.department),
                selectinload(UserAssignment.team),
                selectinload(UserAssignment.role),
                selectinload(UserAssignment.user)
            )
            .where(
                UserAssignment.id == id,
                UserAssignment.organization_id == org_id,
                UserAssignment.deleted_at == None
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_assignment(self, user_id: uuid.UUID, dept_id: uuid.UUID, team_id: Optional[uuid.UUID], role_id: uuid.UUID) -> Optional[UserAssignment]:
        stmt = (
            select(UserAssignment)
            .where(
                UserAssignment.user_id == user_id,
                UserAssignment.department_id == dept_id,
                UserAssignment.team_id == team_id,
                UserAssignment.role_id == role_id,
                UserAssignment.deleted_at == None
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_assignments(
        self,
        org_id: uuid.UUID,
        user_id: Optional[uuid.UUID] = None,
        department_id: Optional[uuid.UUID] = None,
        team_id: Optional[uuid.UUID] = None,
        role_id: Optional[uuid.UUID] = None,
        skip: int = 0,
        limit: int = 20
    ) -> Tuple[List[UserAssignment], int]:
        count_stmt = select(func.count(UserAssignment.id)).where(
            UserAssignment.organization_id == org_id,
            UserAssignment.deleted_at == None
        )

        stmt = (
            select(UserAssignment)
            .options(
                selectinload(UserAssignment.department),
                selectinload(UserAssignment.team),
                selectinload(UserAssignment.role),
                selectinload(UserAssignment.user)
            )
            .where(
                UserAssignment.organization_id == org_id,
                UserAssignment.deleted_at == None
            )
        )

        if user_id:
            count_stmt = count_stmt.where(UserAssignment.user_id == user_id)
            stmt = stmt.where(UserAssignment.user_id == user_id)
        if department_id:
            count_stmt = count_stmt.where(UserAssignment.department_id == department_id)
            stmt = stmt.where(UserAssignment.department_id == department_id)
        if team_id:
            count_stmt = count_stmt.where(UserAssignment.team_id == team_id)
            stmt = stmt.where(UserAssignment.team_id == team_id)
        if role_id:
            count_stmt = count_stmt.where(UserAssignment.role_id == role_id)
            stmt = stmt.where(UserAssignment.role_id == role_id)

        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar_one()

        stmt = stmt.order_by(desc(UserAssignment.created_at)).offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        items = result.scalars().all()
        return list(items), total

    async def create_assignment(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        dept_id: uuid.UUID,
        team_id: Optional[uuid.UUID],
        role_id: uuid.UUID,
        creator_id: uuid.UUID
    ) -> UserAssignment:
        assignment = UserAssignment(
            organization_id=org_id,
            user_id=user_id,
            department_id=dept_id,
            team_id=team_id,
            role_id=role_id,
            created_by=creator_id,
            updated_by=creator_id
        )
        self.db.add(assignment)
        await self.db.flush()
        return assignment

    async def save_assignment(self, assignment: UserAssignment) -> UserAssignment:
        self.db.add(assignment)
        await self.db.flush()
        return assignment
