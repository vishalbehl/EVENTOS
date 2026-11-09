"""Operational workspace vertical slice; all endpoints require accepted membership."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Header, Query, Response, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_active_user, require_step_up, TokenDep
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.rbac.services.access_foundation import list_workspaces, mutate_workspace
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.rbac.services.access_contexts import (
    activate_session_context,
    available_contexts,
    direct_request_context,
    selected_request_context,
    verify_direct_context,
)
from app.modules.rbac.services.workspace_members import member_page, save_binding

router = APIRouter(tags=["operational-access"])


class WorkspaceView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    status: Literal["ACTIVE", "ARCHIVED"]
    is_default: bool
    version: int


class WorkspacePage(BaseModel):
    items: list[WorkspaceView]
    next_cursor: str | None


class WorkspaceWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("name", "reason", mode="before")
    @classmethod
    def meaningful_text(cls, value):
        if not isinstance(value, str):
            return value  # Let typed validation produce a safe 422.
        if not value.strip():
            raise ValueError("Text cannot be blank")
        return value.strip()


class WorkspaceChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=160)
    status: Literal["ARCHIVED"] | None = None
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("name", "reason", mode="before")
    @classmethod
    def meaningful_text(cls, value):
        if not isinstance(value, str):
            return value
        if value is not None and not value.strip():
            raise ValueError("Text cannot be blank")
        return value.strip() if value is not None else value


class AccessBootstrap(BaseModel):
    organization_id: uuid.UUID
    organization_kind: Literal["NORMAL", "EMC", "CLIENT"]
    acting_organization_id: uuid.UUID
    workspace_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None
    relationship_id: uuid.UUID | None = None
    access_mode: Literal["DIRECT", "DELEGATED"]
    role: str
    actions: list[str]
    policy_revision: int
    policy_revisions: list[int]
    operational_restrictions: list[str] = Field(default_factory=list)
    safe_denial_reasons: dict[str, str] = Field(default_factory=dict)
    freshness_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkspaceMemberView(BaseModel):
    member_id: uuid.UUID
    name: str
    role: Literal["admin", "member", "viewer"] | None
    version: int


class WorkspaceMemberPage(BaseModel):
    items: list[WorkspaceMemberView]
    next_cursor: str | None
    policy_revision: int


class WorkspaceMemberWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=3, max_length=500)
    role: Literal["admin", "member", "viewer"] | None

    @field_validator("reason", mode="before")
    @classmethod
    def meaningful_reason(cls, value):
        return WorkspaceWrite.meaningful_text(value)


class WorkspaceMemberResult(BaseModel):
    member_id: uuid.UUID
    role: Literal["admin", "member", "viewer"] | None
    version: int
    policy_revision: int


class OwnerCandidate(BaseModel):
    member_id: uuid.UUID
    name: str
    role: str
    version: int


class OwnerCandidatePage(BaseModel):
    items: list[OwnerCandidate]
    next_cursor: str | None
    source_version: int
    policy_revision: int


class OwnershipWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_member_id: uuid.UUID
    target_version: int = Field(ge=1)
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def meaningful_reason(cls, value):
        return WorkspaceWrite.meaningful_text(value)


class OwnershipResult(BaseModel):
    previous_owner_member_id: uuid.UUID
    previous_owner_version: int
    owner_member_id: uuid.UUID
    owner_version: int
    policy_revision: int
    reason: str
    correlation_id: uuid.UUID


class AccessContextView(BaseModel):
    organization_id: uuid.UUID
    organization_name: str
    organization_kind: Literal["NORMAL", "EMC", "CLIENT"]
    role: str
    membership_version: int
    access_mode: Literal["DIRECT", "DELEGATED"]
    acting_organization_id: uuid.UUID
    acting_organization_name: str
    workspace_id: uuid.UUID | None = None
    workspace_name: str | None = None
    event_id: uuid.UUID | None = None
    relationship_id: uuid.UUID | None = None
    is_current: bool
    activation_available: bool


class AccessContextPage(BaseModel):
    items: list[AccessContextView]
    next_cursor: str | None
    delegation_available: bool


class ContextSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    access_mode: Literal["DIRECT", "DELEGATED"] = "DIRECT"
    organization_id: uuid.UUID
    acting_organization_id: uuid.UUID | None = None
    workspace_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None
    relationship_id: uuid.UUID | None = None


class SelectedAccessContext(BaseModel):
    organization_id: uuid.UUID
    acting_organization_id: uuid.UUID
    workspace_id: uuid.UUID
    event_id: uuid.UUID | None = None
    relationship_id: uuid.UUID | None = None
    access_mode: Literal["DIRECT", "DELEGATED"]
    role: str
    actions: list[str]
    policy_revisions: list[int]
    correlation_id: uuid.UUID


class ContextSelectionResult(BaseModel):
    access_token: str
    token_type: Literal["bearer"]
    context: SelectedAccessContext


class WorkspaceEventView(BaseModel):
    id: uuid.UUID
    name: str
    version: int
    operational_workspace_id: uuid.UUID | None


class WorkspaceEventPage(BaseModel):
    items: list[WorkspaceEventView]
    next_cursor: str | None
    policy_revision: int


class EventWorkspaceWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    workspace_id: uuid.UUID
    reason: str = Field(min_length=3, max_length=500)


class EventWorkspaceResult(BaseModel):
    id: uuid.UUID
    operational_workspace_id: uuid.UUID
    version: int
    policy_revision: int
    correlation_id: uuid.UUID


async def browser_context_audience(token: TokenDep):
    # A machine key or scoped support session cannot enumerate its human
    # subject's entire membership portfolio or select a different tenant.
    if token.role == "developer" or "api_key" in token.amr or token.impersonator_id is not None:
        raise HTTPException(403, detail={"code": "CONTEXT_AUDIENCE_DENIED"})


@router.get("/access/contexts", response_model=AccessContextPage, dependencies=[Depends(browser_context_audience)])
async def contexts(response: Response, token: TokenDep, after: str | None = Query(None, max_length=220),
                   limit: int = Query(50, ge=1, le=100), user: User = Depends(require_active_user),
                   db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return await available_contexts(db, user, token, after, limit)


@router.post("/access/context", response_model=ContextSelectionResult,
             dependencies=[Depends(browser_context_audience)])
async def select_context(payload: ContextSelection, response: Response, token: TokenDep,
                         user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    result = await activate_session_context(db, user, token, payload)
    response.headers["x-correlation-id"] = str(result["context"]["correlation_id"])
    return result


@router.get("/access/bootstrap", response_model=AccessBootstrap, dependencies=[Depends(browser_context_audience)])
async def bootstrap(response: Response, token: TokenDep, organization_id: uuid.UUID | None = None,
                    user: User = Depends(require_active_user),
                    db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    now = datetime.now(timezone.utc)
    if organization_id is not None:
        async with direct_request_context(db, user, organization_id) as context:
            organization_kind = await db.scalar(select(Organization.organization_kind).where(
                Organization.id == context.organization_id,
            ))
            if organization_kind not in {"NORMAL", "EMC", "CLIENT"}:
                raise HTTPException(404, detail={"code": "CONTEXT_NOT_FOUND"})
            return AccessBootstrap(
                organization_id=context.organization_id,
                organization_kind=organization_kind,
                acting_organization_id=context.organization_id,
                access_mode="DIRECT",
                role=context.role,
                actions=sorted(context.actions),
                policy_revision=context.policy_revision,
                policy_revisions=[context.policy_revision],
                operational_restrictions=[],
                safe_denial_reasons={},
                freshness_at=now,
            )
    async with selected_request_context(db, user, token, event_id=token.active_event_id) as context:
        organization_kind = await db.scalar(select(Organization.organization_kind).where(
            Organization.id == token.active_organization_id,
        ))
        if organization_kind not in {"NORMAL", "EMC", "CLIENT"}:
            raise HTTPException(404, detail={"code": "CONTEXT_NOT_FOUND"})
        delegated = token.access_mode == "DELEGATED"
        restrictions: list[str] = []
        if delegated:
            restrictions.append("DELEGATED_ACCESS_ACTIVE")
        if token.active_event_id:
            restrictions.append("EVENT_SCOPE_CONSTRAINED")
        if token.active_workspace_id:
            restrictions.append("WORKSPACE_BOUNDED")

        denial_reasons: dict[str, str] = {}
        granted = set(context.actions)
        for sensitive_action in ("events:delete", "members:manage", "billing:manage", "settings:manage", "reports:export"):
            if sensitive_action not in granted and sensitive_action.upper() not in granted:
                denial_reasons[sensitive_action] = (
                    "DELEGATION_SCOPE_EXCLUDED" if delegated else "MEMBERSHIP_ROLE_RESTRICTED"
                )

        return AccessBootstrap(
            organization_id=token.active_organization_id,
            organization_kind=organization_kind,
            acting_organization_id=token.acting_organization_id,
            workspace_id=token.active_workspace_id,
            event_id=token.active_event_id,
            relationship_id=token.relationship_id,
            access_mode=token.access_mode,
            role="emc_staff" if delegated else context.role,
            actions=sorted(context.actions),
            policy_revision=max(context.policy_revisions) if delegated else context.policy_revision,
            policy_revisions=list(context.policy_revisions if delegated else (context.policy_revision,)),
            operational_restrictions=restrictions,
            safe_denial_reasons=denial_reasons,
            freshness_at=now,
        )


@router.get("/organizations/{organization_id}/workspaces", response_model=WorkspacePage, dependencies=[Depends(browser_context_audience)])
async def workspaces(organization_id: uuid.UUID, response: Response, after: uuid.UUID | None = None, limit: int = Query(50, ge=1, le=100),
                     user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    async with direct_request_context(db, user, organization_id):
        rows, cursor = await list_workspaces(db, user, organization_id, after, limit)
    return WorkspacePage(items=[WorkspaceView.model_validate(row) for row in rows], next_cursor=cursor)


@router.get("/organizations/{organization_id}/workspaces/{workspace_id}/events", response_model=WorkspaceEventPage,
            dependencies=[Depends(browser_context_audience)])
async def workspace_events(organization_id: uuid.UUID, workspace_id: uuid.UUID, response: Response,
    after: uuid.UUID | None = None, limit: int = Query(50, ge=1, le=100),
    user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    from app.modules.rbac.services.workspace_events import event_page
    response.headers["Cache-Control"] = "no-store"
    return await event_page(db, user, organization_id, workspace_id, after, limit)


@router.patch("/organizations/{organization_id}/events/{event_id}/workspace", response_model=EventWorkspaceResult,
            dependencies=[Depends(browser_context_audience), Depends(require_step_up)])
async def change_event_workspace(organization_id: uuid.UUID, event_id: uuid.UUID, payload: EventWorkspaceWrite,
    expected: int | None = Header(None, alias="If-Match", ge=1),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    from app.modules.rbac.services.workspace_events import reassign_event
    if expected is None:
        raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
    return await reassign_event(db, user, organization_id, event_id, payload.workspace_id,
        expected, payload.reason, key)


async def save(db, user, organization_id, payload, key, workspace_id=None, expected=None):
    async with direct_request_context(db, user, organization_id, write=True) as context:
        return await save_scoped(db, user, organization_id, payload, key, context, workspace_id, expected)


async def save_scoped(db, user, organization_id, payload, key, context, workspace_id=None, expected=None):
    operation = "workspace.create" if workspace_id is None else "workspace.update"
    # Authorisation is checked even on replay. Lock order is org revision then idempotency/resource.
    required = "workspace:create" if workspace_id is None else ("workspace:archive" if getattr(payload, "status", None) == "ARCHIVED" else "workspace:edit")
    if required not in context.actions:
        raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
    reservation = await begin_idempotent(db, organization_id=organization_id, actor_id=user.id,
        operation=operation, key=key, payload={**payload.model_dump(mode="json"), "workspace_id": str(workspace_id) if workspace_id else None, "version": expected})
    replay = replay_response(reservation)
    if replay is not None:
        await db.commit()
        return replay[1]
    row = await mutate_workspace(db, user, organization_id, workspace_id=workspace_id, expected=expected, **payload.model_dump())
    result = WorkspaceView.model_validate(row).model_dump(mode="json")
    await complete_idempotent(db, reservation, response_status=200, response_body=result, resource_id=row.id)
    await db.commit()
    return result


@router.post("/organizations/{organization_id}/workspaces", response_model=WorkspaceView, dependencies=[Depends(browser_context_audience), Depends(require_step_up)])
async def create_workspace(organization_id: uuid.UUID, payload: WorkspaceWrite,
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    return await save(db, user, organization_id, payload, key)


@router.patch("/organizations/{organization_id}/workspaces/{workspace_id}", response_model=WorkspaceView, dependencies=[Depends(browser_context_audience), Depends(require_step_up)])
async def update_workspace(organization_id: uuid.UUID, workspace_id: uuid.UUID, payload: WorkspaceChange,
    expected: int | None = Header(None, alias="If-Match", ge=1),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    if expected is None:
        raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
    return await save(db, user, organization_id, payload, key, workspace_id, expected)


@router.get("/organizations/{organization_id}/workspaces/{workspace_id}/members", response_model=WorkspaceMemberPage,
            dependencies=[Depends(browser_context_audience)])
async def workspace_members(organization_id: uuid.UUID, workspace_id: uuid.UUID, response: Response,
    after: uuid.UUID | None = None, limit: int = Query(50, ge=1, le=100),
    user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return await member_page(db, user, organization_id, workspace_id, after, limit)


@router.put("/organizations/{organization_id}/workspaces/{workspace_id}/members/{member_id}",
            response_model=WorkspaceMemberResult, dependencies=[Depends(browser_context_audience), Depends(require_step_up)])
async def change_workspace_member(organization_id: uuid.UUID, workspace_id: uuid.UUID, member_id: uuid.UUID,
    payload: WorkspaceMemberWrite, expected: int | None = Header(None, alias="If-Match", ge=0),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    if expected is None:
        raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
    return await save_binding(db, user, organization_id, workspace_id, member_id,
        role=payload.role, reason=payload.reason, expected=expected, key=key)


@router.get("/organizations/{organization_id}/members/ownership-candidates", response_model=OwnerCandidatePage,
            dependencies=[Depends(browser_context_audience)])
async def ownership_candidates(organization_id: uuid.UUID, response: Response, after: uuid.UUID | None = None,
    limit: int = Query(50, ge=1, le=100), user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    from app.modules.rbac.models.organization_member import OrganizationMember
    response.headers["Cache-Control"] = "no-store"
    async with direct_request_context(db, user, organization_id) as context:
        if context.role != "owner":
            raise HTTPException(403, detail={"code": "OWNER_AUTHORITY_REQUIRED"})
        if "members:manage" not in context.actions:
            raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
        m, u = OrganizationMember.__table__, User.__table__
        source_version = await db.scalar(select(m.c.version).where(m.c.organization_id == organization_id, m.c.user_id == user.id))
        query = select(m.c.id, m.c.org_role, m.c.version, u.c.first_name, u.c.last_name).select_from(m.join(u, u.c.id == m.c.user_id)).where(
            m.c.organization_id == organization_id, m.c.user_id != user.id, m.c.org_role != "owner",
            m.c.is_active.is_(True), m.c.accepted_at.is_not(None), u.c.is_active.is_(True), u.c.deleted_at.is_(None))
        if after is not None:
            query = query.where(m.c.id > after)
        rows = (await db.execute(query.order_by(m.c.id).limit(limit + 1))).mappings().all()
        return {"items": [{"member_id": row["id"], "name": f"{row['first_name']} {row['last_name']}",
                            "role": row["org_role"], "version": row["version"]} for row in rows[:limit]],
                "next_cursor": str(rows[limit - 1]["id"]) if len(rows) > limit else None,
                "source_version": source_version, "policy_revision": context.policy_revision}


@router.post("/organizations/{organization_id}/members/transfer-ownership", response_model=OwnershipResult,
            dependencies=[Depends(browser_context_audience), Depends(require_step_up)])
async def transfer_ownership(organization_id: uuid.UUID, payload: OwnershipWrite,
    expected: int | None = Header(None, alias="If-Match", ge=1),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    from app.modules.organiser.application.member_commands import OrganizationMemberCommandService
    if expected is None:
        raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
    async with direct_request_context(db, user, organization_id, write=True):
        return await OrganizationMemberCommandService(db).transfer_ownership(organization_id=organization_id,
            actor=user, target_member_id=payload.target_member_id, source_version=expected,
            target_version=payload.target_version, reason=payload.reason, idempotency_key=key)
