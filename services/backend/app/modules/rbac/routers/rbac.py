import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select, delete, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db, OrganizerOrAbove
from app.modules.rbac.models.rbac import Role, Permission, RolePermission, UserRoleAssignment
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.identity.models.user import User
from app.modules.events.models.event import Event
from app.modules.audit.models.audit_log import AuditLog
from app.schemas.common import MessageResponse
from pydantic import BaseModel

router = APIRouter(prefix="/rbac", tags=["rbac"])


def _require_organization(user) -> uuid.UUID:
    if not user.organization_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "ORGANIZATION_CONTEXT_REQUIRED"})
    return user.organization_id


async def _editable_role(db: AsyncSession, role_id: uuid.UUID, user) -> Role:
    org_id = _require_organization(user)
    role = await db.scalar(select(Role).where(Role.id == role_id, Role.deleted_at.is_(None)))
    if not role or role.organization_id != org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if role.is_system_role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "SYSTEM_ROLE_IMMUTABLE"})
    return role

class RoleResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    users_count: int = 0
    scope: str = "Global"
    status: str = "Active"
    is_system_role: bool
    version: int = 1

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


class RoleUpdate(BaseModel):
    name: str
    description: Optional[str] = None


class RoleAssignmentCreate(BaseModel):
    user_id: uuid.UUID
    role_id: uuid.UUID
    event_id: Optional[uuid.UUID] = None

@router.get("/roles", response_model=List[RoleResponse])
async def list_roles(
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db)
):
    # Fetch roles with user count
    from sqlalchemy import func
    from app.modules.rbac.models.rbac import UserRoleAssignment
    
    stmt = (
        select(
            Role, 
            func.count(UserRoleAssignment.id).label("users_count")
        )
        .outerjoin(UserRoleAssignment, UserRoleAssignment.role_id == Role.id)
        .where(Role.deleted_at == None, or_(Role.organization_id == current_user.organization_id, Role.organization_id.is_(None)))
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
            "status": "Active",
            "version": role.version,
        }
        roles_out.append(RoleResponse(**r_dict))
        
    return roles_out

@router.post("/roles", response_model=RoleResponse)
async def create_role(
    payload: RoleCreate,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db)
):
    org_id = _require_organization(current_user)
    if payload.is_system_role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "SYSTEM_ROLE_CREATION_FORBIDDEN"})
    duplicate = await db.scalar(select(Role.id).where(
        Role.organization_id == org_id, Role.deleted_at.is_(None), func.lower(Role.name) == payload.name.strip().lower()
    ))
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "ROLE_NAME_EXISTS"})
    role = Role(
        organization_id=org_id,
        name=payload.name.strip(),
        description=payload.description,
        is_system_role=False,
    )
    db.add(role)
    await db.flush()
    db.add(AuditLog(organization_id=org_id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="user_role", resource_id=role.id, action_type="USER_ROLE_CREATED", new_state={"name": role.name, "description": role.description}, is_sensitive=False))
    await db.commit()
    await db.refresh(role)
    return role


@router.patch("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: uuid.UUID,
    payload: RoleUpdate,
    current_user: OrganizerOrAbove,
    if_match: int = Header(..., alias="If-Match", ge=1),
    db: AsyncSession = Depends(get_db),
):
    role = await _editable_role(db, role_id, current_user)
    if role.version != if_match:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": role.version})
    duplicate = await db.scalar(select(Role.id).where(
        Role.organization_id == current_user.organization_id,
        Role.id != role.id,
        Role.deleted_at.is_(None),
        func.lower(Role.name) == payload.name.strip().lower(),
    ))
    if duplicate:
        raise HTTPException(status_code=409, detail={"code": "ROLE_NAME_EXISTS"})
    old = {"name": role.name, "description": role.description, "version": role.version}
    role.name = payload.name.strip()
    role.description = payload.description
    role.version += 1
    db.add(AuditLog(organization_id=current_user.organization_id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="user_role", resource_id=role.id, action_type="USER_ROLE_UPDATED", old_state=old, new_state={"name": role.name, "description": role.description, "version": role.version}, is_sensitive=False))
    await db.commit()
    await db.refresh(role)
    return role


@router.post("/roles/{role_id}/clone", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def clone_role(
    role_id: uuid.UUID,
    payload: RoleUpdate,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
):
    org_id = _require_organization(current_user)
    source = await db.scalar(select(Role).where(Role.id == role_id, Role.deleted_at.is_(None), or_(Role.organization_id == org_id, Role.organization_id.is_(None))))
    if not source:
        raise HTTPException(status_code=404, detail="Role not found")
    duplicate = await db.scalar(select(Role.id).where(Role.organization_id == org_id, Role.deleted_at.is_(None), func.lower(Role.name) == payload.name.strip().lower()))
    if duplicate:
        raise HTTPException(status_code=409, detail={"code": "ROLE_NAME_EXISTS"})
    cloned = Role(organization_id=org_id, name=payload.name.strip(), description=payload.description or source.description, is_system_role=False)
    db.add(cloned)
    await db.flush()
    permission_ids = (await db.scalars(select(RolePermission.permission_id).where(RolePermission.role_id == source.id))).all()
    db.add_all([RolePermission(role_id=cloned.id, permission_id=permission_id) for permission_id in permission_ids])
    db.add(AuditLog(organization_id=org_id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="user_role", resource_id=cloned.id, action_type="USER_ROLE_CLONED", old_state={"source_role_id": str(source.id)}, new_state={"name": cloned.name, "permission_count": len(permission_ids)}, is_sensitive=False))
    await db.commit()
    await db.refresh(cloned)
    return cloned

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
    role = await db.scalar(select(Role).where(Role.id == role_id, Role.deleted_at.is_(None), or_(Role.organization_id == current_user.organization_id, Role.organization_id.is_(None))))
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
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
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db)
):
    role = await _editable_role(db, role_id, current_user)
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
        action = "USER_ROLE_PERMISSION_REMOVED"
    else:
        new_rp = RolePermission(role_id=role_id, permission_id=perm.id)
        db.add(new_rp)
        msg = "Permission granted"
        action = "USER_ROLE_PERMISSION_GRANTED"
    db.add(AuditLog(organization_id=current_user.organization_id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="user_role", resource_id=role.id, action_type=action, new_state={"permission_code": permission_code}, is_sensitive=False))
        
    await db.commit()
    return MessageResponse(message=msg)

@router.delete("/roles/{role_id}", response_model=MessageResponse)
async def delete_role(
    role_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    if_match: int = Header(..., alias="If-Match", ge=1),
    db: AsyncSession = Depends(get_db)
):
    role = await _editable_role(db, role_id, current_user)
    if role.version != if_match:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": role.version})
    assignment_count = await db.scalar(select(func.count(UserRoleAssignment.id)).where(UserRoleAssignment.role_id == role.id)) or 0
    if assignment_count:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "ROLE_IN_USE", "assignments": assignment_count})
    role.deleted_at = datetime.now(timezone.utc)
    db.add(AuditLog(organization_id=current_user.organization_id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="user_role", resource_id=role.id, action_type="USER_ROLE_DELETED", old_state={"name": role.name, "version": role.version}, is_sensitive=False))
    await db.commit()
    return MessageResponse(message="Role deleted successfully")


@router.get("/assignments")
async def list_role_assignments(
    current_user: OrganizerOrAbove,
    event_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    org_id = _require_organization(current_user)
    stmt = (
        select(UserRoleAssignment, Role, User, Event.name)
        .join(Role, Role.id == UserRoleAssignment.role_id)
        .join(User, User.id == UserRoleAssignment.user_id)
        .outerjoin(Event, Event.id == UserRoleAssignment.event_id)
        .where(
            UserRoleAssignment.organization_id == org_id,
            Role.deleted_at.is_(None),
            or_(Role.organization_id == org_id, Role.organization_id.is_(None)),
        )
        .order_by(UserRoleAssignment.assigned_at.desc())
    )
    if event_id is not None:
        stmt = stmt.where(UserRoleAssignment.event_id == event_id)
    rows = (await db.execute(stmt)).all()
    return {
        "items": [{
            "id": str(assignment.id),
            "user_id": str(assignment.user_id),
            "user_name": user.full_name,
            "user_email": user.email,
            "role_id": str(role.id),
            "role_name": role.name,
            "scope": "EVENT" if assignment.event_id else "ORGANIZATION",
            "event_id": str(assignment.event_id) if assignment.event_id else None,
            "event_name": event_name,
            "assigned_at": assignment.assigned_at.isoformat(),
        } for assignment, role, user, event_name in rows],
        "total": len(rows),
        "page": 1,
        "page_size": len(rows) or 10,
        "freshness_at": datetime.now(timezone.utc).isoformat(),
        "source": "organizer_access.user_role_assignments",
    }


@router.post("/assignments", status_code=status.HTTP_201_CREATED)
async def create_role_assignment(
    payload: RoleAssignmentCreate,
    current_user: OrganizerOrAbove,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160),
    db: AsyncSession = Depends(get_db),
):
    org_id = _require_organization(current_user)
    role = await db.scalar(select(Role).where(
        Role.id == payload.role_id,
        Role.deleted_at.is_(None),
        or_(Role.organization_id == org_id, Role.organization_id.is_(None)),
    ))
    member = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == payload.user_id,
        OrganizationMember.is_active.is_(True),
    ))
    if not role or not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "ROLE_OR_MEMBER_NOT_FOUND"})
    if payload.event_id:
        event = await db.scalar(select(Event.id).where(
            Event.id == payload.event_id,
            Event.organization_id == org_id,
            Event.deleted_at.is_(None),
        ))
        if not event:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "EVENT_NOT_FOUND"})
    existing = await db.scalar(select(UserRoleAssignment).where(
        UserRoleAssignment.organization_id == org_id,
        UserRoleAssignment.user_id == payload.user_id,
        UserRoleAssignment.role_id == payload.role_id,
        UserRoleAssignment.event_id == payload.event_id if payload.event_id else UserRoleAssignment.event_id.is_(None),
    ))
    if existing:
        return {"id": str(existing.id), "replayed": True}
    assignment = UserRoleAssignment(
        user_id=payload.user_id,
        role_id=payload.role_id,
        organization_id=org_id,
        event_id=payload.event_id,
        assigned_by=current_user.id,
    )
    db.add(assignment)
    await db.flush()
    db.add(AuditLog(
        organization_id=org_id, actor_user_id=current_user.id, actor_role=current_user.role,
        resource_type="user_role_assignment", resource_id=assignment.id, action_type="USER_ROLE_ASSIGNED",
        new_state={"user_id": str(payload.user_id), "role_id": str(payload.role_id), "event_id": str(payload.event_id) if payload.event_id else None, "idempotency_key": idempotency_key},
        is_sensitive=True,
    ))
    await db.commit()
    return {"id": str(assignment.id), "replayed": False}


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role_assignment(
    assignment_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
):
    org_id = _require_organization(current_user)
    assignment = await db.scalar(select(UserRoleAssignment).where(
        UserRoleAssignment.id == assignment_id,
        UserRoleAssignment.organization_id == org_id,
    ))
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "ROLE_ASSIGNMENT_NOT_FOUND"})
    old_state = {"user_id": str(assignment.user_id), "role_id": str(assignment.role_id), "event_id": str(assignment.event_id) if assignment.event_id else None}
    await db.delete(assignment)
    db.add(AuditLog(
        organization_id=org_id, actor_user_id=current_user.id, actor_role=current_user.role,
        resource_type="user_role_assignment", resource_id=assignment_id, action_type="USER_ROLE_REVOKED",
        old_state=old_state, is_sensitive=True,
    ))
    await db.commit()
    return None
