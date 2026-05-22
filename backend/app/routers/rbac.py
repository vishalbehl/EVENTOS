import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db, OrganizerOrAbove, SuperAdminOnly
from app.models.rbac import Role, Permission, RolePermission, UserRoleAssignment
from app.schemas.common import MessageResponse
from pydantic import BaseModel

router = APIRouter(prefix="/rbac", tags=["rbac"])

class RoleResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    users_count: int = 0
    scope: str = "Global"
    status: str = "Active"
    is_system_role: bool

    class Config:
        from_attributes = True

class PermissionResponse(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    module: str

    class Config:
        from_attributes = True

class RoleCreate(BaseModel):
    name: str
    description: Optional[str]
    is_system_role: bool = False

@router.get("/roles", response_model=List[RoleResponse])
async def list_roles(
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db)
):
    # Fetch roles with user count
    from sqlalchemy import func
    from app.models.rbac import UserRoleAssignment
    
    stmt = (
        select(
            Role, 
            func.count(UserRoleAssignment.id).label("users_count")
        )
        .outerjoin(UserRoleAssignment, UserRoleAssignment.role_id == Role.id)
        .where(Role.deleted_at == None)
        .group_by(Role.id)
        .order_by(Role.name)
    )
    
    result = await db.execute(stmt)
    rows = result.all()
    
    roles_out = []
    for role, count in rows:
        r_dict = {
            "id": role.id,
            "name": role.name,
            "description": role.description,
            "is_system_role": role.is_system_role,
            "users_count": count,
            "scope": "Global" if role.is_system_role else "Organization",
            "status": "Active"
        }
        roles_out.append(RoleResponse(**r_dict))
        
    return roles_out

@router.post("/roles", response_model=RoleResponse)
async def create_role(
    payload: RoleCreate,
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db)
):
    role = Role(
        name=payload.name,
        description=payload.description,
        is_system_role=payload.is_system_role
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role

@router.get("/permissions", response_model=List[PermissionResponse])
async def list_permissions(
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Permission).order_by(Permission.module, Permission.code))
    return result.scalars().all()

@router.get("/roles/{role_id}/permissions", response_model=List[str])
async def get_role_permissions(
    role_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Permission.code)
        .join(RolePermission)
        .where(RolePermission.role_id == role_id)
    )
    return result.scalars().all()

@router.post("/roles/{role_id}/permissions/{permission_code}/toggle", response_model=MessageResponse)
async def toggle_role_permission(
    role_id: uuid.UUID,
    permission_code: str,
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db)
):
    # 1. Get permission
    res = await db.execute(select(Permission).where(Permission.code == permission_code))
    perm = res.scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission code not found")
        
    # 2. Check if exists
    res = await db.execute(
        select(RolePermission)
        .where(RolePermission.role_id == role_id, RolePermission.permission_id == perm.id)
    )
    existing = res.scalar_one_or_none()
    
    if existing:
        await db.delete(existing)
        msg = "Permission removed"
    else:
        new_rp = RolePermission(role_id=role_id, permission_id=perm.id)
        db.add(new_rp)
        msg = "Permission granted"
        
    await db.commit()
    return MessageResponse(message=msg)

@router.delete("/roles/{role_id}", response_model=MessageResponse)
async def delete_role(
    role_id: uuid.UUID,
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db)
):
    role = await db.get(Role, role_id)
    if not role or role.deleted_at:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system_role:
        raise HTTPException(status_code=400, detail="Cannot delete system roles")
        
    role.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return MessageResponse(message="Role deleted successfully")
