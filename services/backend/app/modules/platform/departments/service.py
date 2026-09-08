# app/modules/platform/departments/service.py
import uuid
import io
import csv
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform.departments.models import Department, DepartmentMember
from app.modules.platform.departments.repository import DepartmentRepository
from app.modules.platform.departments.schemas import DepartmentCreate, DepartmentUpdate
from app.core.concurrency import raise_version_conflict


class DepartmentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repository = DepartmentRepository(db)

    async def get_department(self, org_id: uuid.UUID, id: uuid.UUID) -> Department:
        dept = await self.repository.get_by_id(org_id, id)
        if not dept:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Department not found."
            )
        return dept

    async def list_departments(
        self,
        org_id: uuid.UUID,
        skip: int = 0,
        limit: int = 20,
        search: Optional[str] = None,
        sort_by: str = "name",
        sort_order: str = "asc"
    ) -> Tuple[List[Department], int]:
        return await self.repository.list_departments(
            org_id=org_id,
            skip=skip,
            limit=limit,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order
        )

    async def create_department(
        self,
        org_id: uuid.UUID,
        payload: DepartmentCreate,
        creator_id: uuid.UUID
    ) -> Department:
        # Check duplicate code
        existing = await self.repository.get_by_code(org_id, payload.code.upper())
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Department code '{payload.code}' is already in use."
            )

        dept = await self.repository.create(
            org_id=org_id,
            name=payload.name,
            code=payload.code.upper(),
            description=payload.description,
            creator_id=creator_id
        )
        await self.db.commit()
        return dept

    async def update_department(
        self,
        org_id: uuid.UUID,
        id: uuid.UUID,
        payload: DepartmentUpdate,
        updater_id: uuid.UUID,
        expected_version: Optional[int] = None,
    ) -> Department:
        dept = await self.get_department(org_id, id)
        if expected_version is not None and dept.version != expected_version:
            raise_version_conflict(dept.version)

        if payload.code:
            payload_code = payload.code.upper()
            if payload_code != dept.code:
                # Check duplicate code
                existing = await self.repository.get_by_code(org_id, payload_code)
                if existing:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Department code '{payload.code}' is already in use."
                    )
                dept.code = payload_code

        if payload.name is not None:
            dept.name = payload.name
        if payload.description is not None:
            dept.description = payload.description

        dept.updated_by = updater_id
        dept.updated_at = datetime.now(timezone.utc)
        dept.version = int(dept.version or 1) + 1

        await self.repository.save(dept)
        await self.db.commit()
        return dept

    async def delete_department(self, org_id: uuid.UUID, id: uuid.UUID, deleter_id: uuid.UUID) -> None:
        dept = await self.get_department(org_id, id)
        dept.deleted_at = datetime.now(timezone.utc)
        dept.deleted_by = deleter_id
        await self.repository.save(dept)
        await self.db.commit()

    async def bulk_delete(self, org_id: uuid.UUID, ids: List[uuid.UUID], deleter_id: uuid.UUID) -> int:
        count = 0
        for id in ids:
            dept = await self.repository.get_by_id(org_id, id)
            if dept:
                dept.deleted_at = datetime.now(timezone.utc)
                dept.deleted_by = deleter_id
                await self.repository.save(dept)
                count += 1
        if count > 0:
            await self.db.commit()
        return count

    # Department Membership
    async def add_member(self, org_id: uuid.UUID, dept_id: uuid.UUID, user_id: uuid.UUID) -> DepartmentMember:
        await self.get_department(org_id, dept_id)
        if await self.repository.get_user_for_organization(org_id, user_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        # Check if already a member
        existing = await self.repository.get_member(dept_id, user_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already a member of this department."
            )
        member = await self.repository.add_member(dept_id, user_id)
        await self.db.commit()
        return member

    async def remove_member(self, org_id: uuid.UUID, dept_id: uuid.UUID, user_id: uuid.UUID, deleter_id: uuid.UUID) -> None:
        await self.get_department(org_id, dept_id)
        member = await self.repository.get_member(dept_id, user_id)
        if not member:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User is not a member of this department."
            )
        member.deleted_at = datetime.now(timezone.utc)
        member.deleted_by = deleter_id
        await self.repository.save(member)
        await self.db.commit()

    async def list_members(self, org_id: uuid.UUID, dept_id: uuid.UUID) -> List[dict]:
        await self.get_department(org_id, dept_id)
        rows = await self.repository.list_members(org_id, dept_id)
        members_out = []
        for member, user in rows:
            members_out.append({
                "id": member.id,
                "department_id": member.department_id,
                "user_id": member.user_id,
                "joined_at": member.joined_at,
                "left_at": member.left_at,
                "user_email": user.email,
                "user_name": f"{user.first_name} {user.last_name}"
            })
        return members_out

    async def export_departments_csv(self, org_id: uuid.UUID) -> io.StringIO:
        # Get all departments without paging
        departments, _ = await self.repository.list_departments(
            org_id=org_id,
            skip=0,
            limit=1000,
            sort_by="name"
        )
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ID", "Name", "Code", "Description", "Created At"])
        for d in departments:
            writer.writerow([
                str(d.id),
                d.name,
                d.code,
                d.description or "",
                d.created_at.strftime("%Y-%m-%d %H:%M:%S")
            ])
        output.seek(0)
        return output
