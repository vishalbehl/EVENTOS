# app/modules/platform/departments/router.py
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.dependencies import get_db, OrganizerOrAbove, get_current_user
from app.modules.identity.models.user import User
from app.modules.platform.departments.schemas import (
    DepartmentCreate, DepartmentUpdate, DepartmentResponse, DepartmentSummary,
    DepartmentMemberResponse, DepartmentMemberAdd
)
from app.modules.platform.departments.service import DepartmentService
from app.modules.platform.departments.dependencies import get_department_service
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/platform/departments", tags=["departments"])


@router.get("", response_model=List[DepartmentResponse])
async def list_departments(
    current_user: OrganizerOrAbove,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    sort_by: str = Query("name"),
    sort_order: str = Query("asc"),
    service: DepartmentService = Depends(get_department_service)
):
    items, total = await service.list_departments(
        org_id=current_user.organization_id,
        skip=skip,
        limit=limit,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order
    )
    
    # Enrich response with counters
    res = []
    from sqlalchemy import select, func
    from app.modules.platform.departments.models import DepartmentMember
    from app.modules.platform.teams.models import Team
    
    for dept in items:
        # Get count of members
        member_count_stmt = select(func.count(DepartmentMember.id)).where(
            DepartmentMember.department_id == dept.id,
            DepartmentMember.deleted_at == None
        )
        # Get count of teams
        team_count_stmt = select(func.count(Team.id)).where(
            Team.department_id == dept.id,
            Team.deleted_at == None
        )
        
        m_count = (await service.db.execute(member_count_stmt)).scalar_one()
        t_count = (await service.db.execute(team_count_stmt)).scalar_one()
        
        res.append(
            DepartmentResponse(
                id=dept.id,
                organization_id=dept.organization_id,
                name=dept.name,
                code=dept.code,
                description=dept.description,
                created_at=dept.created_at,
                updated_at=dept.updated_at,
                members_count=m_count,
                teams_count=t_count
            )
        )
    return res


@router.get("/export")
async def export_departments(
    current_user: OrganizerOrAbove,
    service: DepartmentService = Depends(get_department_service)
):
    csv_file = await service.export_departments_csv(current_user.organization_id)
    filename = f"departments-export-{uuid.uuid4().hex[:8]}.csv"
    return StreamingResponse(
        iter([csv_file.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("", response_model=DepartmentSummary, status_code=status.HTTP_201_CREATED)
async def create_department(
    payload: DepartmentCreate,
    current_user: OrganizerOrAbove,
    service: DepartmentService = Depends(get_department_service)
):
    return await service.create_department(
        org_id=current_user.organization_id,
        payload=payload,
        creator_id=current_user.id
    )


@router.get("/{id}", response_model=DepartmentResponse)
async def get_department(
    id: uuid.UUID,
    current_user: OrganizerOrAbove,
    service: DepartmentService = Depends(get_department_service)
):
    dept = await service.get_department(current_user.organization_id, id)
    
    from sqlalchemy import select, func
    from app.modules.platform.departments.models import DepartmentMember
    from app.modules.platform.teams.models import Team
    
    # Get count of members
    member_count_stmt = select(func.count(DepartmentMember.id)).where(
        DepartmentMember.department_id == dept.id,
        DepartmentMember.deleted_at == None
    )
    # Get count of teams
    team_count_stmt = select(func.count(Team.id)).where(
        Team.department_id == dept.id,
        Team.deleted_at == None
    )
    
    m_count = (await service.db.execute(member_count_stmt)).scalar_one()
    t_count = (await service.db.execute(team_count_stmt)).scalar_one()
    
    return DepartmentResponse(
        id=dept.id,
        organization_id=dept.organization_id,
        name=dept.name,
        code=dept.code,
        description=dept.description,
        created_at=dept.created_at,
        updated_at=dept.updated_at,
        members_count=m_count,
        teams_count=t_count
    )


@router.patch("/{id}", response_model=DepartmentSummary)
async def update_department(
    id: uuid.UUID,
    payload: DepartmentUpdate,
    current_user: OrganizerOrAbove,
    service: DepartmentService = Depends(get_department_service)
):
    return await service.update_department(
        org_id=current_user.organization_id,
        id=id,
        payload=payload,
        updater_id=current_user.id
    )


@router.delete("/{id}", response_model=MessageResponse)
async def delete_department(
    id: uuid.UUID,
    current_user: OrganizerOrAbove,
    service: DepartmentService = Depends(get_department_service)
):
    await service.delete_department(current_user.organization_id, id, current_user.id)
    return MessageResponse(message="Department deleted successfully.")


@router.post("/bulk-delete", response_model=MessageResponse)
async def bulk_delete_departments(
    ids: List[uuid.UUID],
    current_user: OrganizerOrAbove,
    service: DepartmentService = Depends(get_department_service)
):
    deleted_count = await service.bulk_delete(current_user.organization_id, ids, current_user.id)
    return MessageResponse(message=f"Successfully deleted {deleted_count} departments.")


# Department Member Management
@router.get("/{id}/members", response_model=List[DepartmentMemberResponse])
async def list_department_members(
    id: uuid.UUID,
    current_user: OrganizerOrAbove,
    service: DepartmentService = Depends(get_department_service)
):
    return await service.list_members(current_user.organization_id, id)


@router.post("/{id}/members", response_model=DepartmentMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_department_member(
    id: uuid.UUID,
    payload: DepartmentMemberAdd,
    current_user: OrganizerOrAbove,
    service: DepartmentService = Depends(get_department_service)
):
    member = await service.add_member(
        org_id=current_user.organization_id,
        dept_id=id,
        user_id=payload.user_id
    )
    
    # Load user details for response
    from app.modules.identity.models.user import User
    user = await service.db.get(User, payload.user_id)
    user_name = f"{user.first_name} {user.last_name}" if user else ""
    user_email = user.email if user else ""
    
    return DepartmentMemberResponse(
        id=member.id,
        department_id=member.department_id,
        user_id=member.user_id,
        joined_at=member.joined_at,
        left_at=member.left_at,
        user_email=user_email,
        user_name=user_name
    )


@router.delete("/{id}/members/{user_id}", response_model=MessageResponse)
async def remove_department_member(
    id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    service: DepartmentService = Depends(get_department_service)
):
    await service.remove_member(
        org_id=current_user.organization_id,
        dept_id=id,
        user_id=user_id,
        deleter_id=current_user.id
    )
    return MessageResponse(message="Member removed from department successfully.")
