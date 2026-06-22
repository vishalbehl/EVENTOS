# app/modules/platform/teams/router.py
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.dependencies import get_db, OrganizerOrAbove, get_current_user
from app.modules.identity.models.user import User
from app.modules.platform.teams.schemas import (
    TeamCreate, TeamUpdate, TeamResponse, TeamSummary,
    TeamMemberResponse, TeamMemberAdd
)
from app.modules.platform.teams.service import TeamService
from app.modules.platform.teams.dependencies import get_team_service
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/platform/teams", tags=["teams"])


@router.get("", response_model=List[TeamResponse])
async def list_teams(
    current_user: OrganizerOrAbove,
    department_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    sort_by: str = Query("name"),
    sort_order: str = Query("asc"),
    service: TeamService = Depends(get_team_service)
):
    items, total = await service.list_teams(
        org_id=current_user.organization_id,
        department_id=department_id,
        skip=skip,
        limit=limit,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order
    )
    
    # Enrich response with counters
    res = []
    from sqlalchemy import select, func
    from app.modules.platform.teams.models import TeamMember
    
    for team in items:
        # Get count of members
        member_count_stmt = select(func.count(TeamMember.id)).where(
            TeamMember.team_id == team.id,
            TeamMember.deleted_at == None
        )
        
        m_count = (await service.db.execute(member_count_stmt)).scalar_one()
        
        res.append(
            TeamResponse(
                id=team.id,
                department_id=team.department_id,
                organization_id=team.organization_id,
                name=team.name,
                code=team.code,
                description=team.description,
                created_at=team.created_at,
                updated_at=team.updated_at,
                department_name=team.department.name if team.department else "",
                members_count=m_count
            )
        )
    return res


@router.get("/export")
async def export_teams(
    current_user: OrganizerOrAbove,
    department_id: Optional[uuid.UUID] = Query(None),
    service: TeamService = Depends(get_team_service)
):
    csv_file = await service.export_teams_csv(current_user.organization_id, department_id)
    filename = f"teams-export-{uuid.uuid4().hex[:8]}.csv"
    return StreamingResponse(
        iter([csv_file.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("", response_model=TeamSummary, status_code=status.HTTP_201_CREATED)
async def create_team(
    payload: TeamCreate,
    current_user: OrganizerOrAbove,
    service: TeamService = Depends(get_team_service)
):
    return await service.create_team(
        org_id=current_user.organization_id,
        payload=payload,
        creator_id=current_user.id
    )


@router.get("/{id}", response_model=TeamResponse)
async def get_team(
    id: uuid.UUID,
    current_user: OrganizerOrAbove,
    service: TeamService = Depends(get_team_service)
):
    team = await service.get_team(current_user.organization_id, id)
    
    from sqlalchemy import select, func
    from app.modules.platform.teams.models import TeamMember
    
    # Get count of members
    member_count_stmt = select(func.count(TeamMember.id)).where(
        TeamMember.team_id == team.id,
        TeamMember.deleted_at == None
    )
    
    m_count = (await service.db.execute(member_count_stmt)).scalar_one()
    
    return TeamResponse(
        id=team.id,
        department_id=team.department_id,
        organization_id=team.organization_id,
        name=team.name,
        code=team.code,
        description=team.description,
        created_at=team.created_at,
        updated_at=team.updated_at,
        department_name=team.department.name if team.department else "",
        members_count=m_count
    )


@router.patch("/{id}", response_model=TeamSummary)
async def update_team(
    id: uuid.UUID,
    payload: TeamUpdate,
    current_user: OrganizerOrAbove,
    service: TeamService = Depends(get_team_service)
):
    return await service.update_team(
        org_id=current_user.organization_id,
        id=id,
        payload=payload,
        updater_id=current_user.id
    )


@router.delete("/{id}", response_model=MessageResponse)
async def delete_team(
    id: uuid.UUID,
    current_user: OrganizerOrAbove,
    service: TeamService = Depends(get_team_service)
):
    await service.delete_team(current_user.organization_id, id, current_user.id)
    return MessageResponse(message="Team deleted successfully.")


@router.post("/bulk-delete", response_model=MessageResponse)
async def bulk_delete_teams(
    ids: List[uuid.UUID],
    current_user: OrganizerOrAbove,
    service: TeamService = Depends(get_team_service)
):
    deleted_count = await service.bulk_delete(current_user.organization_id, ids, current_user.id)
    return MessageResponse(message=f"Successfully deleted {deleted_count} teams.")


# Team Member Management
@router.get("/{id}/members", response_model=List[TeamMemberResponse])
async def list_team_members(
    id: uuid.UUID,
    current_user: OrganizerOrAbove,
    service: TeamService = Depends(get_team_service)
):
    return await service.list_members(current_user.organization_id, id)


@router.post("/{id}/members", response_model=TeamMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_team_member(
    id: uuid.UUID,
    payload: TeamMemberAdd,
    current_user: OrganizerOrAbove,
    service: TeamService = Depends(get_team_service)
):
    member = await service.add_member(
        org_id=current_user.organization_id,
        team_id=id,
        user_id=payload.user_id
    )
    
    # Load user details for response
    from app.modules.identity.models.user import User
    user = await service.db.get(User, payload.user_id)
    user_name = f"{user.first_name} {user.last_name}" if user else ""
    user_email = user.email if user else ""
    
    return TeamMemberResponse(
        id=member.id,
        team_id=member.team_id,
        user_id=member.user_id,
        joined_at=member.joined_at,
        left_at=member.left_at,
        user_email=user_email,
        user_name=user_name
    )


@router.delete("/{id}/members/{user_id}", response_model=MessageResponse)
async def remove_team_member(
    id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    service: TeamService = Depends(get_team_service)
):
    await service.remove_member(
        org_id=current_user.organization_id,
        team_id=id,
        user_id=user_id,
        deleter_id=current_user.id
    )
    return MessageResponse(message="Member removed from team successfully.")
