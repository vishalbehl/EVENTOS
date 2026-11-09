import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status, Request, Response, Query
from sqlalchemy import select, delete, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

# Legacy route signatures keep the annotation name during compatibility rollout;
# the actual dependency is identity validation, not a global role hierarchy.
from app.dependencies import get_db, ActiveUser as OrganizerOrAbove, TokenDep, require_active_user, require_step_up
from app.modules.rbac.services.access_contexts import direct_request_context
from app.modules.rbac.services.access_foundation import lock_revision, check_version
from app.modules.rbac.routers.access_foundation import browser_context_audience
from app.modules.rbac.services.permission_service import get_user_permissions
from app.modules.rbac.services.permission_catalogue import canonical_action, CUSTOMER_ACTIONS, OPERATIONAL_ACTIONS
from app.modules.rbac.services.role_graph import effective_role_actions
from app.modules.rbac.services.role_commands import role_command
from app.modules.rbac.services.assignment_commands import assignment_command
from app.modules.rbac.services.role_inheritance import inheritance_command
from app.modules.rbac.services.event_scope import listed_event_predicate
from app.modules.rbac.models.rbac import Role, Permission, RolePermission, UserRoleAssignment, RoleInheritanceMap
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.identity.models.user import User
from app.modules.events.models.event import Event
from app.modules.audit.models.audit_log import AuditLog
from app.schemas.common import MessageResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response

from app.modules.rbac.services.access_administration import (
    current_administration_organization,
    scoped_role_administration,
)


router = APIRouter(prefix="/rbac", tags=["rbac"], dependencies=[Depends(scoped_role_administration)])


def _require_organization(user) -> uuid.UUID:
    return current_administration_organization()


async def _editable_role(db: AsyncSession, role_id: uuid.UUID, user) -> Role:
    org_id = _require_organization(user)
    role = await db.scalar(select(Role).where(Role.id == role_id,
        Role.organization_id == org_id, Role.deleted_at.is_(None))
        .with_for_update().execution_options(populate_existing=True))
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

class RoleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("name", "reason", mode="before")
    @classmethod
    def meaningful_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class RoleCreate(RoleUpdate):
    is_system_role: bool = False


class RoleAssignmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: uuid.UUID
    role_id: uuid.UUID
    event_id: Optional[uuid.UUID] = None
    role_version: int = Field(ge=1)
    member_version: int = Field(ge=1)
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def meaningful_reason(cls, value):
        return value.strip() if isinstance(value, str) else value


class AccessReason(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def meaningful_reason(cls, value):
        return value.strip() if isinstance(value, str) else value


class PermissionWrite(AccessReason):
    allowed: bool


class PermissionWriteResult(BaseModel):
    role_id: uuid.UUID
    permission_code: str
    allowed: bool
    version: int
    policy_revision: int
    correlation_id: uuid.UUID


class ParentVersion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID
    version: int = Field(ge=1)


class ParentReplacement(AccessReason):
    parents: list[ParentVersion] = Field(max_length=100)


class ParentSummary(ParentVersion):
    name: str


class RoleParents(BaseModel):
    role_id: uuid.UUID
    version: int
    parents: list[ParentSummary]


class ParentMutation(BaseModel):
    role_id: uuid.UUID
    version: int
    parent_ids: list[uuid.UUID]
    policy_revision: int
    correlation_id: uuid.UUID


@router.get("/roles/{role_id}/parents", response_model=RoleParents)
async def role_parents(role_id: uuid.UUID, current_user: OrganizerOrAbove, db: AsyncSession = Depends(get_db)):
    r, edge = Role.__table__.c, RoleInheritanceMap.__table__.c
    organization_id = current_administration_organization()
    allowed = and_(r.deleted_at.is_(None), or_(r.organization_id == organization_id,
        and_(r.organization_id.is_(None), r.is_system_role.is_(True), r.name != "Super Admin")))
    version = await db.scalar(select(r.version).where(r.id == role_id, allowed))
    if version is None:
        raise HTTPException(404, detail={"code": "ROLE_NOT_FOUND"})
    parents = (await db.execute(select(r.id, r.name, r.version).select_from(RoleInheritanceMap.__table__.join(
        Role.__table__, r.id == edge.parent_role_id)).where(edge.child_role_id == role_id, allowed)
        .order_by(r.id).limit(101))).mappings().all()
    total = await db.scalar(select(func.count(edge.id)).where(edge.child_role_id == role_id))
    if total != len(parents) or len(parents) > 100:
        raise HTTPException(503, detail={"code": "ROLE_POLICY_RECONCILIATION_REQUIRED"})
    return {"role_id": role_id, "version": version, "parents": parents}


@router.put("/roles/{role_id}/parents", response_model=ParentMutation)
async def replace_role_parents(role_id: uuid.UUID, payload: ParentReplacement, current_user: OrganizerOrAbove,
    if_match: int | None = Header(None, alias="If-Match", ge=1),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160), db: AsyncSession = Depends(get_db)):
    return await inheritance_command(db, current_user, role_id, payload, if_match, key)


class RolePage(BaseModel):
    items: list[RoleResponse]
    next_cursor: uuid.UUID | None


class PermissionPage(BaseModel):
    items: list[PermissionResponse]
    next_cursor: uuid.UUID | None


class AccessSummary(BaseModel):
    roles_count: int
    permissions_count: int
    role_assignments_count: int
    custom_roles_count: int
    system_roles_count: int
    policy_revision: int


@router.get("/summary", response_model=AccessSummary)
async def access_summary(current_user: OrganizerOrAbove, db: AsyncSession = Depends(get_db)):
    role = Role.__table__.c
    roles_count = await db.scalar(select(func.count()).select_from(Role.__table__).where(
        role.deleted_at.is_(None), or_(role.organization_id == current_administration_organization(),
            and_(role.organization_id.is_(None), role.is_system_role.is_(True), role.name != "Super Admin"))))
    permissions_count = await db.scalar(select(func.count(Permission.id)).where(Permission.code.in_(CUSTOMER_ACTIONS)))
    organization_id = current_administration_organization()
    role_assignments_count = await db.scalar(select(func.count(UserRoleAssignment.id)).where(
        UserRoleAssignment.organization_id == organization_id, UserRoleAssignment.revoked_at.is_(None)
    ))
    custom_roles_count = await db.scalar(select(func.count(Role.id)).where(
        Role.organization_id == organization_id, Role.deleted_at.is_(None), Role.is_system_role.is_(False)
    ))
    system_roles_count = await db.scalar(select(func.count(Role.id)).where(
        Role.organization_id.is_(None), Role.deleted_at.is_(None), Role.is_system_role.is_(True), Role.name != "Super Admin"
    ))
    revision = await lock_revision(db, organization_id, write=False)
    return {"roles_count": roles_count, "permissions_count": permissions_count,
            "role_assignments_count": role_assignments_count or 0,
            "custom_roles_count": custom_roles_count or 0,
            "system_roles_count": system_roles_count or 0,
            "policy_revision": revision.revision}


@router.get("/roles/page", response_model=RolePage)
async def role_page(current_user: OrganizerOrAbove, after: uuid.UUID | None = None,
    limit: int = Query(50, ge=1, le=100), search: str = Query("", max_length=100), db: AsyncSession = Depends(get_db)):
    organization_id = current_administration_organization()
    role = Role.__table__.c
    query = select(role.id, role.name, role.description, role.is_system_role, role.version).where(
        role.deleted_at.is_(None), or_(role.organization_id == organization_id,
            and_(role.organization_id.is_(None), role.is_system_role.is_(True), role.name != "Super Admin")))
    if after is not None:
        query = query.where(role.id > after)
    if search.strip():
        query = query.where(func.lower(role.name).startswith(search.strip().lower(), autoescape=True))
    rows = (await db.execute(query.order_by(role.id).limit(limit + 1))).mappings().all()
    assignment, member, identity = UserRoleAssignment.__table__.c, OrganizationMember.__table__.c, User.__table__.c
    counts = dict((await db.execute(select(assignment.role_id, func.count(func.distinct(assignment.user_id))).select_from(
        UserRoleAssignment.__table__.join(OrganizationMember.__table__, and_(
            member.user_id == assignment.user_id, member.organization_id == organization_id))
        .join(User.__table__, identity.id == member.user_id)).where(
            assignment.organization_id == organization_id, assignment.revoked_at.is_(None), assignment.role_id.in_([row["id"] for row in rows[:limit]]),
            member.accepted_at.is_not(None), member.is_active.is_(True), identity.is_active.is_(True), identity.deleted_at.is_(None)
        ).group_by(assignment.role_id))).all()) if rows else {}
    return {"items": [{**row, "users_count": counts.get(row["id"], 0), "scope": "Template" if row["is_system_role"] else "Organization"} for row in rows[:limit]],
            "next_cursor": rows[limit - 1]["id"] if len(rows) > limit else None}


@router.get("/permissions/page", response_model=PermissionPage)
async def permission_page(current_user: OrganizerOrAbove, after: uuid.UUID | None = None,
    limit: int = Query(50, ge=1, le=100), db: AsyncSession = Depends(get_db)):
    query = select(Permission).where(Permission.code.in_(CUSTOMER_ACTIONS))
    if after is not None:
        query = query.where(Permission.id > after)
    rows = (await db.scalars(query.order_by(Permission.id).limit(limit + 1))).all()
    return {"items": rows[:limit], "next_cursor": rows[limit - 1].id if len(rows) > limit else None}


async def permission_command(db, user, role_id, permission_code, reason, expected, key, *, allowed=None):
    """Both compatibility toggle and desired-state write share one transaction."""
    if expected is None:
        raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
    role = await _editable_role(db, role_id, user)
    code = canonical_action(permission_code)
    if code is None:
        raise HTTPException(404, detail={"code": "PERMISSION_NOT_FOUND"})
    selector = db.info.get("customer_request_selector")
    if code not in await get_user_permissions(db, user.id, organization_id=role.organization_id,
            workspace_id=selector.active_workspace_id if selector else None):
        raise HTTPException(403, detail={"code": "GRANT_EXCEEDS_AUTHORITY"})
    receipt = await begin_idempotent(db, organization_id=role.organization_id, actor_id=user.id,
        operation="role.permission.write" if allowed is not None else "role.permission.toggle", key=key,
        payload={"actor_id": str(user.id), "role_id": str(role.id), "code": code,
                 "allowed": allowed, "version": expected, "reason": reason})
    replay = replay_response(receipt)
    if replay is not None:
        await db.commit()
        return replay[1]
    check_version(role.version, expected)
    permission = await db.scalar(select(Permission).where(Permission.code == code))
    if permission is None:
        raise HTTPException(404, detail={"code": "PERMISSION_NOT_FOUND"})
    existing = await db.scalar(select(RolePermission).where(RolePermission.role_id == role.id,
        RolePermission.permission_id == permission.id))
    desired = existing is None if allowed is None else allowed
    if desired and existing is None:
        db.add(RolePermission(role_id=role.id, permission_id=permission.id))
    elif not desired and existing is not None:
        await db.delete(existing)
    role.version += 1
    revision = await lock_revision(db, role.organization_id, write=True)
    revision.revision += 1
    correlation = uuid.uuid4()
    result = {"role_id": str(role.id), "permission_code": code, "allowed": desired,
              "version": role.version, "policy_revision": revision.revision, "correlation_id": str(correlation)}
    db.add(AuditLog(organization_id=role.organization_id, actor_user_id=user.id, actor_role=user.role,
        resource_type="user_role", resource_id=role.id, action_type="USER_ROLE_PERMISSION_CHANGED",
        correlation_id=correlation, is_sensitive=True,
        old_state={"allowed": existing is not None, "version": expected},
        new_state={**result, "reason": reason, "acting_organization_id": str(role.organization_id),
                   "target_organization_id": str(role.organization_id)}))
    await complete_idempotent(db, receipt, response_status=200, response_body=result, resource_id=role.id)
    await db.commit()
    return result


@router.put("/roles/{role_id}/permissions/{permission_code}", response_model=PermissionWriteResult)
async def set_role_permission(role_id: uuid.UUID, permission_code: str, payload: PermissionWrite,
    current_user: OrganizerOrAbove, if_match: int | None = Header(None, alias="If-Match", ge=1),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160), db: AsyncSession = Depends(get_db)):
    return await permission_command(db, current_user, role_id, permission_code, payload.reason, if_match, key, allowed=payload.allowed)

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
        .outerjoin(UserRoleAssignment, and_(UserRoleAssignment.role_id == Role.id, UserRoleAssignment.revoked_at.is_(None)))
        .where(Role.deleted_at == None, or_(Role.organization_id == current_administration_organization(), Role.organization_id.is_(None)))
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
async def create_role(payload: RoleCreate, current_user: OrganizerOrAbove,
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160), db: AsyncSession = Depends(get_db)):
    if payload.is_system_role:
        raise HTTPException(403, detail={"code": "SYSTEM_ROLE_CREATION_FORBIDDEN"})
    return await role_command(db, current_user, "create", payload, key)


@router.patch("/roles/{role_id}", response_model=RoleResponse)
async def update_role(role_id: uuid.UUID, payload: RoleUpdate, current_user: OrganizerOrAbove,
    if_match: int | None = Header(None, alias="If-Match", ge=1),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160), db: AsyncSession = Depends(get_db)):
    return await role_command(db, current_user, "update", payload, key, role_id=role_id, expected=if_match)


@router.post("/roles/{role_id}/clone", response_model=RoleResponse)
async def clone_role(role_id: uuid.UUID, payload: RoleUpdate, current_user: OrganizerOrAbove,
    if_match: int | None = Header(None, alias="If-Match", ge=1),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160), db: AsyncSession = Depends(get_db)):
    return await role_command(db, current_user, "clone", payload, key, role_id=role_id, expected=if_match)

@router.get("/permissions", response_model=List[PermissionResponse])
async def list_permissions(
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Permission).where(Permission.code.in_(CUSTOMER_ACTIONS)).order_by(Permission.module, Permission.code))
    return result.scalars().all()

@router.get("/roles/{role_id}/permissions", response_model=List[str])
async def get_role_permissions(
    role_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db)
):
    role = await db.scalar(select(Role).where(Role.id == role_id, Role.deleted_at.is_(None), or_(Role.organization_id == current_administration_organization(), Role.organization_id.is_(None))))
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    result = await db.execute(
        select(Permission.code)
        .join(RolePermission)
        .where(RolePermission.role_id == role_id)
    )
    return result.scalars().all()

@router.post("/roles/{role_id}/permissions/{permission_code}/toggle", response_model=PermissionWriteResult)
async def toggle_role_permission(role_id: uuid.UUID, permission_code: str, payload: AccessReason,
    current_user: OrganizerOrAbove, if_match: int | None = Header(None, alias="If-Match", ge=1),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160), db: AsyncSession = Depends(get_db)):
    return await permission_command(db, current_user, role_id, permission_code, payload.reason, if_match, key)

@router.delete("/roles/{role_id}", response_model=RoleResponse)
async def delete_role(role_id: uuid.UUID, payload: AccessReason, current_user: OrganizerOrAbove,
    if_match: int | None = Header(None, alias="If-Match", ge=1),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160), db: AsyncSession = Depends(get_db)):
    return await role_command(db, current_user, "archive", payload, key, role_id=role_id, expected=if_match)


class AssignmentResult(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    role_id: uuid.UUID
    event_id: uuid.UUID | None
    version: int
    revoked: bool
    policy_revision: int
    correlation_id: uuid.UUID


class AssignmentSummary(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    user_email: str
    role_id: uuid.UUID
    role_name: str
    scope: str
    event_id: uuid.UUID | None
    event_name: str | None
    assigned_at: datetime
    version: int


class AssignmentPage(BaseModel):
    items: list[AssignmentSummary]
    next_cursor: uuid.UUID | None


class AssignmentChoice(BaseModel):
    id: uuid.UUID
    name: str
    email: str | None = None
    version: int | None = None


class AssignmentChoices(BaseModel):
    items: list[AssignmentChoice]
    next_cursor: uuid.UUID | None


@router.get("/assignments/choices", response_model=AssignmentChoices)
async def assignment_choices(current_user: OrganizerOrAbove,
    kind: str = Query(..., pattern="^(member|event)$"), after: uuid.UUID | None = None,
    limit: int = Query(50, ge=1, le=100), db: AsyncSession = Depends(get_db)):
    org = _require_organization(current_user)
    if kind == "member":
        m, identity = OrganizationMember.__table__.c, User.__table__.c
        query = select(identity.id, identity.first_name, identity.last_name, identity.email, m.version).select_from(
            OrganizationMember.__table__.join(User.__table__, identity.id == m.user_id)).where(
                m.organization_id == org, m.accepted_at.is_not(None), m.is_active.is_(True),
                identity.is_active.is_(True), identity.deleted_at.is_(None))
        key = identity.id
    else:
        query = select(Event.id, Event.name).where(Event.deleted_at.is_(None),
            listed_event_predicate(db, current_user.id, org))
        key = Event.id
    if after is not None:
        query = query.where(key > after)
    rows = (await db.execute(query.order_by(key).limit(limit + 1))).mappings().all()
    return {"items": [{"id": row["id"], "name": row["name"] if kind == "event" else
        " ".join(filter(None, [row["first_name"], row["last_name"]])),
        "email": row.get("email"), "version": row.get("version")} for row in rows[:limit]],
        "next_cursor": rows[limit - 1]["id"] if len(rows) > limit else None}


@router.get("/assignments", response_model=AssignmentPage)
@router.get("/assignments/page", response_model=AssignmentPage)
async def list_role_assignments(
    current_user: OrganizerOrAbove,
    event_id: Optional[uuid.UUID] = None,
    scope: str = Query("ORGANIZATION", pattern="^(ORGANIZATION|EVENT)$"),
    after: uuid.UUID | None = None,
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    org_id = _require_organization(current_user)
    a, r, identity, member, event = (model.__table__.c for model in (UserRoleAssignment, Role, User, OrganizationMember, Event))
    stmt = select(a.id, a.user_id, a.role_id, a.event_id, a.assigned_at, a.version,
        identity.first_name, identity.last_name, identity.email.label("user_email"),
        r.name.label("role_name"), event.name.label("event_name")).select_from(
        UserRoleAssignment.__table__.join(Role.__table__, r.id == a.role_id)
        .join(User.__table__, identity.id == a.user_id)
        .join(OrganizationMember.__table__, and_(member.user_id == a.user_id, member.organization_id == org_id))
        .outerjoin(Event.__table__, event.id == a.event_id)).where(
        a.organization_id == org_id, a.revoked_at.is_(None), member.is_active.is_(True), member.accepted_at.is_not(None),
        identity.is_active.is_(True), identity.deleted_at.is_(None), r.deleted_at.is_(None),
        or_(r.organization_id == org_id, and_(r.organization_id.is_(None), r.is_system_role.is_(True), r.name != "Super Admin")),
        a.event_id.is_not(None) if scope == "EVENT" else a.event_id.is_(None),
        or_(a.event_id.is_(None), and_(event.organization_id == org_id, event.deleted_at.is_(None),
            listed_event_predicate(db, current_user.id, org_id))))
    if event_id is not None:
        stmt = stmt.where(a.event_id == event_id)
    if after is not None:
        stmt = stmt.where(a.id > after)
    rows = (await db.execute(stmt.order_by(a.id).limit(limit + 1))).mappings().all()
    return {"items": [{"id": row["id"], "user_id": row["user_id"], "user_name":
        " ".join(filter(None, [row["first_name"], row["last_name"]])), "user_email": row["user_email"],
        "role_id": row["role_id"], "role_name": row["role_name"], "scope": scope,
        "event_id": row["event_id"], "event_name": row["event_name"], "assigned_at": row["assigned_at"],
        "version": row["version"]} for row in rows[:limit]],
        "next_cursor": rows[limit - 1]["id"] if len(rows) > limit else None}


@router.post("/assignments", status_code=status.HTTP_201_CREATED, response_model=AssignmentResult)
async def create_role_assignment(
    payload: RoleAssignmentCreate,
    current_user: OrganizerOrAbove,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160),
    if_match: int | None = Header(None, alias="If-Match", ge=0),
    db: AsyncSession = Depends(get_db),
):
    return await assignment_command(db, current_user, payload, idempotency_key, if_match)


@router.delete("/assignments/{assignment_id}", response_model=AssignmentResult)
async def delete_role_assignment(
    assignment_id: uuid.UUID,
    current_user: OrganizerOrAbove,
    payload: AccessReason,
    if_match: int | None = Header(None, alias="If-Match", ge=1),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160),
    db: AsyncSession = Depends(get_db),
):
    return await assignment_command(db, current_user, payload, key, if_match, assignment_id=assignment_id)
