import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_active_user
from app.modules.auth.models.user import User
from app.services import permission_service
from pydantic import BaseModel

router = APIRouter(prefix="/me", tags=["profile"])

class PermissionResponse(BaseModel):
    permissions: List[str]
    event_id: Optional[uuid.UUID]

@router.get("/permissions", response_model=PermissionResponse)
async def get_my_permissions(
    event_id: Optional[uuid.UUID] = Query(None, description="Event ID to resolve permissions for"),
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns the resolved set of permission codes for the current user.
    If event_id is provided, includes event-specific role and scoped permissions.
    """
    perms = await permission_service.get_user_permissions(db, current_user.id, event_id)
    return PermissionResponse(
        permissions=perms,
        event_id=event_id
    )
