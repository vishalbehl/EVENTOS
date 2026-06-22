import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.platform_compliance.services import ComplianceService
from app.modules.platform_compliance.security_services import SecurityEventService
from app.modules.platform_audit.models import PlatformImpersonationLog

router = APIRouter(tags=["platform-compliance"])


class GenerateReportSchema(BaseModel):
    report_type: str


class ConfigureRetentionSchema(BaseModel):
    module: str
    retention_days: int
    archive_enabled: bool = False
    delete_enabled: bool = True


class ResolveEventSchema(BaseModel):
    resolution_details: str


# ── Compliance endpoints ─────────────────────────────────────

@router.get("/platform/compliance/reports")
async def get_compliance_reports(
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id or uuid.UUID("00000000-0000-0000-0000-000000000000")
    reports = await ComplianceService.get_reports(db, org_id, limit, offset)
    return [
        {
            "id": str(r.id),
            "report_type": r.report_type,
            "generated_by": str(r.generated_by),
            "file_url": r.file_url,
            "generated_at": r.generated_at.isoformat()
        }
        for r in reports
    ]


@router.post("/platform/compliance/reports/generate")
async def generate_compliance_report(
    req: GenerateReportSchema,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id or uuid.UUID("00000000-0000-0000-0000-000000000000")
    # In production, this can trigger a Celery task or run inline. Let's run inline and commit.
    report = await ComplianceService.generate_report(
        db=db,
        organization_id=org_id,
        report_type=req.report_type,
        generated_by=current_user.id
    )
    await db.commit()
    return {
        "status": "success",
        "report_id": str(report.id),
        "file_url": report.file_url
    }


@router.get("/platform/compliance/retention")
async def get_retention_policies(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id or uuid.UUID("00000000-0000-0000-0000-000000000000")
    policies = await ComplianceService.get_retention_policies(db, org_id)
    return [
        {
            "id": str(p.id),
            "module": p.module,
            "retention_days": p.retention_days,
            "archive_enabled": p.archive_enabled,
            "delete_enabled": p.delete_enabled
        }
        for p in policies
    ]


@router.put("/platform/compliance/retention")
async def update_retention_policy(
    req: ConfigureRetentionSchema,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id or uuid.UUID("00000000-0000-0000-0000-000000000000")
    policy = await ComplianceService.configure_retention_policy(
        db=db,
        organization_id=org_id,
        module=req.module,
        retention_days=req.retention_days,
        archive_enabled=req.archive_enabled,
        delete_enabled=req.delete_enabled
    )
    await db.commit()
    return {
        "status": "success",
        "policy_id": str(policy.id),
        "module": policy.module,
        "retention_days": policy.retention_days
    }


# ── Security endpoints ───────────────────────────────────────

@router.get("/platform/security/events")
async def get_security_events(
    severity: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id or uuid.UUID("00000000-0000-0000-0000-000000000000")
    events = await SecurityEventService.get_events(db, org_id, severity, status, limit, offset)
    return [
        {
            "id": str(e.id),
            "event_type": e.event_type,
            "severity": e.severity,
            "title": e.title,
            "description": e.description,
            "metadata": e.metadata_data,
            "status": e.status,
            "created_at": e.created_at.isoformat()
        }
        for e in events
    ]


@router.post("/platform/security/events/{id}/resolve")
async def resolve_security_event(
    id: uuid.UUID,
    req: ResolveEventSchema,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id or uuid.UUID("00000000-0000-0000-0000-000000000000")
    event = await SecurityEventService.mark_resolved(
        db=db,
        event_id=id,
        organization_id=org_id,
        resolution_metadata={"resolved_by": str(current_user.id), "details": req.resolution_details}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Security event not found.")
    await db.commit()
    return {
        "status": "success",
        "event_id": str(event.id),
        "event_status": event.status
    }


@router.get("/platform/security/impersonations")
async def get_impersonation_logs(
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id or uuid.UUID("00000000-0000-0000-0000-000000000000")
    stmt = select(PlatformImpersonationLog).where(
        PlatformImpersonationLog.organization_id == org_id
    ).order_by(desc(PlatformImpersonationLog.started_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return [
        {
            "id": str(log.id),
            "admin_user_id": str(log.admin_user_id),
            "target_user_id": str(log.target_user_id),
            "reason": log.reason,
            "started_at": log.started_at.isoformat(),
            "ended_at": log.ended_at.isoformat() if log.ended_at else None,
            "actions_count": log.actions_count
        }
        for log in logs
    ]
