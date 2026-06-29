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
        user_agent=request.headers.get("User-Agent"),
        session_expires_at=datetime.now(timezone.utc) + timedelta(hours=1)
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


# =============================================================
# Super Admin Security — Impersonation Log Endpoints
# =============================================================
from app.modules.superadmin.dependencies import require_super_admin
from sqlalchemy import select, desc, func


@router.get("/superadmin/security/impersonation/logs", tags=["superadmin-security"])
async def superadmin_impersonation_logs(
    limit: int = 50,
    offset: int = 0,
    _=Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """All impersonation logs for super admin. Splits active vs ended sessions."""
    all_logs = (await db.execute(
        select(ImpersonationLog)
        .order_by(desc(ImpersonationLog.started_at))
        .limit(limit).offset(offset)
    )).scalars().all()

    total = (await db.scalar(select(func.count(ImpersonationLog.id)))) or 0
    active_count = (await db.scalar(
        select(func.count(ImpersonationLog.id))
        .where(ImpersonationLog.terminated_at.is_(None))
    )) or 0

    items = [
        {
            "id": str(log.id),
            "organization_id": str(log.target_organization_id) if log.target_organization_id else None,
            "admin_user_id": str(log.super_admin_id) if log.super_admin_id else None,
            "target_user_id": str(log.target_user_id) if log.target_user_id else None,
            "reason": log.reason,
            "started_at": log.started_at.isoformat(),
            "ended_at": log.terminated_at.isoformat() if log.terminated_at else None,
            "actions_count": 0,
        }
        for log in all_logs
    ]
    return {
        "items": items,
        "total": total,
        "active_count": active_count,
        "summary": {
            "active_sessions": active_count,
            "total_sessions": total,
        },
    }


@router.delete("/superadmin/security/impersonation/{session_id}", tags=["superadmin-security"])
async def superadmin_end_impersonation_session(
    session_id: uuid.UUID,
    _=Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """End an active impersonation session by setting terminated_at."""
    from datetime import datetime, timezone
    log = await db.get(ImpersonationLog, session_id)
    if not log:
        raise HTTPException(status_code=404, detail="Impersonation session not found.")
    if log.terminated_at is not None:
        raise HTTPException(status_code=400, detail="Session already ended.")
    log.terminated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"status": "success", "session_id": str(session_id),
            "ended_at": log.terminated_at.isoformat()}
