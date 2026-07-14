# app/modules/platform/permissions/router.py
import uuid
from typing import List
from fastapi import APIRouter, Body, Depends, HTTPException, status

from app.dependencies import get_db, OrganizerOrAbove, SuperAdminOnly
from app.modules.platform.permissions.schemas import PermissionResponse, RolePermissionToggleRequest
from app.modules.platform.permissions.service import PermissionService
from app.modules.platform.permissions.dependencies import get_permission_service
from app.schemas.common import MessageResponse

router = APIRouter(tags=["permissions"])


@router.get("/platform/permissions", response_model=List[PermissionResponse])
async def list_permissions(
    current_user: OrganizerOrAbove,
    service: PermissionService = Depends(get_permission_service)
):
    return await service.list_permissions()


@router.post("/platform/permissions/seed", response_model=MessageResponse)
async def seed_permissions(
    current_user: OrganizerOrAbove,
    service: PermissionService = Depends(get_permission_service)
):
    seeded_count = await service.seed_permissions()
    return MessageResponse(message=f"Successfully seeded {seeded_count} permissions.")


@router.get("/platform/roles/{role_id}/permissions", response_model=List[str])
async def get_role_permissions(
    role_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    service: PermissionService = Depends(get_permission_service)
):
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
