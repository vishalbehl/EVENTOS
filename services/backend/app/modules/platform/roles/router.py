# app/modules/platform/roles/router.py
import uuid
from typing import List, Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.dependencies import StepUpAuth, OrganizerOrAbove
from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.support_access import PlatformSupportScopeDependency
from app.modules.identity.models.user import User
from app.modules.platform.roles.schemas import (
    RoleCreate, RoleUpdate, RoleResponse, RoleSummary,
    UserAssignmentCreate, UserAssignmentResponse, DestructiveActionRequest,
    AdminRoleCreate, AdminRoleUpdate,
)
from app.modules.platform.roles.service import RoleService
from app.modules.platform.roles.dependencies import get_role_service
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/platform/roles", tags=["roles"])
admin_router = APIRouter(prefix="/superadmin/access", tags=["superadmin-access"])


async def _role_response(service: RoleService, role) -> RoleResponse:
    from sqlalchemy import func, select
    from app.modules.platform.permissions.models import PlatformRolePermission
    from app.modules.platform.roles.models import UserAssignment

    permission_count = await service.db.scalar(
        select(func.count(PlatformRolePermission.id)).where(PlatformRolePermission.role_id == role.id)
    ) or 0
    user_count = await service.db.scalar(
        select(func.count(UserAssignment.id)).where(
            UserAssignment.role_id == role.id,
            UserAssignment.deleted_at.is_(None),
        )
    ) or 0
    return RoleResponse(
        id=role.id,
        organization_id=role.organization_id,
        department_id=role.department_id,
        name=role.name,
        code=role.code,
        description=role.description,
        access_level=role.access_level,
        created_at=role.created_at,
        updated_at=role.updated_at,
        department_name=role.department.name if role.department else "Global",
        permissions_count=permission_count,
        users_count=user_count,
    )


@admin_router.get("/roles", response_model=List[RoleResponse])
async def admin_list_roles(
    support_scope: PlatformSupportScopeDependency,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    service: RoleService = Depends(get_role_service),
):
    async with TenantContextGuard.scoped(service.db, support_scope.organization_id):
        roles, _ = await service.list_roles(
            org_id=support_scope.organization_id,
            skip=skip,
            limit=limit,
            search=search,
        )
        response = [await _role_response(service, role) for role in roles]
        service.db.add(AuditLog(
            organization_id=support_scope.organization_id,
            actor_user_id=support_scope.actor.id,
            resource_type="platform_roles",
            resource_id=support_scope.organization_id,
            action_type="PLATFORM_SUPPORT_DATA_READ",
            new_state={"reason": support_scope.reason, "result_count": len(response)},
            is_sensitive=True,
        ))
        await service.db.commit()
        return response


@admin_router.post("/roles", response_model=RoleSummary, status_code=status.HTTP_201_CREATED)
async def admin_create_role(
    payload: AdminRoleCreate,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    service: RoleService = Depends(get_role_service),
):
    del step_up
    async with TenantContextGuard.scoped(service.db, support_scope.organization_id):
        return await service.create_role(
            support_scope.organization_id,
            payload,
            support_scope.actor.id,
            reason=payload.reason,
        )


@admin_router.patch("/roles/{role_id}", response_model=RoleSummary)
async def admin_update_role(
    role_id: uuid.UUID,
    payload: AdminRoleUpdate,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    service: RoleService = Depends(get_role_service),
):
    del step_up
    async with TenantContextGuard.scoped(service.db, support_scope.organization_id):
        return await service.update_role(
            support_scope.organization_id,
            role_id,
            payload,
            support_scope.actor.id,
            reason=payload.reason,
            expected_updated_at=payload.expected_updated_at,
        )


@admin_router.delete("/roles/{role_id}", response_model=MessageResponse)
async def admin_delete_role(
    role_id: uuid.UUID,
    payload: DestructiveActionRequest,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    service: RoleService = Depends(get_role_service),
):
    del step_up
    async with TenantContextGuard.scoped(service.db, support_scope.organization_id):
        await service.delete_role(
            support_scope.organization_id,
            role_id,
            support_scope.actor.id,
            payload.reason,
        )
    return MessageResponse(message="Role archived.")


@router.get("", response_model=List[RoleResponse])
async def list_roles(
    current_user: OrganizerOrAbove,
    department_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    sort_by: str = Query("name"),
    sort_order: str = Query("asc"),
    service: RoleService = Depends(get_role_service)
):
    items, total = await service.list_roles(
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
    from app.modules.platform.permissions.models import PlatformRolePermission
    from app.modules.platform.roles.models import UserAssignment
    
    for role in items:
        # Get count of permissions
        perm_count_stmt = select(func.count(PlatformRolePermission.id)).where(
            PlatformRolePermission.role_id == role.id
        )
        # Get count of assigned users
        user_count_stmt = select(func.count(UserAssignment.id)).where(
            UserAssignment.role_id == role.id,
            UserAssignment.deleted_at == None
        )
        
        p_count = (await service.db.execute(perm_count_stmt)).scalar_one()
        u_count = (await service.db.execute(user_count_stmt)).scalar_one()
        
        res.append(
            RoleResponse(
                id=role.id,
                organization_id=role.organization_id,
                department_id=role.department_id,
                name=role.name,
                code=role.code,
                description=role.description,
                access_level=role.access_level,
                created_at=role.created_at,
                updated_at=role.updated_at,
                department_name=role.department.name if role.department else "Global",
                permissions_count=p_count,
                users_count=u_count
            )
        )
    return res


@router.get("/export")
async def export_roles(
    current_user: OrganizerOrAbove,
    department_id: Optional[uuid.UUID] = Query(None),
    service: RoleService = Depends(get_role_service)
):
    csv_file = await service.export_roles_csv(current_user.organization_id, department_id)
    filename = f"roles-export-{uuid.uuid4().hex[:8]}.csv"
    return StreamingResponse(
        iter([csv_file.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("", response_model=RoleSummary, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: RoleCreate,
    current_user: OrganizerOrAbove,
    service: RoleService = Depends(get_role_service)
):
    return await service.create_role(
        org_id=current_user.organization_id,
        payload=payload,
        creator_id=current_user.id
    )


@router.get("/{id}", response_model=RoleResponse)
async def get_role(
    id: uuid.UUID,
    current_user: OrganizerOrAbove,
    service: RoleService = Depends(get_role_service)
):
    role = await service.get_role(current_user.organization_id, id)
    
    from sqlalchemy import select, func
    from app.modules.platform.permissions.models import PlatformRolePermission
    from app.modules.platform.roles.models import UserAssignment
    
    # Get count of permissions
    perm_count_stmt = select(func.count(PlatformRolePermission.id)).where(
        PlatformRolePermission.role_id == role.id
    )
    # Get count of assigned users
    user_count_stmt = select(func.count(UserAssignment.id)).where(
        UserAssignment.role_id == role.id,
        UserAssignment.deleted_at == None
    )
    
    p_count = (await service.db.execute(perm_count_stmt)).scalar_one()
    u_count = (await service.db.execute(user_count_stmt)).scalar_one()
    
    return RoleResponse(
        id=role.id,
        organization_id=role.organization_id,
        department_id=role.department_id,
        name=role.name,
        code=role.code,
        description=role.description,
        access_level=role.access_level,
        created_at=role.created_at,
        updated_at=role.updated_at,
        department_name=role.department.name if role.department else "Global",
        permissions_count=p_count,
        users_count=u_count
    )


@router.patch("/{id}", response_model=RoleSummary)
async def update_role(
    id: uuid.UUID,
    payload: RoleUpdate,
    current_user: OrganizerOrAbove,
    service: RoleService = Depends(get_role_service)
):
    return await service.update_role(
        org_id=current_user.organization_id,
        id=id,
        payload=payload,
        updater_id=current_user.id
    )


@router.delete("/{id}", response_model=MessageResponse)
async def delete_role(
    id: uuid.UUID,
    current_user: OrganizerOrAbove,
    payload: DestructiveActionRequest = Body(...),
    service: RoleService = Depends(get_role_service)
):
    await service.delete_role(current_user.organization_id, id, current_user.id, payload.reason)
    return MessageResponse(message="Role deleted.")


@router.post("/bulk-delete", response_model=MessageResponse)
async def bulk_delete_roles(
    ids: List[uuid.UUID],
    current_user: OrganizerOrAbove,
    service: RoleService = Depends(get_role_service)
):
    deleted_count = await service.bulk_delete_roles(current_user.organization_id, ids, current_user.id)
    return MessageResponse(message=f"Successfully deleted {deleted_count} roles.")


# =====================================================================
# USER ASSIGNMENTS ENDPOINTS (Exposed on /platform/assignments router path)
# =====================================================================

assignments_router = APIRouter(prefix="/platform/assignments", tags=["assignments"])


@assignments_router.get("", response_model=List[UserAssignmentResponse])
async def list_assignments(
    current_user: OrganizerOrAbove,
    user_id: Optional[uuid.UUID] = Query(None),
    department_id: Optional[uuid.UUID] = Query(None),
    team_id: Optional[uuid.UUID] = Query(None),
    role_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    service: RoleService = Depends(get_role_service)
):
    items, total = await service.list_assignments(
        org_id=current_user.organization_id,
        user_id=user_id,
        department_id=department_id,
        team_id=team_id,
        role_id=role_id,
        skip=skip,
        limit=limit
    )
    
    res = []
    for asgn in items:
        res.append(
            UserAssignmentResponse(
                id=asgn.id,
                organization_id=asgn.organization_id,
                user_id=asgn.user_id,
                department_id=asgn.department_id,
                team_id=asgn.team_id,
                role_id=asgn.role_id,
                created_at=asgn.created_at,
                user_name=f"{asgn.user.first_name} {asgn.user.last_name}" if asgn.user else "",
                user_email=asgn.user.email if asgn.user else "",
                department_name=asgn.department.name if asgn.department else "",
                team_name=asgn.team.name if asgn.team else "None",
                role_name=asgn.role.name if asgn.role else ""
            )
        )
    return res


@assignments_router.post("", response_model=UserAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    payload: UserAssignmentCreate,
    current_user: OrganizerOrAbove,
    service: RoleService = Depends(get_role_service)
):
    asgn = await service.create_assignment(
        org_id=current_user.organization_id,
        payload=payload,
        creator_id=current_user.id
    )
    return UserAssignmentResponse(
        id=asgn.id,
        organization_id=asgn.organization_id,
        user_id=asgn.user_id,
        department_id=asgn.department_id,
        team_id=asgn.team_id,
        role_id=asgn.role_id,
        created_at=asgn.created_at,
        user_name=f"{asgn.user.first_name} {asgn.user.last_name}" if asgn.user else "",
        user_email=asgn.user.email if asgn.user else "",
        department_name=asgn.department.name if asgn.department else "",
        team_name=asgn.team.name if asgn.team else "None",
        role_name=asgn.role.name if asgn.role else ""
    )


@assignments_router.delete("/{id}", response_model=MessageResponse)
async def delete_assignment(
    id: uuid.UUID,
    current_user: OrganizerOrAbove,
    service: RoleService = Depends(get_role_service)
):
    await service.delete_assignment(current_user.organization_id, id, current_user.id)
    return MessageResponse(message="User assignment deleted successfully.")


@assignments_router.post("/bulk-delete", response_model=MessageResponse)
async def bulk_delete_assignments(
    ids: List[uuid.UUID],
    current_user: OrganizerOrAbove,
    service: RoleService = Depends(get_role_service)
):
    deleted_count = await service.bulk_delete_assignments(current_user.organization_id, ids, current_user.id)
    return MessageResponse(message=f"Successfully deleted {deleted_count} user assignments.")
