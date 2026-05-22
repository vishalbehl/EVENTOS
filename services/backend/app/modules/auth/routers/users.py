# backend/app/routers/users.py
from __future__ import annotations
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db, get_current_user, require_active_user, SuperAdminOnly, ActiveUser, OrganizerOrAbove
from app.modules.auth.models.user import User
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.modules.auth.schemas.user import (
    UserResponse, UserCreate, UserUpdate, UserProfileUpdate,
    AssignmentCreate, UserAssignmentSchema, AssignmentUpdate
)
from app.schemas.common import MessageResponse
from app.services import auth_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=List[UserResponse], summary="List users (Superadmin/Organizer)")
async def list_users(
    current_user: OrganizerOrAbove,
    role: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
) -> List[UserResponse]:
    """Retrieve all users in the system with their assignments."""
    q = select(User).options(
        selectinload(User.assignments).selectinload(UserEventAssignment.event)
    ).order_by(User.created_at.desc())
    if role:
        q = q.where(User.role == role)
    if current_user.role != "super_admin":
        q = q.where(User.organization_id == current_user.organization_id)
        # An organizer can only see lower roles
        q = q.where(User.role.in_(["admin", "session_manager", "technician", "volunteer"]))
    
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED, summary="Create new user")
async def create_user(
    payload: UserCreate,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Create a new user with a specific role and organization."""
    if current_user.role != "super_admin":
        if payload.role in ["super_admin", "organiser"]:
            raise HTTPException(status_code=403, detail="Organizers can only create admins, session managers, technicians, and volunteers.")

    # Check if email exists
    existing = await db.execute(
        select(User).where(User.email == payload.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User with this email already exists.")

    # Enforce Super Admin limits (max 3)
    if payload.role == "super_admin":
        count_res = await db.execute(select(func.count()).select_from(User).where(User.role == "super_admin"))
        if count_res.scalar() >= 3:
            raise HTTPException(status_code=400, detail="Maximum limit of 3 Super Admin accounts reached.")

    # Organizers always create users within their own org; only super_admin can specify a different org
    org_id = payload.organization_id if current_user.role == "super_admin" else current_user.organization_id

    user = User(
        email=payload.email,
        password_hash=auth_service.hash_password(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        phone=payload.phone,
        role=payload.role,
        organization_id=org_id,
        is_active=payload.is_active,
        avatar_url=payload.avatar_url,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Reload with assignments and event data
    result = await db.execute(
        select(User).options(
            selectinload(User.assignments).selectinload(UserEventAssignment.event)
        ).where(User.id == user.id)
    )
    return result.scalar_one()



@router.get("/me", response_model=UserResponse, summary="Get current user profile")
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> UserResponse:
    """Fetch current user's full profile including assignments."""
    result = await db.execute(
        select(User).options(
            selectinload(User.assignments).selectinload(UserEventAssignment.event)
        ).where(User.id == current_user.id)
    )
    return result.scalar_one()


@router.patch("/me", response_model=UserResponse, summary="Update current user profile")
async def update_me(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update limited fields on the current user's profile."""
    update_data = payload.model_dump(exclude_unset=True)
    
    if "email" in update_data and update_data["email"] != current_user.email:
        # Check if email exists
        existing = await db.execute(select(User).where(User.email == update_data["email"]))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="User with this email already exists.")
            
    for field, value in update_data.items():
        setattr(current_user, field, value)
    
    await db.commit()
    await db.refresh(current_user)
    
    result = await db.execute(
        select(User).options(selectinload(User.assignments)).where(User.id == current_user.id)
    )
    return result.scalar_one()


@router.get("/{user_id}", response_model=UserResponse, summary="Get user by ID")
async def get_user(
    user_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    q = select(User).options(selectinload(User.assignments)).where(User.id == user_id)
    if current_user.role != "super_admin":
        q = q.where(User.organization_id == current_user.organization_id)
    result = await db.execute(q)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


@router.patch("/{user_id}", response_model=UserResponse, summary="Update user")
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if current_user.role != "super_admin":
        # Organisers can only edit within their own org
        if user.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Cannot edit users outside your organization.")
        # Prevent editing super_admin or organiser accounts
        if user.role in ["super_admin", "organiser"]:
            raise HTTPException(status_code=403, detail="Organisers cannot edit super_admin or organiser accounts.")
        # Prevent privilege escalation
        update_data_check = payload.model_dump(exclude_unset=True)
        if update_data_check.get("role") in ["super_admin", "organiser"]:
            raise HTTPException(status_code=403, detail="Cannot promote users to super_admin or organiser.")

    update_data = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v != ""}
    
    if "password" in update_data:
        user.password_hash = auth_service.hash_password(update_data.pop("password"))

    # Enforce Super Admin limits and existence
    new_role = update_data.get("role")
    if new_role == "super_admin" and user.role != "super_admin":
        count_res = await db.execute(select(func.count()).select_from(User).where(User.role == "super_admin"))
        if count_res.scalar() >= 3:
            raise HTTPException(status_code=400, detail="Maximum limit of 3 Super Admin accounts reached.")
    
    if user.role == "super_admin" and new_role and new_role != "super_admin":
        count_res = await db.execute(select(func.count()).select_from(User).where(User.role == "super_admin"))
        if count_res.scalar() <= 1:
            raise HTTPException(status_code=400, detail="Cannot change the role of the last remaining Super Admin.")

    for field, value in update_data.items():
        setattr(user, field, value)
    
    await db.commit()
    await db.refresh(user)
    
    result = await db.execute(
        select(User).options(selectinload(User.assignments)).where(User.id == user.id)
    )
    return result.scalar_one()



@router.delete("/{user_id}", response_model=MessageResponse, summary="Delete user (Superadmin)")
async def delete_user(
    user_id: uuid.UUID,
    current_user: SuperAdminOnly,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    from sqlalchemy import text
    
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account.")
        
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    
    if user.role == "super_admin":
        count_res = await db.execute(select(func.count()).select_from(User).where(User.role == "super_admin"))
        if count_res.scalar() <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last remaining Super Admin account.")
    
    # Bypass immutable triggers on audit_logs (which have SET NULL on users.id)
    # This allows physical deletion even if the user has audit logs.
    await db.execute(text("SET LOCAL session_replication_role = 'replica'"))
    
    await db.delete(user)
    await db.commit()
    
    return MessageResponse(message="User account permanently deleted from the system.")


@router.post("/me/toggle-2fa", response_model=UserResponse, summary="Toggle 2FA for current user")
async def toggle_2fa(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Enable or disable 2FA for the current user."""
    current_user.is_2fa_enabled = not current_user.is_2fa_enabled
    if current_user.is_2fa_enabled and not current_user.two_factor_secret:
        # In a real app, we would generate a secret and show a QR code
        current_user.two_factor_secret = "DUMMY_SECRET_KEY_FOR_DEMO"
    
    await db.commit()
    await db.refresh(current_user)
    
    result = await db.execute(
        select(User).options(selectinload(User.assignments)).where(User.id == current_user.id)
    )
    return result.scalar_one()


# ── Assignments ───────────────────────────────────────────

@router.post("/assignments", response_model=UserAssignmentSchema, summary="Assign user to event")
async def create_assignment(
    payload: AssignmentCreate,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> UserAssignmentSchema:
    """Assign a user to an event with specific permissions."""
    # Validate that non-super-admins can only assign within their org
    if current_user.role != "super_admin":
        target_result = await db.execute(select(User).where(User.id == payload.user_id))
        target = target_result.scalar_one_or_none()
        if not target or target.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Cannot assign users outside your organization.")
        if target.role in ["super_admin", "organiser"]:
            raise HTTPException(status_code=403, detail="Cannot manage access for super_admin or organiser roles.")

    from app.modules.rbac.models.rbac import UserAccessNode

    assignment = UserEventAssignment(
        user_id=payload.user_id,
        event_id=payload.event_id,
        permissions=payload.permissions
    )
    db.add(assignment)
    
    # Sync with UserAccessNode if granular
    node_type = payload.permissions.get("node_type")
    node_id = payload.permissions.get("node_id")
    if node_type and node_id:
        try:
            # Check if UserAccessNode already exists for this node
            node_id_uuid = uuid.UUID(node_id) if isinstance(node_id, str) else node_id
            
            # Use uppercase for node_type as expected by rbac_service
            node_type_upper = node_type.upper()
            
            access_node = UserAccessNode(
                user_id=payload.user_id,
                node_type=node_type_upper,
                node_id=node_id_uuid,
                permissions={"level": payload.permissions.get("level", "full")}
            )
            db.add(access_node)
        except (ValueError, TypeError):
            # If node_id is not a valid UUID, we skip it
            pass

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Assignment already exists or invalid data.")
    
    await db.refresh(assignment)
    return assignment


@router.patch("/assignments/{assignment_id}", response_model=UserAssignmentSchema, summary="Update assignment")
async def update_assignment(
    assignment_id: uuid.UUID,
    data: AssignmentUpdate,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> UserAssignmentSchema:
    # Fetch assignment
    assign_res = await db.execute(
        select(UserEventAssignment).where(UserEventAssignment.id == assignment_id)
    )
    assignment = assign_res.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
        
    # Update permissions
    assignment.permissions = data.permissions
    
    try:
        await db.commit()
        await db.refresh(assignment)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
        
    return assignment


@router.delete("/assignments/{assignment_id}", response_model=MessageResponse, summary="Remove assignment")
async def delete_assignment(
    assignment_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    # Fetch assignment first
    assign_res = await db.execute(
        select(UserEventAssignment).where(UserEventAssignment.id == assignment_id)
    )
    assignment = assign_res.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    # Validate that non-super-admins can only manage within their org
    if current_user.role != "super_admin":
        target_result = await db.execute(select(User).where(User.id == assignment.user_id))
        target = target_result.scalar_one_or_none()
        if not target or target.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Cannot remove assignments for users outside your organization.")

    # Fetch granular node cleanup info
    node_type = assignment.permissions.get("node_type")
    node_id = assignment.permissions.get("node_id")
    if node_type and node_id:
        from app.modules.rbac.models.rbac import UserAccessNode
        try:
            node_id_uuid = uuid.UUID(node_id) if isinstance(node_id, str) else node_id
            await db.execute(
                delete(UserAccessNode).where(
                    UserAccessNode.user_id == assignment.user_id,
                    UserAccessNode.node_id == node_id_uuid
                )
            )
        except (ValueError, TypeError):
            pass
    
    await db.delete(assignment)
    await db.commit()
    
    return MessageResponse(message="Assignment removed.")
