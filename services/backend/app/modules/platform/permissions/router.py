# app/modules/platform/permissions/router.py
import uuid
from typing import List
from fastapi import APIRouter, Body, Depends, HTTPException, status

from app.dependencies import StepUpAuth, OrganizerOrAbove, SuperAdminOnly
from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.roles.models import DepartmentRole
from app.modules.platform.support_access import PlatformSupportScopeDependency
from app.modules.platform.permissions.schemas import PermissionResponse, RolePermissionToggleRequest
from app.modules.platform.permissions.service import PermissionService
from app.modules.platform.permissions.dependencies import get_permission_service
from app.schemas.common import MessageResponse

router = APIRouter(tags=["permissions"])
admin_router = APIRouter(prefix="/superadmin/access", tags=["superadmin-access"])


async def _require_scoped_role(service: PermissionService, organization_id: uuid.UUID, role_id: uuid.UUID) -> None:
    role = await service.db.get(DepartmentRole, role_id)
    if not role or role.organization_id != organization_id or role.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found.")


@admin_router.get("/permissions", response_model=List[PermissionResponse])
async def admin_list_permissions(
    support_scope: PlatformSupportScopeDependency,
    service: PermissionService = Depends(get_permission_service),
):
    async with TenantContextGuard.scoped(service.db, support_scope.organization_id):
        permissions = await service.list_permissions()
        service.db.add(AuditLog(
            organization_id=support_scope.organization_id,
            actor_user_id=support_scope.actor.id,
            resource_type="platform_permissions",
            resource_id=support_scope.organization_id,
            action_type="PLATFORM_SUPPORT_DATA_READ",
            new_state={"reason": support_scope.reason, "result_count": len(permissions)},
            is_sensitive=True,
        ))
        await service.db.commit()
        return permissions


@admin_router.get("/roles/{role_id}/permissions", response_model=List[str])
async def admin_get_role_permissions(
    role_id: uuid.UUID,
    support_scope: PlatformSupportScopeDependency,
    service: PermissionService = Depends(get_permission_service),
):
    async with TenantContextGuard.scoped(service.db, support_scope.organization_id):
        await _require_scoped_role(service, support_scope.organization_id, role_id)
        return await service.get_role_permissions(role_id)


@admin_router.post("/roles/{role_id}/permissions/{permission_id}/toggle", response_model=MessageResponse)
async def admin_toggle_role_permission(
    role_id: uuid.UUID,
    permission_id: uuid.UUID,
    payload: RolePermissionToggleRequest,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    service: PermissionService = Depends(get_permission_service),
):
    del step_up
    async with TenantContextGuard.scoped(service.db, support_scope.organization_id):
        message = await service.toggle_role_permission(
            org_id=support_scope.organization_id,
            actor_id=support_scope.actor.id,
            role_id=role_id,
            permission_id=permission_id,
            reason=payload.reason,
        )
    return MessageResponse(message=message)


@router.get("/platform/permissions", response_model=List[PermissionResponse])
async def list_permissions(
    current_user: OrganizerOrAbove,
    service: PermissionService = Depends(get_permission_service)
):
    return await service.list_permissions()


@router.post("/platform/permissions/seed", response_model=MessageResponse)
async def seed_permissions(
    current_user: SuperAdminOnly,
    step_up: StepUpAuth,
    service: PermissionService = Depends(get_permission_service)
):
    del current_user, step_up
    seeded_count = await service.seed_permissions()
    return MessageResponse(message=f"Successfully seeded {seeded_count} permissions.")


@router.get("/platform/roles/{role_id}/permissions", response_model=List[str])
async def get_role_permissions(
    role_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    service: PermissionService = Depends(get_permission_service)
):
    await _require_scoped_role(service, current_user.organization_id, role_id)
    return await service.get_role_permissions(role_id)


@router.post("/platform/roles/{role_id}/permissions/{permission_id}/toggle", response_model=MessageResponse)
async def toggle_role_permission(
    role_id: uuid.UUID,
    permission_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    payload: RolePermissionToggleRequest = Body(...),
    service: PermissionService = Depends(get_permission_service)
):
    msg = await service.toggle_role_permission(
        org_id=current_user.organization_id,
        actor_id=current_user.id,
        role_id=role_id,
        permission_id=permission_id,
        reason=payload.reason,
    )
    return MessageResponse(message=msg)
