# app/modules/platform/roles/router.py
import uuid
from typing import List, Optional
from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.dependencies import StepUpAuth, OrganizerOrAbove
from app.core.tenant_context import TenantContextGuard
from app.modules.audit.services.audit_service import AuditContext, AuditService
from app.modules.platform.support_access import PlatformSupportScopeDependency
from app.modules.identity.models.user import User
from app.modules.platform.roles.schemas import (
    RoleCreate, RoleUpdate, RoleResponse, RoleSummary,
    UserAssignmentCreate, UserAssignmentResponse, DestructiveActionRequest,
    AdminRoleCreate, AdminRoleUpdate,
)
from app.modules.platform.roles.service import RoleService
from app.modules.platform.roles.dependencies import get_role_service
from app.modules.platform.roles.application.queries import RoleQueryService, AssignmentQueryService
from app.schemas.common import MessageResponse
from app.schemas.cursor_pagination import CursorPage
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response

router = APIRouter(prefix="/platform/roles", tags=["roles"])
admin_router = APIRouter(prefix="/superadmin/access", tags=["superadmin-access"])


@admin_router.get("/roles", response_model=List[RoleResponse])
async def admin_list_roles(
    support_scope: PlatformSupportScopeDependency,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    service: RoleService = Depends(get_role_service),
):
    async with TenantContextGuard.scoped(service.db, support_scope.organization_id):
        rows, _ = await RoleQueryService(service.db).list_with_counts(
            organization_id=support_scope.organization_id,
            offset=skip,
            limit=limit,
            search=search,
        )
        response = [RoleResponse(**row) for row in rows]
        await AuditService.write_log(
            AuditContext(
                request_id=support_scope.request_id,
                correlation_id=support_scope.correlation_id,
                organization_id=support_scope.organization_id,
                actor_user_id=support_scope.actor.id,
                actor_role=support_scope.actor.platform_role or support_scope.actor.role,
                actor_ip=support_scope.actor_ip,
                actor_user_agent=support_scope.actor_user_agent,
                resource_type="platform_roles",
                resource_id=support_scope.organization_id,
                action_type="PLATFORM_SUPPORT_DATA_READ",
                new_state={"reason": support_scope.reason, "result_count": len(response)},
                is_sensitive=True,
            )
        )
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
    expected_version: Optional[int] = Header(None, alias="If-Match", ge=1),
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
            expected_version=expected_version,
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
    
    rows, _ = await RoleQueryService(service.db).list_with_counts(
        organization_id=current_user.organization_id,
        department_id=department_id,
        offset=skip,
        limit=limit,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return [RoleResponse(**row) for row in rows]


@router.get("/cursor", response_model=CursorPage[RoleResponse])
async def cursor_roles(
    current_user: OrganizerOrAbove,
    department_id: Optional[uuid.UUID] = Query(None),
    cursor: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    service: RoleService = Depends(get_role_service),
):
    return await service.repository.cursor_page(
        current_user.organization_id,
        cursor=cursor,
        limit=limit,
        department_id=department_id,
        search=search,
    )


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
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    service: RoleService = Depends(get_role_service)
):
    idem = None
    if idempotency_key:
        idem = await begin_idempotent(
            service.db,
            organization_id=current_user.organization_id,
            actor_id=current_user.id,
            operation="platform.role.create",
            key=idempotency_key,
            payload=payload.model_dump(mode="json"),
        )
        replay = replay_response(idem)
        if replay:
            return replay[1]
    role = await service.create_role(
        org_id=current_user.organization_id,
        payload=payload,
        creator_id=current_user.id
    )
    if idem:
        body = RoleSummary.model_validate(role).model_dump(mode="json")
        await complete_idempotent(
            service.db, idem, response_status=status.HTTP_201_CREATED,
            response_body=body, resource_id=role.id
        )
        await service.db.commit()
    return role


@router.get("/{id}", response_model=RoleResponse)
async def get_role(
    id: uuid.UUID,
    current_user: OrganizerOrAbove,
    service: RoleService = Depends(get_role_service)
):
    row = await RoleQueryService(service.db).get_with_counts(
        current_user.organization_id, id
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found.")
    return RoleResponse(**row)


@router.patch("/{id}", response_model=RoleSummary)
async def update_role(
    id: uuid.UUID,
    payload: RoleUpdate,
    current_user: OrganizerOrAbove,
    expected_version: Optional[int] = Header(None, alias="If-Match", ge=1),
    service: RoleService = Depends(get_role_service)
):
    return await service.update_role(
        org_id=current_user.organization_id,
        id=id,
        payload=payload,
        updater_id=current_user.id,
        expected_version=expected_version,
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
    rows, _ = await AssignmentQueryService(service.db).list_page(
        organization_id=current_user.organization_id,
        user_id=user_id,
        department_id=department_id,
        team_id=team_id,
        role_id=role_id,
        offset=skip,
        limit=limit,
    )
    return [UserAssignmentResponse(**row) for row in rows]


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
