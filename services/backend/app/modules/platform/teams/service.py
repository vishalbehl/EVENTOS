# app/modules/platform/teams/service.py
import uuid
import io
import csv
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform.teams.models import Team, TeamMember
from app.modules.platform.teams.repository import TeamRepository
from app.modules.platform.teams.schemas import TeamCreate, TeamUpdate
from app.modules.platform.departments.repository import DepartmentRepository
from app.core.concurrency import raise_version_conflict


class TeamService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repository = TeamRepository(db)
        self.dept_repository = DepartmentRepository(db)

    async def get_team(self, org_id: uuid.UUID, id: uuid.UUID) -> Team:
        team = await self.repository.get_by_id(org_id, id)
        if not team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found."
            )
        return team

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
        return await self.repository.list_teams(
            org_id=org_id,
            department_id=department_id,
            skip=skip,
            limit=limit,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order
        )

    async def create_team(
        self,
        org_id: uuid.UUID,
        payload: TeamCreate,
        creator_id: uuid.UUID
    ) -> Team:
        # Verify department exists and belongs to organization
        dept = await self.dept_repository.get_by_id(org_id, payload.department_id)
        if not dept:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Department not found."
            )

        # Check duplicate code within department
        existing = await self.repository.get_by_code(payload.department_id, payload.code.upper())
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Team code '{payload.code}' is already in use in this department."
            )

        team = await self.repository.create(
            org_id=org_id,
            dept_id=payload.department_id,
            name=payload.name,
            code=payload.code.upper(),
            description=payload.description,
            creator_id=creator_id
        )
        await self.db.commit()
        return team

    async def update_team(
        self,
        org_id: uuid.UUID,
        id: uuid.UUID,
        payload: TeamUpdate,
        updater_id: uuid.UUID,
        expected_version: Optional[int] = None,
    ) -> Team:
        team = await self.get_team(org_id, id)
        if expected_version is not None and team.version != expected_version:
            raise_version_conflict(team.version)

        if payload.code:
            payload_code = payload.code.upper()
            if payload_code != team.code:
                # Check duplicate code
                existing = await self.repository.get_by_code(team.department_id, payload_code)
                if existing:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Team code '{payload.code}' is already in use in this department."
                    )
                team.code = payload_code

        if payload.name is not None:
            team.name = payload.name
        if payload.description is not None:
            team.description = payload.description

        team.updated_by = updater_id
        team.updated_at = datetime.now(timezone.utc)
        team.version = int(team.version or 1) + 1

        await self.repository.save(team)
        await self.db.commit()
        return team

    async def delete_team(self, org_id: uuid.UUID, id: uuid.UUID, deleter_id: uuid.UUID) -> None:
        team = await self.get_team(org_id, id)
        team.deleted_at = datetime.now(timezone.utc)
        team.deleted_by = deleter_id
        await self.repository.save(team)
        await self.db.commit()

    async def bulk_delete(self, org_id: uuid.UUID, ids: List[uuid.UUID], deleter_id: uuid.UUID) -> int:
        count = 0
        for id in ids:
            team = await self.repository.get_by_id(org_id, id)
            if team:
                team.deleted_at = datetime.now(timezone.utc)
                team.deleted_by = deleter_id
                await self.repository.save(team)
                count += 1
        if count > 0:
            await self.db.commit()
        return count

    # Team Membership
    async def add_member(self, org_id: uuid.UUID, team_id: uuid.UUID, user_id: uuid.UUID) -> TeamMember:
        await self.get_team(org_id, team_id)
        # Check if already a member
        existing = await self.repository.get_member(team_id, user_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already a member of this team."
            )
        member = await self.repository.add_member(team_id, user_id)
        await self.db.commit()
        return member

    async def remove_member(self, org_id: uuid.UUID, team_id: uuid.UUID, user_id: uuid.UUID, deleter_id: uuid.UUID) -> None:
        await self.get_team(org_id, team_id)
        member = await self.repository.get_member(team_id, user_id)
        if not member:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User is not a member of this team."
            )
        member.deleted_at = datetime.now(timezone.utc)
        member.deleted_by = deleter_id
        await self.repository.save(member)
        await self.db.commit()

    async def list_members(self, org_id: uuid.UUID, team_id: uuid.UUID) -> List[dict]:
        await self.get_team(org_id, team_id)
        rows = await self.repository.list_members(team_id)
        members_out = []
        for member, user in rows:
            members_out.append({
                "id": member.id,
                "team_id": member.team_id,
                "user_id": member.user_id,
                "joined_at": member.joined_at,
                "left_at": member.left_at,
                "user_email": user.email,
                "user_name": f"{user.first_name} {user.last_name}"
            })
        return members_out

    async def export_teams_csv(self, org_id: uuid.UUID, department_id: Optional[uuid.UUID] = None) -> io.StringIO:
        teams, _ = await self.repository.list_teams(
            org_id=org_id,
            department_id=department_id,
            skip=0,
            limit=1000,
            sort_by="name"
        )
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ID", "Department ID", "Department Name", "Name", "Code", "Description", "Created At"])
        for t in teams:
            writer.writerow([
                str(t.id),
                str(t.department_id),
                t.department.name if t.department else "",
                t.name,
                t.code,
                t.description or "",
                t.created_at.strftime("%Y-%m-%d %H:%M:%S")
            ])
        output.seek(0)
        return output
