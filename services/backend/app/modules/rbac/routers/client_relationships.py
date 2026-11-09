"""Canonical consent endpoints; compatibility must use these same commands."""
import uuid
from datetime import datetime
from typing import Literal
from pydantic import BaseModel
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db, require_active_user, require_step_up
from app.modules.identity.models.user import User
from app.modules.rbac.routers.access_foundation import browser_context_audience
from app.modules.rbac.schemas.client_relationships import RelationshipPage, RelationshipView, RelationshipRequest, RelationshipTransition
from app.modules.rbac.schemas.client_relationships import ClientProvisionRequest, ClientProvisionResult, RelationshipReason
from app.modules.rbac.services.client_relationships import relationship_page, request_relationship, transition_relationship

router = APIRouter(prefix="/emc/client-relationships", tags=["client-relationships"], dependencies=[Depends(browser_context_audience)])


@router.post("/provision", response_model=ClientProvisionResult, dependencies=[Depends(require_step_up)])
async def provision_new_client(payload: ClientProvisionRequest, response: Response, organization_id: uuid.UUID,
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    from app.modules.rbac.services.client_provisioning import provision_client
    response.headers["Cache-Control"] = "no-store"
    return await provision_client(db, user, organization_id, payload, key)


class ProvisionStatus(BaseModel):
    provisioning_id: uuid.UUID
    client_organization_id: uuid.UUID
    relationship_id: uuid.UUID
    owner_member_id: uuid.UUID
    owner_version: int
    owner_accepted: bool
    owner_active: bool
    expires_at: datetime | None
    relationship_status: str


@router.get("/provision/{provisioning_id}", response_model=ProvisionStatus)
async def inspect_provisioning(provisioning_id: uuid.UUID, response: Response, organization_id: uuid.UUID,
    user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    from app.modules.rbac.services.client_provisioning import provisioning_status
    response.headers["Cache-Control"] = "no-store"
    return await provisioning_status(db, user, organization_id, provisioning_id)


@router.post("/provision/{provisioning_id}/owner-invitation", response_model=ClientProvisionResult,
    dependencies=[Depends(require_step_up)])
async def replace_provisioning_invitation(provisioning_id: uuid.UUID, payload: RelationshipReason, response: Response,
    organization_id: uuid.UUID, expected: int | None = Header(None, alias="If-Match", ge=1),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    from app.modules.rbac.services.client_provisioning import replace_owner_invitation
    response.headers["Cache-Control"] = "no-store"
    if expected is None:
        raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
    return await replace_owner_invitation(db, user, organization_id, provisioning_id, expected, payload.reason, key)


class DelegatedBootstrap(BaseModel):
    organization_id: uuid.UUID
    acting_organization_id: uuid.UUID
    workspace_id: uuid.UUID
    event_id: uuid.UUID | None
    relationship_id: uuid.UUID
    access_mode: Literal["DELEGATED"]
    actions: list[str]
    policy_revisions: tuple[int, int, int]


@router.get("/{relationship_id}/access", response_model=DelegatedBootstrap)
async def delegated_bootstrap(relationship_id: uuid.UUID, response: Response, emc_organization_id: uuid.UUID,
    client_organization_id: uuid.UUID, workspace_id: uuid.UUID, event_id: uuid.UUID | None = None,
    user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    from app.modules.rbac.services.delegated_access import delegated_request_context
    response.headers["Cache-Control"] = "no-store"
    async with delegated_request_context(db, user, emc_organization_id=emc_organization_id,
        client_organization_id=client_organization_id, relationship_id=relationship_id,
        workspace_id=workspace_id, event_id=event_id) as context:
        return DelegatedBootstrap(organization_id=context.organization_id, acting_organization_id=context.acting_organization_id,
            workspace_id=context.workspace_id, event_id=context.event_id, relationship_id=context.relationship_id,
            access_mode="DELEGATED", actions=sorted(context.actions), policy_revisions=context.policy_revisions)


@router.get("", response_model=RelationshipPage, response_model_exclude_none=True)
async def list_relationships(response: Response, organization_id: uuid.UUID, after: uuid.UUID | None = None,
    limit: int = Query(50, ge=1, le=100), user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return await relationship_page(db, user, organization_id, after, limit)


@router.post("", response_model=RelationshipView, response_model_exclude_none=True, dependencies=[Depends(require_step_up)])
async def request_client(payload: RelationshipRequest, organization_id: uuid.UUID,
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    return await request_relationship(db, user, organization_id, payload, key)


@router.post("/{relationship_id}/transitions", response_model=RelationshipView, response_model_exclude_none=True,
    dependencies=[Depends(require_step_up)])
async def transition_client(relationship_id: uuid.UUID, payload: RelationshipTransition, organization_id: uuid.UUID,
    expected: int | None = Header(None, alias="If-Match", ge=1),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    if expected is None:
        raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
    return await transition_relationship(db, user, organization_id, relationship_id, payload, expected, key)
