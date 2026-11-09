import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import TokenDep, get_db, require_active_user
from app.modules.identity.models.user import User
from app.services import permission_service
from pydantic import BaseModel
from app.modules.rbac.services.access_contexts import selected_request_context

router = APIRouter(prefix="/me", tags=["profile"])

class PermissionResponse(BaseModel):
    permissions: List[str]
    event_id: Optional[uuid.UUID]
    organization_id: uuid.UUID
    policy_revision: int

@router.get("/permissions", response_model=PermissionResponse)
async def get_my_permissions(
    response: Response,
    token: TokenDep,
    event_id: Optional[uuid.UUID] = Query(None, description="Event ID to resolve permissions for"),
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns the resolved set of permission codes for the current user.
    If event_id is provided, includes event-specific role and scoped permissions.
    """
    response.headers["Cache-Control"] = "no-store"
    resolved_event_id = event_id or token.active_event_id
    async with selected_request_context(
        db, current_user, token, event_id=resolved_event_id
    ) as context:
        perms = (sorted(context.actions) if token.access_mode == "DELEGATED" else
            await permission_service.get_user_permissions(
                db, current_user.id, resolved_event_id, context.organization_id,
                token.active_workspace_id,
            ))
        revision = (max(context.policy_revisions) if token.access_mode == "DELEGATED"
                    else context.policy_revision)
        return PermissionResponse(permissions=perms, event_id=event_id, organization_id=context.organization_id,
                                  policy_revision=revision)
