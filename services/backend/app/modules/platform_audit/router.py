import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.platform_audit.models import (
    PlatformAuditLog, EntityHistory, LoginHistory, ApiActivityLog,
    ExportLog, PlatformImpersonationLog, DataAccessLog
)
from app.modules.platform_audit.services import AuditService

router = APIRouter(prefix="/platform/audit", tags=["platform-audit"])


class ExportRequestSchema(BaseModel):
    module: str
    export_type: str
    file_name: str


@router.get("/dashboard")
async def get_audit_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    if not org_id:
        org_id = uuid.UUID("00000000-0000-0000-0000-000000000000")

    # Counts
    audit_count_stmt = select(func.count(PlatformAuditLog.id)).where(PlatformAuditLog.organization_id == org_id)
    login_count_stmt = select(func.count(LoginHistory.id)).where(LoginHistory.organization_id == org_id)
    api_count_stmt = select(func.count(ApiActivityLog.id)).where(ApiActivityLog.organization_id == org_id)
    
    # Recent logs
    recent_logs_stmt = select(PlatformAuditLog).where(
        PlatformAuditLog.organization_id == org_id
    ).order_by(desc(PlatformAuditLog.performed_at)).limit(10)

    audit_count = (await db.execute(audit_count_stmt)).scalar() or 0
    login_count = (await db.execute(login_count_stmt)).scalar() or 0
    api_count = (await db.execute(api_count_stmt)).scalar() or 0
    recent_logs = (await db.execute(recent_logs_stmt)).scalars().all()

    return {
        "audit_logs_count": audit_count,
        "login_history_count": login_count,
        "api_activity_count": api_count,
        "recent_logs": [
            {
                "id": str(log.id),
                "module": log.module,
                "entity_type": log.entity_type,
                "entity_id": str(log.entity_id),
                "action": log.action,
                "performed_by": str(log.performed_by),
                "performed_at": log.performed_at.isoformat(),
                "ip_address": log.ip_address
            }
            for log in recent_logs
        ]
    }


@router.get("/logs")
async def get_audit_logs(
    module: Optional[str] = None,
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    query: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id or uuid.UUID("00000000-0000-0000-0000-000000000000")
    stmt = select(PlatformAuditLog).where(PlatformAuditLog.organization_id == org_id)

    if module:
        stmt = stmt.where(PlatformAuditLog.module == module)
    if entity_type:
        stmt = stmt.where(PlatformAuditLog.entity_type == entity_type)
    if action:
        stmt = stmt.where(PlatformAuditLog.action == action)
    if query:
        # Simulate GIN tsvector text search by querying action/module/entity fields
        stmt = stmt.where(
            or_(
                PlatformAuditLog.module.ilike(f"%{query}%"),
                PlatformAuditLog.entity_type.ilike(f"%{query}%"),
                PlatformAuditLog.action.ilike(f"%{query}%"),
                PlatformAuditLog.ip_address.ilike(f"%{query}%")
            )
        )

    stmt = stmt.order_by(desc(PlatformAuditLog.performed_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    logs = result.scalars().all()

    return [
        {
            "id": str(log.id),
            "organization_id": str(log.organization_id),
            "module": log.module,
            "entity_type": log.entity_type,
            "entity_id": str(log.entity_id),
            "action": log.action,
            "old_values": log.old_values,
            "new_values": log.new_values,
            "metadata": log.metadata_data,
            "performed_by": str(log.performed_by),
            "performed_at": log.performed_at.isoformat(),
            "ip_address": log.ip_address,
            "user_agent": log.user_agent
        }
        for log in logs
    ]


@router.get("/users")
async def get_user_audit_logs(
    user_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id or uuid.UUID("00000000-0000-0000-0000-000000000000")
    # Retrieve actions performed by or on the user
    stmt = select(PlatformAuditLog).where(
        and_(
            PlatformAuditLog.organization_id == org_id,
            or_(
                PlatformAuditLog.performed_by == user_id,
                and_(
                    PlatformAuditLog.entity_type == "user",
                    PlatformAuditLog.entity_id == user_id
                )
            )
        )
    ).order_by(desc(PlatformAuditLog.performed_at)).limit(limit).offset(offset)

    result = await db.execute(stmt)
    logs = result.scalars().all()

    return [
        {
            "id": str(log.id),
            "module": log.module,
            "entity_type": log.entity_type,
            "entity_id": str(log.entity_id),
            "action": log.action,
            "performed_by": str(log.performed_by),
            "performed_at": log.performed_at.isoformat(),
            "ip_address": log.ip_address,
            "old_values": log.old_values,
            "new_values": log.new_values
        }
        for log in logs
    ]


@router.get("/entities")
async def get_entity_history(
    entity_type: str,
    entity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id or uuid.UUID("00000000-0000-0000-0000-000000000000")
    stmt = select(EntityHistory).where(
        and_(
            EntityHistory.organization_id == org_id,
            EntityHistory.entity_type == entity_type,
            EntityHistory.entity_id == entity_id
        )
    ).order_by(desc(EntityHistory.version))

    result = await db.execute(stmt)
    versions = result.scalars().all()

    return [
        {
            "id": str(v.id),
            "version": v.version,
            "change_type": v.change_type,
            "snapshot": v.snapshot,
            "created_by": str(v.created_by),
            "created_at": v.created_at.isoformat()
        }
        for v in versions
    ]


@router.get("/logins")
async def get_login_history(
    user_id: Optional[uuid.UUID] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id or uuid.UUID("00000000-0000-0000-0000-000000000000")
    stmt = select(LoginHistory).where(LoginHistory.organization_id == org_id)

    if user_id:
        stmt = stmt.where(LoginHistory.user_id == user_id)

    stmt = stmt.order_by(desc(LoginHistory.login_time)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    logins = result.scalars().all()

    return [
        {
            "id": str(log.id),
            "user_id": str(log.user_id),
            "login_time": log.login_time.isoformat(),
            "logout_time": log.logout_time.isoformat() if log.logout_time else None,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "device": log.device,
            "location": log.location,
            "status": log.status,
            "failure_reason": log.failure_reason
        }
        for log in logins
    ]


@router.get("/apis")
async def get_api_activity(
    method: Optional[str] = None,
    response_code: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id or uuid.UUID("00000000-0000-0000-0000-000000000000")
    stmt = select(ApiActivityLog).where(ApiActivityLog.organization_id == org_id)

    if method:
        stmt = stmt.where(ApiActivityLog.method == method.upper())
    if response_code:
        stmt = stmt.where(ApiActivityLog.response_code == response_code)

    stmt = stmt.order_by(desc(ApiActivityLog.created_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    apis = result.scalars().all()

    # Latency Stats
    stats_stmt = select(
        func.avg(ApiActivityLog.latency_ms),
        func.max(ApiActivityLog.latency_ms)
    ).where(ApiActivityLog.organization_id == org_id)
    stats_res = await db.execute(stats_stmt)
    avg_latency, max_latency = stats_res.first() or (0.0, 0)

    return {
        "avg_latency_ms": float(avg_latency or 0.0),
        "max_latency_ms": int(max_latency or 0),
        "logs": [
            {
                "id": str(log.id),
                "user_id": str(log.user_id) if log.user_id else None,
                "method": log.method,
                "endpoint": log.endpoint,
                "request_payload": log.request_payload,
                "response_code": log.response_code,
                "latency_ms": log.latency_ms,
                "created_at": log.created_at.isoformat()
            }
            for log in apis
        ]
    }


@router.post("/export")
async def trigger_export(
    req: ExportRequestSchema,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id or uuid.UUID("00000000-0000-0000-0000-000000000000")
    log = await AuditService.log_export(
        db=db,
        organization_id=org_id,
        user_id=current_user.id,
        module=req.module,
        export_type=req.export_type,
        file_name=req.file_name,
        download_url=f"https://storage.eventx.com/exports/{org_id}/{req.file_name}"
    )
    await db.commit()
    return {
        "status": "success",
        "export_id": str(log.id),
        "download_url": log.download_url
    }
