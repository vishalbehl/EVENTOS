import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.audit.models.audit_domain_tables import ImpersonationLog
from app.dependencies import get_current_user
from app.modules.identity.services.auth_service import create_access_token
from pydantic import BaseModel

router = APIRouter(prefix="/auth/impersonation", tags=["Impersonation"])

class ImpersonationRequest(BaseModel):
    target_organization_id: uuid.UUID
    target_user_id: Optional[uuid.UUID] = None
    reason: str

@router.post("/start")
async def start_impersonation(
    payload: ImpersonationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate a short-lived JWT scoped to the target organization for support debugging.
    Only SUPER_ADMINs can impersonate.
    """
    if current_user.platform_role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Only Super Admins can initiate impersonation")

    # 1. Verify target exists
    target_org = await db.get(Organization, payload.target_organization_id)
    if not target_org:
        raise HTTPException(status_code=404, detail="Target organization not found")

    # 2. Audit Log the start
    log = ImpersonationLog(
        super_admin_id=current_user.id,
        target_organization_id=payload.target_organization_id,
        target_user_id=payload.target_user_id,
        reason=payload.reason,
        ip_address=request.client.host if request.client else "unknown",
        user_agent=request.headers.get("User-Agent")
    )
    db.add(log)
    await db.commit()

    # 3. Generate Scoped Token
    # The token payload includes impersonator_id to track actions in audit logs
    token_data = {
        "sub": str(payload.target_user_id or current_user.id),
        "organization_id": str(payload.target_organization_id),
        "impersonator_id": str(current_user.id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=1) # Short lived
    }
    
    # Assuming a token service exists
    from app.modules.identity.services.auth_service import create_access_token
    token = create_access_token(data=token_data)

    return {
        "access_token": token,
        "token_type": "bearer",
        "target_organization": target_org.name,
        "expires_in": 3600
    }
