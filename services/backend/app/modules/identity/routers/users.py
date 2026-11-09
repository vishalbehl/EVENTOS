# backend/app/routers/users.py
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db, get_current_user, require_active_user, SuperAdminOnly, ActiveUser, OrganizerOrAbove, StepUpAuth, TokenDep
from app.modules.identity.models.user import User
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.modules.identity.schemas.user import (
    UserResponse, UserCreate, UserUpdate, UserProfileUpdate,
    AssignmentCreate, UserAssignmentSchema, AssignmentUpdate
)
from app.schemas.common import MessageResponse
from app.services import auth_service
from app.modules.identity.models.identity_domain_tables import MfaDevice
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.services.mfa_service import (
    build_totp_uri,
    generate_totp_secret,
    requires_privileged_mfa,
    verify_totp,
)
from app.core.encryption import encrypt
from app.config import settings
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.identity.application.queries import UserQueryService
from app.schemas.cursor_pagination import CursorPage
from app.core.concurrency import require_if_match, raise_version_conflict
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response

router = APIRouter(prefix="/users", tags=["users"])


async def browser_identity_audience(token: TokenDep):
    from app.modules.rbac.routers.access_foundation import browser_context_audience
    await browser_context_audience(token)


@router.get("", response_model=List[UserResponse], summary="List users (Superadmin/Organizer)")
async def list_users(
    current_user: OrganizerOrAbove,
    role: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
) -> List[UserResponse]:
    """Retrieve all users in the system with their assignments."""
    return await UserQueryService(db).list_users(actor=current_user, role=role)


class MembershipInvitationResult(BaseModel):
    membership_id: uuid.UUID
    version: int
    invite_token: str | None = Field(default=None, repr=False)
    expires_at: datetime
    delivery_mode: str
    message: str
    replayed: bool


@router.post("", response_model=MembershipInvitationResult, status_code=status.HTTP_201_CREATED,
             summary="Legacy adapter: invite an organisation member", dependencies=[Depends(browser_identity_audience)])
async def create_user(
    payload: UserCreate,
    step_up: StepUpAuth,
    reason: str = Query(..., min_length=12, max_length=1000),
    current_user: User = Depends(require_active_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
) -> MembershipInvitationResult:
    from app.core.tenant_context import TenantContextGuard
    from app.modules.organiser.application.member_commands import OrganizationMemberCommandService
    from app.modules.rbac.services.access_contexts import verify_direct_context
    del step_up
    if payload.role not in {"admin", "member", "billing_only"} or not payload.is_active:
        raise HTTPException(422, detail={"code": "SCOPED_MEMBERSHIP_ROLE_REQUIRED",
            "message": "Use admin, member or billing_only. Event roles are assigned separately after acceptance."})
    platform = current_user.platform_role is not None
    if not platform:
        await verify_direct_context(db, current_user, payload.organization_id)
    async with TenantContextGuard.scoped(db, payload.organization_id):
        result = await OrganizationMemberCommandService(db, platform_administration=platform).create_invitation(
            organization_id=payload.organization_id, actor=current_user, email=payload.email,
            org_role=payload.role, idempotency_key=idempotency_key, reason=reason)
    # Compatibility input password is deliberately not stored or hashed. The
    # recipient controls their authenticated identity; this creates no access.
    return MembershipInvitationResult(**result)


@router.get("/cursor", response_model=CursorPage[UserResponse], summary="Cursor-paginated users")
async def list_users_cursor(
    current_user: OrganizerOrAbove,
    cursor: Optional[str] = None,
    role: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> CursorPage[UserResponse]:
    return await UserQueryService(db).cursor_users(actor=current_user, cursor=cursor, role=role, limit=limit)



@router.get("/me", response_model=UserResponse, summary="Get current user profile")
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> UserResponse:
    """Fetch current user's full profile including assignments."""
    user = await UserQueryService(db).get(user_id=current_user.id, actor=current_user)
    return user


@router.patch("/me", response_model=UserResponse, summary="Update current user profile", dependencies=[Depends(browser_identity_audience)])
async def update_me(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    if_match: Optional[str] = Header(None, alias="If-Match"),
) -> UserResponse:
    """Update limited fields on the current user's profile."""
    expected = require_if_match(if_match)
    observed_auth_revision = current_user.auth_revision
    target = await db.scalar(select(User).where(User.id == current_user.id,
        User.is_active.is_(True), User.deleted_at.is_(None)).with_for_update()
        .execution_options(populate_existing=True))
    if target is None or target.auth_revision != observed_auth_revision:
        raise HTTPException(401, detail={"code": "SESSION_REVOKED"})
    if target.version != expected:
        raise HTTPException(412, detail={"code": "VERSION_CONFLICT", "current_version": target.version})
    update_data = payload.model_dump(exclude_unset=True)
    
    if "email" in update_data and update_data["email"] != current_user.email:
        raise HTTPException(409, detail={"code": "VERIFIED_EMAIL_CHANGE_REQUIRED",
            "message": "Email changes require the verified identity workflow, not a profile edit."})
            
    for field, value in update_data.items():
        setattr(target, field, value)
    target.version += 1
    await db.commit()
    await db.refresh(current_user)
    
    return await UserQueryService(db).get(user_id=current_user.id, actor=current_user)


@router.get("/{user_id}", response_model=UserResponse, summary="Get user by ID")
async def get_user(
    user_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    user = await UserQueryService(db).get(user_id=user_id, actor=current_user)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


@router.patch("/{user_id}", response_model=UserResponse, summary="Legacy adapter: governed status or own profile", dependencies=[Depends(browser_identity_audience)])
async def update_user(
    user_id: uuid.UUID, payload: UserUpdate, step_up: StepUpAuth,
    current_user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db),
    if_match: Optional[str] = Header(None, alias="If-Match"),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    reason: str | None = Query(None, min_length=12, max_length=1000),
) -> UserResponse:
    del step_up
    fields = payload.model_fields_set
    if fields == {"is_active"}:
        if payload.is_active is None:
            raise HTTPException(422, detail={"code": "STATUS_REQUIRED"})
        if not reason or not idempotency_key:
            raise HTTPException(428, detail={"code": "VERSION_REASON_AND_KEY_REQUIRED"})
        from app.modules.platform.application.identity_commands import IdentityAdminCommandService
        await IdentityAdminCommandService(db).update_status(user_id=user_id, actor=current_user,
            is_active=payload.is_active, reason=reason, expected=require_if_match(if_match),
            idempotency_key=idempotency_key)
        return await UserQueryService(db).get(user_id=user_id, actor=current_user)
    allowed = {"first_name", "last_name", "phone", "avatar_url", "notification_preferences"}
    if not fields <= allowed:
        raise HTTPException(409, detail={"code": "GOVERNED_IDENTITY_OPERATION_REQUIRED",
            "message": "Use the governed platform role, MFA or status operation; passwords and verified-email changes are not profile edits."})
    if user_id != current_user.id:
        raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
    require_if_match(if_match)
    return await update_me(UserProfileUpdate(**payload.model_dump(exclude_unset=True)),
        current_user=current_user, db=db, if_match=if_match)


@router.delete("/{user_id}", response_model=MessageResponse, summary="Legacy adapter: deactivate identity without deleting history", dependencies=[Depends(browser_identity_audience)])
async def delete_user(
    user_id: uuid.UUID, step_up: StepUpAuth,
    reason: str = Query(..., min_length=12, max_length=1000),
    current_user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db),
    if_match: Optional[str] = Header(None, alias="If-Match"),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
) -> MessageResponse:
    del step_up
    from app.modules.platform.application.identity_commands import IdentityAdminCommandService
    await IdentityAdminCommandService(db).update_status(user_id=user_id, actor=current_user,
        is_active=False, reason=reason, expected=require_if_match(if_match), idempotency_key=idempotency_key)
    return MessageResponse(message="Identity deactivated. Membership and audit history retained; no personal data was deleted.")


class MfaCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


@router.post("/me/mfa/setup", summary="Begin TOTP enrollment")
async def setup_mfa(
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await db.execute(
        delete(MfaDevice).where(
            MfaDevice.user_id == current_user.id,
            MfaDevice.is_active.is_(False),
        )
    )
    secret = generate_totp_secret()
    db.add(MfaDevice(
        user_id=current_user.id,
        device_type="totp",
        encrypted_secret=encrypt(secret),
        is_active=False,
    ))
    await db.commit()
    return {"secret": secret, "otpauth_uri": build_totp_uri(secret, current_user.email)}


@router.post("/me/mfa/confirm", summary="Confirm TOTP enrollment")
async def confirm_mfa(
    payload: MfaCodeRequest,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    device = await db.scalar(
        select(MfaDevice).where(
            MfaDevice.user_id == current_user.id,
            MfaDevice.is_active.is_(False),
        )
    )
    if device is None or not verify_totp(device.totp_secret, payload.code):
        raise HTTPException(status_code=400, detail="Invalid MFA enrollment code.")
    device.is_active = True
    current_user.is_2fa_enabled = True
    current_user.two_factor_secret = None
    await db.commit()
    return {"status": "enabled"}


@router.delete("/me/mfa", summary="Disable TOTP")
async def disable_mfa(
    payload: MfaCodeRequest,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if settings.ENFORCE_PRIVILEGED_MFA and requires_privileged_mfa(current_user):
        raise HTTPException(status_code=409, detail="MFA is mandatory for this privileged account.")
    device = await db.scalar(
        select(MfaDevice).where(
            MfaDevice.user_id == current_user.id,
            MfaDevice.is_active.is_(True),
        )
    )
    if device is None or not verify_totp(device.totp_secret, payload.code):
        raise HTTPException(status_code=400, detail="Invalid MFA code.")
    await db.execute(delete(MfaDevice).where(MfaDevice.user_id == current_user.id))
    current_user.is_2fa_enabled = False
    await auth_service.revoke_user_refresh_tokens(db, current_user.id, reason="mfa_disabled")
    await db.commit()
    return {"status": "disabled"}


@router.post("/me/toggle-2fa", status_code=410, summary="Deprecated insecure MFA toggle")
async def toggle_2fa() -> None:
    raise HTTPException(status_code=410, detail="Use /users/me/mfa/setup and /users/me/mfa/confirm.")


# ── Assignments ───────────────────────────────────────────

async def _scoped_assignment_context(
    db: AsyncSession,
    assignment_id: uuid.UUID,
    current_user: User,
) -> tuple[UserEventAssignment, User, object]:
    """Resolve an assignment only when its user/event tenant invariant holds."""
    row = await UserQueryService(db).assignment_context(assignment_id=assignment_id, actor=current_user)
    if row is None:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    assignment, target, event = row
    return assignment, target, event


@router.post("/assignments", response_model=UserAssignmentSchema, summary="Assign user to event")
async def create_assignment(
    payload: AssignmentCreate,
    current_user: OrganizerOrAbove,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
) -> UserAssignmentSchema:
    """Assign a user to an event with specific permissions."""
    from app.modules.rbac.models.rbac import UserAccessNode
    from app.modules.events.models.event import Event

    target = await db.get(User, payload.user_id)
    event = await db.get(Event, payload.event_id)
    if (
        target is None
        or event is None
        or target.organization_id is None
        or target.organization_id != event.organization_id
    ):
        raise HTTPException(status_code=404, detail="Event not found.")
    if (
        current_user.role != "super_admin"
        and target.organization_id != current_user.organization_id
    ):
        raise HTTPException(status_code=404, detail="Event not found.")
    if current_user.role != "super_admin" and target.role in ["super_admin", "organiser"]:
        raise HTTPException(status_code=403, detail="Cannot manage access for super_admin or organiser roles.")

    existing_assignment = await db.scalar(
        select(UserEventAssignment).where(
            UserEventAssignment.user_id == payload.user_id,
            UserEventAssignment.event_id == payload.event_id,
        )
    )
    if existing_assignment is not None:
        if existing_assignment.permissions == payload.permissions:
            return existing_assignment
        raise HTTPException(
            status_code=409,
            detail={"code": "ASSIGNMENT_ALREADY_EXISTS"},
        )
    reservation = await UsageReservationService.reserve(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        limit_key="max_event_team_members",
        quantity=1,
        unit="member",
        idempotency_key=f"event-assignment:{idempotency_key}",
        metadata={"user_id": str(payload.user_id)},
    )

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

    await db.flush()
    await UsageReservationService.consume(
        db,
        reservation.id,
        source="organizer_portal.event_assignments.create",
        actor_user_id=current_user.id,
    )

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
    assignment, _, _ = await _scoped_assignment_context(
        db, assignment_id, current_user
    )
        
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
    assignment, _, _ = await _scoped_assignment_context(
        db, assignment_id, current_user
    )

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
