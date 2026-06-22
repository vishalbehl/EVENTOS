# app/modules/platform/teams/repository.py
import uuid
from typing import List, Optional, Tuple
from sqlalchemy import select, func, or_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.platform.teams.models import Team, TeamMember
from app.modules.platform.departments.models import Department
from app.modules.identity.models.user import User


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
            stmt = stmt.order_by(desc(order_col))
        else:
            stmt = stmt.order_by(asc(order_col))

        stmt = stmt.offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        items = result.scalars().all()
        return list(items), total

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

    async def list_members(self, team_id: uuid.UUID) -> List[Tuple[TeamMember, User]]:
        stmt = (
            select(TeamMember, User)
            .join(User, TeamMember.user_id == User.id)
            .where(
                TeamMember.team_id == team_id,
                TeamMember.deleted_at == None
            )
            .order_by(User.first_name, User.last_name)
        )
        result = await self.db.execute(stmt)
        return result.all()
