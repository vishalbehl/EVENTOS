# app/modules/platform/roles/service.py
import uuid
import io
import csv
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform.roles.models import DepartmentRole, UserAssignment
from app.modules.platform.roles.repository import RoleRepository
from app.modules.platform.roles.schemas import RoleCreate, RoleUpdate, UserAssignmentCreate
from app.modules.platform.departments.repository import DepartmentRepository
from app.modules.platform.teams.repository import TeamRepository


class RoleService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repository = RoleRepository(db)
        self.dept_repository = DepartmentRepository(db)
        self.team_repository = TeamRepository(db)

    # Role Management
    async def get_role(self, org_id: uuid.UUID, id: uuid.UUID) -> DepartmentRole:
        role = await self.repository.get_role_by_id(org_id, id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Role not found."
            )
        return role

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
        return await self.repository.list_roles(
            org_id=org_id,
            department_id=department_id,
            skip=skip,
            limit=limit,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order
        )

    async def create_role(
        self,
        org_id: uuid.UUID,
        payload: RoleCreate,
        creator_id: uuid.UUID
    ) -> DepartmentRole:
        # Verify department if provided
        if payload.department_id:
            dept = await self.dept_repository.get_by_id(org_id, payload.department_id)
            if not dept:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Department not found."
                )

        # Check duplicate code within scope
        existing = await self.repository.get_role_by_code(org_id, payload.department_id, payload.code.upper())
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Role code '{payload.code}' is already in use in this department scope."
            )

        role = await self.repository.create_role(
            org_id=org_id,
            dept_id=payload.department_id,
            name=payload.name,
            code=payload.code.upper(),
            description=payload.description,
            access_level=payload.access_level.upper(),
            creator_id=creator_id
        )
        await self.db.commit()
        return role

    async def update_role(
        self,
        org_id: uuid.UUID,
        id: uuid.UUID,
        payload: RoleUpdate,
        updater_id: uuid.UUID
    ) -> DepartmentRole:
        role = await self.get_role(org_id, id)

        if payload.code:
            payload_code = payload.code.upper()
            if payload_code != role.code:
                # Check duplicate code
                existing = await self.repository.get_role_by_code(org_id, role.department_id, payload_code)
                if existing:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Role code '{payload.code}' is already in use in this department scope."
                    )
                role.code = payload_code

        if payload.name is not None:
            role.name = payload.name
        if payload.description is not None:
            role.description = payload.description
        if payload.access_level is not None:
            role.access_level = payload.access_level.upper()

        role.updated_by = updater_id
        role.updated_at = datetime.now(timezone.utc)

        await self.repository.save_role(role)
        await self.db.commit()
        return role

    async def delete_role(self, org_id: uuid.UUID, id: uuid.UUID, deleter_id: uuid.UUID) -> None:
        role = await self.get_role(org_id, id)
        role.deleted_at = datetime.now(timezone.utc)
        role.deleted_by = deleter_id
        await self.repository.save_role(role)
        await self.db.commit()

    async def bulk_delete_roles(self, org_id: uuid.UUID, ids: List[uuid.UUID], deleter_id: uuid.UUID) -> int:
        count = 0
        for id in ids:
            role = await self.repository.get_role_by_id(org_id, id)
            if role:
                role.deleted_at = datetime.now(timezone.utc)
                role.deleted_by = deleter_id
                await self.repository.save_role(role)
                count += 1
        if count > 0:
            await self.db.commit()
        return count

    # User Assignments Management
    async def get_assignment(self, org_id: uuid.UUID, id: uuid.UUID) -> UserAssignment:
        assignment = await self.repository.get_assignment_by_id(org_id, id)
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User assignment not found."
            )
        return assignment

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
        return await self.repository.list_assignments(
            org_id=org_id,
            user_id=user_id,
            department_id=department_id,
            team_id=team_id,
            role_id=role_id,
            skip=skip,
            limit=limit
        )

    async def create_assignment(
        self,
        org_id: uuid.UUID,
        payload: UserAssignmentCreate,
        creator_id: uuid.UUID
    ) -> UserAssignment:
        # Verify department
        dept = await self.dept_repository.get_by_id(org_id, payload.department_id)
        if not dept:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Department not found."
            )

        # Verify team if provided
        if payload.team_id:
            team = await self.team_repository.get_by_id(org_id, payload.team_id)
            if not team:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Team not found."
                )
            if team.department_id != payload.department_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Team does not belong to the selected department."
                )

        # Verify role
        role = await self.get_role(org_id, payload.role_id)
        # Global role department_id can be null, but if it has department_id it must match
        if role.department_id and role.department_id != payload.department_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Role does not belong to the selected department."
            )

        # Check existing assignment
        existing = await self.repository.get_assignment(
            user_id=payload.user_id,
            dept_id=payload.department_id,
            team_id=payload.team_id,
            role_id=payload.role_id
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User assignment already exists."
            )

        assignment = await self.repository.create_assignment(
            org_id=org_id,
            user_id=payload.user_id,
            dept_id=payload.department_id,
            team_id=payload.team_id,
            role_id=payload.role_id,
            creator_id=creator_id
        )
        
        # Proactively add user to DepartmentMember and TeamMember if not already there
        await self.dept_repository.add_member(payload.department_id, payload.user_id)
        if payload.team_id:
            await self.team_repository.add_member(payload.team_id, payload.user_id)
            
        await self.db.commit()
        return await self.get_assignment(org_id, assignment.id)

    async def delete_assignment(self, org_id: uuid.UUID, id: uuid.UUID, deleter_id: uuid.UUID) -> None:
        assignment = await self.get_assignment(org_id, id)
        assignment.deleted_at = datetime.now(timezone.utc)
        assignment.deleted_by = deleter_id
        await self.repository.save_assignment(assignment)
        await self.db.commit()

    async def bulk_delete_assignments(self, org_id: uuid.UUID, ids: List[uuid.UUID], deleter_id: uuid.UUID) -> int:
        count = 0
        for id in ids:
            assignment = await self.repository.get_assignment_by_id(org_id, id)
            if assignment:
                assignment.deleted_at = datetime.now(timezone.utc)
                assignment.deleted_by = deleter_id
                await self.repository.save_assignment(assignment)
                count += 1
        if count > 0:
            await self.db.commit()
        return count

    async def export_roles_csv(self, org_id: uuid.UUID, department_id: Optional[uuid.UUID] = None) -> io.StringIO:
        roles, _ = await self.repository.list_roles(
            org_id=org_id,
            department_id=department_id,
            skip=0,
            limit=1000,
            sort_by="name"
        )
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ID", "Department ID", "Department Name", "Name", "Code", "Description", "Access Level", "Created At"])
        for r in roles:
            writer.writerow([
                str(r.id),
                str(r.department_id) if r.department_id else "Global",
                r.department.name if r.department else "Global",
                r.name,
                r.code,
                r.description or "",
                r.access_level,
                r.created_at.strftime("%Y-%m-%d %H:%M:%S")
            ])
        output.seek(0)
        return output
