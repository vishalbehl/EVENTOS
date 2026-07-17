from __future__ import annotations

import hashlib
import json
import uuid
from datetime import date, datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, desc, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.dependencies import StepUpAuth, get_db
from app.modules.audit.models.audit_log import AuditLog
from app.modules.deployment_management.models import Risk, RiskAction, RiskComment, RiskEvidence
from app.modules.events.models.event import Event
from app.modules.files.models.file import Asset
from app.modules.identity.models.user import User
from app.modules.operations_control.models import (
    JobControlRequest,
    VenueOperationalIncident,
    VenueReadinessAttestation,
    VenueSupplierAssignment,
    VenueSupplierContact,
)
from app.modules.operations_planning.models import Project
from app.modules.procurement.models import Vendor
from app.modules.search.models.search import SearchJob
from app.modules.superadmin.dependencies import require_super_admin
from app.modules.technology_services.models import RequestAssignment, ServiceRequest, ServiceSlaTarget
from app.modules.venue.models.room_device import RoomDevice
from app.modules.venue.models.venue_sync_job import VenueSyncJob


router = APIRouter(prefix="/platform/operations", tags=["platform-operations-control"])


def _problem(code: str, message: str, status_code: int = 409) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _fingerprint(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _audit(db: AsyncSession, actor: User, org_id: uuid.UUID, resource_type: str, resource_id: uuid.UUID, action: str, reason: str, state: dict[str, Any] | None = None) -> None:
    db.add(AuditLog(
        organization_id=org_id,
        actor_user_id=actor.id,
        actor_role=actor.platform_role or actor.role,
        resource_type=resource_type,
        resource_id=resource_id,
        action_type=action,
        new_state={"reason": reason, **(state or {})},
        is_sensitive=action in {"JOB_CANCEL_REQUESTED", "SEARCH_REINDEX_REQUESTED", "RISK_ACCEPTED", "VENUE_CREDENTIAL_CHANGED"},
    ))


class ReasonedCommand(BaseModel):
    organization_id: uuid.UUID
    event_id: Optional[uuid.UUID] = None
    reason: str = Field(min_length=12, max_length=1000)


class RequestPatch(BaseModel):
    organization_id: uuid.UUID
    version: int = Field(ge=1)
    priority: Optional[str] = None
    title: Optional[str] = Field(default=None, min_length=3, max_length=255)
    description: Optional[str] = Field(default=None, max_length=5000)
    reason: str = Field(min_length=12, max_length=1000)


class RequestAssign(BaseModel):
    organization_id: uuid.UUID
    version: int = Field(ge=1)
    assigned_to: uuid.UUID
    role: str = Field(min_length=2, max_length=100)
    reason: str = Field(min_length=12, max_length=1000)


class RequestTransition(BaseModel):
    organization_id: uuid.UUID
    version: int = Field(ge=1)
    target_status: str
    reason: str = Field(min_length=12, max_length=1000)


REQUEST_TRANSITIONS = {
    "DRAFT": {"SUBMITTED", "CANCELLED"},
    "SUBMITTED": {"TRIAGED", "REJECTED", "CANCELLED"},
    "TRIAGED": {"APPROVED", "REJECTED", "IN_PROGRESS"},
    "APPROVED": {"IN_PROGRESS", "CANCELLED"},
    "IN_PROGRESS": {"COMPLETED", "CANCELLED"},
    "COMPLETED": {"CLOSED"},
    "REJECTED": {"CLOSED"},
}


class RiskCreate(BaseModel):
    organization_id: uuid.UUID
    project_id: uuid.UUID
    title: str = Field(min_length=3, max_length=255)
    description: Optional[str] = None
    severity: str = "MEDIUM"
    probability: str = "MEDIUM"
    category: Optional[str] = None
    impact: Optional[str] = None
    owner_user_id: Optional[uuid.UUID] = None
    due_date: Optional[date] = None
    mitigation_plan: Optional[str] = None
    reason: str = Field(min_length=12, max_length=1000)


class RiskPatch(BaseModel):
    organization_id: uuid.UUID
    version: int = Field(ge=1)
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    probability: Optional[str] = None
    category: Optional[str] = None
    impact: Optional[str] = None
    owner_user_id: Optional[uuid.UUID] = None
    due_date: Optional[date] = None
    mitigation_plan: Optional[str] = None
    status: Optional[str] = None
    reason: str = Field(min_length=12, max_length=1000)


class RiskActionIn(BaseModel):
    organization_id: uuid.UUID
    action_description: str = Field(min_length=3)
    assigned_to: uuid.UUID
    due_date: Optional[date] = None
    reason: str = Field(min_length=12)


class RiskCommentIn(BaseModel):
    organization_id: uuid.UUID
    comment: str = Field(min_length=2, max_length=5000)


class RiskEvidenceIn(BaseModel):
    organization_id: uuid.UUID
    asset_id: uuid.UUID
    description: Optional[str] = None
    reason: str = Field(min_length=12)


class RiskDecision(BaseModel):
    organization_id: uuid.UUID
    version: int = Field(ge=1)
    reason: str = Field(min_length=12, max_length=2000)


class SupplierAssignmentIn(BaseModel):
    organization_id: uuid.UUID
    event_id: uuid.UUID
    vendor_id: uuid.UUID
    contract_reference: Optional[str] = None
    responsibility_scope: dict[str, Any] = Field(default_factory=dict)
    starts_on: Optional[date] = None
    ends_on: Optional[date] = None
    reason: str = Field(min_length=12)


class SupplierAssignmentPatch(BaseModel):
    organization_id: uuid.UUID
    contract_reference: Optional[str] = None
    responsibility_scope: Optional[dict[str, Any]] = None
    starts_on: Optional[date] = None
    ends_on: Optional[date] = None
    status: Optional[Literal["ACTIVE", "SUSPENDED", "COMPLETED", "CANCELLED"]] = None
    reason: str = Field(min_length=12)


class IncidentResolution(BaseModel):
    organization_id: uuid.UUID
    resolution: str = Field(min_length=12, max_length=5000)
    reason: str = Field(min_length=12)


class SupplierContactIn(BaseModel):
    organization_id: uuid.UUID
    name: str = Field(min_length=2, max_length=150)
    role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_primary: bool = False
    reason: str = Field(min_length=12)


class AttestationIn(BaseModel):
    organization_id: uuid.UUID
    category: str
    status: Literal["READY", "NOT_READY", "CONDITIONAL", "UNKNOWN"]
    statement: str = Field(min_length=5)
    evidence_asset_id: Optional[uuid.UUID] = None
    attested_by_name: str
    valid_until: Optional[datetime] = None
    reason: str = Field(min_length=12)


class IncidentIn(BaseModel):
    organization_id: uuid.UUID
    title: str = Field(min_length=3)
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    description: Optional[str] = None
    owner_user_id: Optional[uuid.UUID] = None
    reason: str = Field(min_length=12)


async def _event_for_org(db: AsyncSession, event_id: uuid.UUID, org_id: uuid.UUID) -> Event:
    event = await db.scalar(select(Event).where(Event.id == event_id, Event.organization_id == org_id, Event.deleted_at.is_(None)))
    if event is None:
        raise _problem("NOT_FOUND", "Event not found.", 404)
    return event


async def _request_for_org(db: AsyncSession, request_id: uuid.UUID, org_id: uuid.UUID) -> ServiceRequest:
    row = await db.scalar(select(ServiceRequest).where(ServiceRequest.id == request_id, ServiceRequest.organization_id == org_id))
    if row is None:
        raise _problem("NOT_FOUND", "Service request not found.", 404)
    return row


async def _risk_for_org(db: AsyncSession, risk_id: uuid.UUID, org_id: uuid.UUID) -> tuple[Risk, Project]:
    result = await db.execute(select(Risk, Project).join(Project, Project.id == Risk.project_id).where(Risk.id == risk_id, Project.organization_id == org_id))
    row = result.first()
    if row is None:
        raise _problem("NOT_FOUND", "Risk not found.", 404)
    return row[0], row[1]


@router.get("/overview")
async def operations_overview(db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin)) -> dict[str, Any]:
    sources: list[dict[str, Any]] = []
    checks = [
        ("requests", "technology_services.service_requests"), ("risks", "deployment_management.risks"),
        ("jobs", "search.search_jobs"), ("storage", "files.assets"),
        ("venue", "venue.venue_supplier_assignments"),
    ]
    for name, table in checks:
        try:
            exists = bool(await db.scalar(text("SELECT to_regclass(:name) IS NOT NULL"), {"name": table}))
            sources.append({"key": name, "status": "HEALTHY" if exists else "UNAVAILABLE", "freshness_at": datetime.now(timezone.utc).isoformat() if exists else None, "detail": "Authoritative source available." if exists else "Source table is unavailable."})
        except Exception:
            sources.append({"key": name, "status": "DOWN", "freshness_at": None, "detail": "Source check failed."})
    overall = "HEALTHY" if all(item["status"] == "HEALTHY" for item in sources) else "DEGRADED"
    return {"overall_status": overall, "checked_at": datetime.now(timezone.utc), "sources": sources}


@router.get("/storage")
async def storage_telemetry(db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin)) -> dict[str, Any]:
    total, size = (await db.execute(select(func.count(Asset.id), func.coalesce(func.sum(Asset.file_size_bytes), 0)))).one()
    statuses = (await db.execute(select(Asset.processing_status, func.count(Asset.id), func.coalesce(func.sum(Asset.file_size_bytes), 0)).group_by(Asset.processing_status))).all()
    return {
        "provider_status": "UNVERIFIED",
        "provider_detail": "Database metadata is authoritative; object-provider quota and reachability are not configured for this request path.",
        "total_objects": total,
        "total_bytes": int(size),
        "capacity_bytes": None,
        "by_status": [{"status": row[0], "count": row[1], "bytes": int(row[2])} for row in statuses],
        "freshness_at": datetime.now(timezone.utc),
    }


@router.get("/requests")
async def list_operational_requests(
    organization_id: Optional[uuid.UUID] = None, event_id: Optional[uuid.UUID] = None,
    request_status: Optional[str] = Query(None, alias="status"), priority: Optional[str] = None,
    request_type: Optional[str] = None, cursor: Optional[uuid.UUID] = None, limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin),
) -> dict[str, Any]:
    stmt = select(ServiceRequest).order_by(desc(ServiceRequest.created_at), desc(ServiceRequest.id))
    if organization_id: stmt = stmt.where(ServiceRequest.organization_id == organization_id)
    if event_id: stmt = stmt.where(ServiceRequest.event_id == event_id)
    if request_status: stmt = stmt.where(ServiceRequest.status == request_status.upper())
    if priority: stmt = stmt.where(ServiceRequest.priority == priority.upper())
    if request_type: stmt = stmt.where(ServiceRequest.request_type == request_type)
    if cursor:
        anchor = await db.scalar(select(ServiceRequest).where(ServiceRequest.id == cursor))
        if anchor: stmt = stmt.where(or_(ServiceRequest.created_at < anchor.created_at, and_(ServiceRequest.created_at == anchor.created_at, ServiceRequest.id < anchor.id)))
    rows = list((await db.scalars(stmt.limit(limit + 1))).all())
    return {"items": [_request_dict(row) for row in rows[:limit]], "next_cursor": str(rows[limit - 1].id) if len(rows) > limit else None, "has_next": len(rows) > limit}


def _request_dict(row: ServiceRequest) -> dict[str, Any]:
    return {"id": row.id, "organization_id": row.organization_id, "event_id": row.event_id, "request_number": row.request_number, "title": row.title, "description": row.description, "status": row.status, "priority": row.priority, "request_type": row.request_type, "version": row.version, "created_at": row.created_at, "updated_at": row.updated_at}


@router.get("/requests/{request_id}")
async def get_operational_request(request_id: uuid.UUID, organization_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, organization_id):
        row = await _request_for_org(db, request_id, organization_id)
        assignments = list((await db.scalars(select(RequestAssignment).where(RequestAssignment.request_id == request_id).order_by(desc(RequestAssignment.assigned_at)))).all())
        sla = await db.scalar(select(ServiceSlaTarget).where(ServiceSlaTarget.request_id == request_id))
        return {**_request_dict(row), "assignments": [{"id": a.id, "assigned_to": a.assigned_to, "role": a.role, "status": a.status, "assigned_at": a.assigned_at} for a in assignments], "sla": None if sla is None else {"response_deadline": sla.response_deadline, "resolution_deadline": sla.resolution_deadline, "responded_at": sla.responded_at, "resolved_at": sla.resolved_at}}


@router.patch("/requests/{request_id}")
async def patch_operational_request(request_id: uuid.UUID, body: RequestPatch, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        row = await _request_for_org(db, request_id, body.organization_id)
        if row.version != body.version: raise _problem("VERSION_CONFLICT", "Service request was changed by another user.")
        old = _request_dict(row)
        for field in ("priority", "title", "description"):
            value = getattr(body, field)
            if value is not None: setattr(row, field, value.upper() if field == "priority" else value)
        row.version += 1
        _audit(db, actor, body.organization_id, "service_request", row.id, "OPERATIONAL_REQUEST_UPDATED", body.reason, {"old": old, "version": row.version})
        await db.commit()
        return _request_dict(row)


@router.post("/requests/{request_id}/assign")
async def assign_operational_request(request_id: uuid.UUID, body: RequestAssign, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        row = await _request_for_org(db, request_id, body.organization_id)
        if row.version != body.version: raise _problem("VERSION_CONFLICT", "Service request was changed by another user.")
        await db.execute(text("UPDATE technology_services.request_assignments SET status='INACTIVE' WHERE request_id=:id AND status='ACTIVE'"), {"id": request_id})
        assignment = RequestAssignment(request_id=request_id, assigned_to=body.assigned_to, assigned_by=actor.id, role=body.role, status="ACTIVE")
        db.add(assignment); row.version += 1
        _audit(db, actor, body.organization_id, "service_request", row.id, "OPERATIONAL_REQUEST_ASSIGNED", body.reason, {"assigned_to": str(body.assigned_to), "version": row.version})
        await db.commit(); await db.refresh(assignment)
        return {"assignment_id": assignment.id, "version": row.version, "status": "ACTIVE"}


@router.post("/requests/{request_id}/transition")
async def transition_operational_request(request_id: uuid.UUID, body: RequestTransition, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        row = await _request_for_org(db, request_id, body.organization_id)
        target = body.target_status.upper()
        if row.version != body.version: raise _problem("VERSION_CONFLICT", "Service request was changed by another user.")
        if target not in REQUEST_TRANSITIONS.get(row.status.upper(), set()): raise _problem("INVALID_TRANSITION", f"Cannot transition {row.status} to {target}.")
        previous = row.status; row.status = target; row.version += 1
        now = datetime.now(timezone.utc)
        if target == "APPROVED": row.approved_at = now
        if target in {"COMPLETED", "CLOSED"}: row.completed_at = now
        _audit(db, actor, body.organization_id, "service_request", row.id, "OPERATIONAL_REQUEST_TRANSITIONED", body.reason, {"from": previous, "to": target, "version": row.version})
        await db.commit(); return _request_dict(row)


def _risk_dict(risk: Risk, project: Project) -> dict[str, Any]:
    return {"id": risk.id, "organization_id": project.organization_id, "event_id": project.event_id, "project_id": project.id, "title": risk.title, "description": risk.description, "severity": risk.severity, "probability": risk.probability, "category": risk.category, "impact": risk.impact, "owner_user_id": risk.owner_user_id, "due_date": risk.due_date, "mitigation_plan": risk.mitigation_plan, "status": risk.status, "version": risk.version, "accepted_by": risk.accepted_by, "accepted_at": risk.accepted_at, "resolved_at": risk.resolved_at}


@router.get("/risks")
async def list_risks(organization_id: Optional[uuid.UUID] = None, event_id: Optional[uuid.UUID] = None, risk_status: Optional[str] = Query(None, alias="status"), severity: Optional[str] = None, limit: int = Query(50, ge=1, le=100), db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin)) -> dict[str, Any]:
    stmt = select(Risk, Project).join(Project, Project.id == Risk.project_id).order_by(desc(Risk.id)).limit(limit)
    if organization_id: stmt = stmt.where(Project.organization_id == organization_id)
    if event_id: stmt = stmt.where(Project.event_id == event_id)
    if risk_status: stmt = stmt.where(Risk.status == risk_status.upper())
    if severity: stmt = stmt.where(Risk.severity == severity.upper())
    rows = (await db.execute(stmt)).all()
    return {"items": [_risk_dict(r, p) for r, p in rows]}


@router.get("/projects")
async def list_operations_projects(organization_id: Optional[uuid.UUID] = None, event_id: Optional[uuid.UUID] = None, limit: int = Query(200, ge=1, le=500), db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin)) -> dict[str, Any]:
    stmt = select(Project).order_by(Project.name).limit(limit)
    if organization_id: stmt = stmt.where(Project.organization_id == organization_id)
    if event_id: stmt = stmt.where(Project.event_id == event_id)
    rows = list((await db.scalars(stmt)).all())
    return {"items": [{"id": row.id, "organization_id": row.organization_id, "event_id": row.event_id, "name": row.name, "project_code": row.project_code, "status": row.status} for row in rows]}


@router.get("/risks/{risk_id}")
async def get_risk(risk_id: uuid.UUID, organization_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, organization_id):
        risk, project = await _risk_for_org(db, risk_id, organization_id)
        actions = list((await db.scalars(select(RiskAction).where(RiskAction.risk_id == risk.id))).all())
        comments = list((await db.scalars(select(RiskComment).where(RiskComment.risk_id == risk.id).order_by(desc(RiskComment.created_at)))).all())
        evidence = list((await db.scalars(select(RiskEvidence).where(RiskEvidence.risk_id == risk.id).order_by(desc(RiskEvidence.created_at)))).all())
        return {**_risk_dict(risk, project), "actions": [{"id": a.id, "description": a.action_description, "assigned_to": a.assigned_to, "due_date": a.due_date, "status": a.status} for a in actions], "comments": [{"id": c.id, "comment": c.comment, "created_by": c.created_by, "created_at": c.created_at} for c in comments], "evidence": [{"id": e.id, "asset_id": e.asset_id, "description": e.description, "created_at": e.created_at} for e in evidence]}


@router.post("/risks", status_code=201)
async def create_risk(body: RiskCreate, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        project = await db.scalar(select(Project).where(Project.id == body.project_id, Project.organization_id == body.organization_id))
        if project is None: raise _problem("NOT_FOUND", "Project not found.", 404)
        risk = Risk(project_id=project.id, title=body.title, description=body.description, severity=body.severity.upper(), probability=body.probability.upper(), category=body.category, impact=body.impact, owner_user_id=body.owner_user_id, due_date=body.due_date, mitigation_plan=body.mitigation_plan, status="IDENTIFIED", version=1)
        db.add(risk); await db.flush()
        _audit(db, actor, body.organization_id, "operational_risk", risk.id, "RISK_CREATED", body.reason)
        await db.commit(); return _risk_dict(risk, project)


@router.patch("/risks/{risk_id}")
async def patch_risk(risk_id: uuid.UUID, body: RiskPatch, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        risk, project = await _risk_for_org(db, risk_id, body.organization_id)
        if risk.version != body.version: raise _problem("VERSION_CONFLICT", "Risk was changed by another user.")
        for field in ("title", "description", "severity", "probability", "category", "impact", "owner_user_id", "due_date", "mitigation_plan", "status"):
            value = getattr(body, field)
            if value is not None: setattr(risk, field, value.upper() if field in {"severity", "probability", "status"} else value)
        risk.version += 1
        _audit(db, actor, body.organization_id, "operational_risk", risk.id, "RISK_UPDATED", body.reason, {"version": risk.version})
        await db.commit(); return _risk_dict(risk, project)


@router.post("/risks/{risk_id}/actions", status_code=201)
async def add_risk_action(risk_id: uuid.UUID, body: RiskActionIn, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        risk, _ = await _risk_for_org(db, risk_id, body.organization_id)
        action = RiskAction(risk_id=risk.id, action_description=body.action_description, assigned_to=body.assigned_to, due_date=body.due_date, status="PENDING")
        db.add(action); await db.flush(); _audit(db, actor, body.organization_id, "operational_risk", risk.id, "RISK_ACTION_ADDED", body.reason, {"action_id": str(action.id)})
        await db.commit(); return {"id": action.id, "status": action.status}


@router.post("/risks/{risk_id}/comments", status_code=201)
async def add_risk_comment(risk_id: uuid.UUID, body: RiskCommentIn, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        risk, _ = await _risk_for_org(db, risk_id, body.organization_id)
        comment = RiskComment(risk_id=risk.id, comment=body.comment, created_by=actor.id); db.add(comment); await db.commit(); await db.refresh(comment)
        return {"id": comment.id, "created_at": comment.created_at}


@router.post("/risks/{risk_id}/evidence", status_code=201)
async def add_risk_evidence(risk_id: uuid.UUID, body: RiskEvidenceIn, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        risk, _ = await _risk_for_org(db, risk_id, body.organization_id)
        asset = await db.scalar(select(Asset).where(Asset.id == body.asset_id, Asset.organization_id == body.organization_id, Asset.processing_status == "READY"))
        if asset is None: raise _problem("EVIDENCE_NOT_READY", "Evidence asset was not found or is not ready.", 422)
        evidence = RiskEvidence(organization_id=body.organization_id, risk_id=risk.id, asset_id=asset.id, description=body.description, created_by=actor.id)
        db.add(evidence); await db.flush(); _audit(db, actor, body.organization_id, "operational_risk", risk.id, "RISK_EVIDENCE_ADDED", body.reason, {"evidence_id": str(evidence.id)})
        await db.commit(); return {"id": evidence.id}


@router.post("/risks/{risk_id}/accept")
async def accept_risk(risk_id: uuid.UUID, body: RiskDecision, step_up: StepUpAuth, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    del step_up
    async with TenantContextGuard.scoped(db, body.organization_id):
        risk, project = await _risk_for_org(db, risk_id, body.organization_id)
        if risk.version != body.version: raise _problem("VERSION_CONFLICT", "Risk was changed by another user.")
        risk.status = "ACCEPTED"; risk.accepted_by = actor.id; risk.accepted_at = datetime.now(timezone.utc); risk.acceptance_reason = body.reason; risk.version += 1
        _audit(db, actor, body.organization_id, "operational_risk", risk.id, "RISK_ACCEPTED", body.reason, {"severity": risk.severity})
        await db.commit(); return _risk_dict(risk, project)


@router.post("/risks/{risk_id}/resolve")
async def resolve_risk(risk_id: uuid.UUID, body: RiskDecision, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        risk, project = await _risk_for_org(db, risk_id, body.organization_id)
        if risk.version != body.version: raise _problem("VERSION_CONFLICT", "Risk was changed by another user.")
        risk.status = "RESOLVED"; risk.resolved_at = datetime.now(timezone.utc); risk.version += 1
        _audit(db, actor, body.organization_id, "operational_risk", risk.id, "RISK_RESOLVED", body.reason)
        await db.commit(); return _risk_dict(risk, project)


@router.get("/venue/supplier-assignments")
async def list_supplier_assignments(organization_id: Optional[uuid.UUID] = None, event_id: Optional[uuid.UUID] = None, db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin)) -> dict[str, Any]:
    stmt = select(VenueSupplierAssignment, Vendor, Event).join(Vendor, Vendor.id == VenueSupplierAssignment.vendor_id).join(Event, Event.id == VenueSupplierAssignment.event_id).order_by(desc(VenueSupplierAssignment.created_at))
    if organization_id: stmt = stmt.where(VenueSupplierAssignment.organization_id == organization_id)
    if event_id: stmt = stmt.where(VenueSupplierAssignment.event_id == event_id)
    rows = (await db.execute(stmt)).all()
    return {"items": [_assignment_dict(a, v, e) for a, v, e in rows]}


def _assignment_dict(a: VenueSupplierAssignment, vendor: Vendor, event: Event) -> dict[str, Any]:
    return {"id": a.id, "organization_id": a.organization_id, "event_id": a.event_id, "event_name": event.name, "vendor_id": a.vendor_id, "supplier_name": vendor.name, "contract_reference": a.contract_reference, "responsibility_scope": a.responsibility_scope, "starts_on": a.starts_on, "ends_on": a.ends_on, "status": a.status, "created_at": a.created_at}


@router.post("/venue/supplier-assignments", status_code=201)
async def create_supplier_assignment(body: SupplierAssignmentIn, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128), db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        event = await _event_for_org(db, body.event_id, body.organization_id)
        vendor = await db.get(Vendor, body.vendor_id)
        if vendor is None or vendor.status != "ACTIVE": raise _problem("NOT_FOUND", "Active supplier not found.", 404)
        existing = await db.scalar(select(VenueSupplierAssignment).where(VenueSupplierAssignment.event_id == body.event_id, VenueSupplierAssignment.vendor_id == body.vendor_id))
        if existing: return _assignment_dict(existing, vendor, event)
        assignment = VenueSupplierAssignment(organization_id=body.organization_id, event_id=body.event_id, vendor_id=body.vendor_id, contract_reference=body.contract_reference, responsibility_scope={**body.responsibility_scope, "idempotency_key": idempotency_key}, starts_on=body.starts_on, ends_on=body.ends_on, status="ACTIVE", created_by=actor.id)
        db.add(assignment); await db.flush(); _audit(db, actor, body.organization_id, "venue_supplier_assignment", assignment.id, "VENUE_SUPPLIER_ASSIGNED", body.reason, {"event_id": str(event.id), "vendor_id": str(vendor.id)})
        await db.commit(); return _assignment_dict(assignment, vendor, event)


@router.patch("/venue/supplier-assignments/{assignment_id}")
async def patch_supplier_assignment(assignment_id: uuid.UUID, body: SupplierAssignmentPatch, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        assignment = await _assignment_for_org(db, assignment_id, body.organization_id)
        for field in ("contract_reference", "responsibility_scope", "starts_on", "ends_on", "status"):
            value = getattr(body, field)
            if value is not None: setattr(assignment, field, value)
        vendor = await db.get(Vendor, assignment.vendor_id); event = await _event_for_org(db, assignment.event_id, body.organization_id)
        _audit(db, actor, body.organization_id, "venue_supplier_assignment", assignment.id, "VENUE_SUPPLIER_ASSIGNMENT_UPDATED", body.reason, {"status": assignment.status})
        await db.commit(); return _assignment_dict(assignment, vendor, event)


@router.delete("/venue/supplier-assignments/{assignment_id}")
async def deactivate_supplier_assignment(assignment_id: uuid.UUID, organization_id: uuid.UUID, reason: str = Header(..., alias="X-Admin-Reason", min_length=12, max_length=1000), db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, organization_id):
        assignment = await _assignment_for_org(db, assignment_id, organization_id)
        assignment.status = "CANCELLED"
        _audit(db, actor, organization_id, "venue_supplier_assignment", assignment.id, "VENUE_SUPPLIER_ASSIGNMENT_CANCELLED", reason)
        await db.commit(); return {"id": assignment.id, "status": assignment.status}


async def _assignment_for_org(db: AsyncSession, assignment_id: uuid.UUID, org_id: uuid.UUID) -> VenueSupplierAssignment:
    row = await db.scalar(select(VenueSupplierAssignment).where(VenueSupplierAssignment.id == assignment_id, VenueSupplierAssignment.organization_id == org_id))
    if row is None: raise _problem("NOT_FOUND", "Supplier assignment not found.", 404)
    return row


@router.post("/venue/supplier-assignments/{assignment_id}/contacts", status_code=201)
async def add_supplier_contact(assignment_id: uuid.UUID, body: SupplierContactIn, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        assignment = await _assignment_for_org(db, assignment_id, body.organization_id)
        if body.is_primary: await db.execute(text("UPDATE venue.venue_supplier_contacts SET is_primary=false WHERE assignment_id=:id"), {"id": assignment.id})
        contact = VenueSupplierContact(organization_id=body.organization_id, assignment_id=assignment.id, name=body.name, role=body.role, email=body.email, phone=body.phone, is_primary=body.is_primary)
        db.add(contact); await db.flush(); _audit(db, actor, body.organization_id, "venue_supplier_assignment", assignment.id, "VENUE_SUPPLIER_CONTACT_ADDED", body.reason, {"contact_id": str(contact.id)})
        await db.commit(); return {"id": contact.id}


@router.post("/venue/supplier-assignments/{assignment_id}/attestations", status_code=201)
async def add_readiness_attestation(assignment_id: uuid.UUID, body: AttestationIn, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        assignment = await _assignment_for_org(db, assignment_id, body.organization_id)
        if body.evidence_asset_id:
            asset = await db.scalar(select(Asset).where(Asset.id == body.evidence_asset_id, Asset.organization_id == body.organization_id, Asset.processing_status == "READY"))
            if asset is None: raise _problem("EVIDENCE_NOT_READY", "Evidence asset was not found or is not ready.", 422)
        row = VenueReadinessAttestation(organization_id=body.organization_id, assignment_id=assignment.id, category=body.category, status=body.status, statement=body.statement, evidence_asset_id=body.evidence_asset_id, attested_by_name=body.attested_by_name, valid_until=body.valid_until)
        db.add(row); await db.flush(); _audit(db, actor, body.organization_id, "venue_supplier_assignment", assignment.id, "VENUE_READINESS_ATTESTED", body.reason, {"attestation_id": str(row.id), "status": row.status})
        await db.commit(); return {"id": row.id, "status": row.status}


@router.post("/venue/supplier-assignments/{assignment_id}/incidents", status_code=201)
async def create_venue_incident(assignment_id: uuid.UUID, body: IncidentIn, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id):
        assignment = await _assignment_for_org(db, assignment_id, body.organization_id)
        incident = VenueOperationalIncident(organization_id=body.organization_id, assignment_id=assignment.id, title=body.title, severity=body.severity, description=body.description, owner_user_id=body.owner_user_id)
        db.add(incident); await db.flush(); _audit(db, actor, body.organization_id, "venue_incident", incident.id, "VENUE_INCIDENT_OPENED", body.reason, {"assignment_id": str(assignment.id), "severity": incident.severity})
        await db.commit(); return {"id": incident.id, "status": incident.status}


@router.post("/venue/incidents/{incident_id}/resolve")
async def resolve_venue_incident(incident_id: uuid.UUID, body: IncidentResolution, step_up: StepUpAuth, db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    del step_up
    async with TenantContextGuard.scoped(db, body.organization_id):
        incident = await db.scalar(select(VenueOperationalIncident).where(VenueOperationalIncident.id == incident_id, VenueOperationalIncident.organization_id == body.organization_id))
        if incident is None: raise _problem("NOT_FOUND", "Venue incident not found.", 404)
        incident.status = "RESOLVED"; incident.resolution = body.resolution; incident.resolved_at = datetime.now(timezone.utc)
        _audit(db, actor, body.organization_id, "venue_incident", incident.id, "VENUE_INCIDENT_RESOLVED", body.reason)
        await db.commit(); return {"id": incident.id, "status": incident.status, "resolved_at": incident.resolved_at}


@router.get("/venue/readiness")
async def venue_readiness(organization_id: Optional[uuid.UUID] = None, event_id: Optional[uuid.UUID] = None, db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin)) -> dict[str, Any]:
    stmt = select(VenueSupplierAssignment, Vendor, Event).join(Vendor, Vendor.id == VenueSupplierAssignment.vendor_id).join(Event, Event.id == VenueSupplierAssignment.event_id)
    if organization_id: stmt = stmt.where(VenueSupplierAssignment.organization_id == organization_id)
    if event_id: stmt = stmt.where(VenueSupplierAssignment.event_id == event_id)
    result = []
    for assignment, vendor, event in (await db.execute(stmt)).all():
        attestations = list((await db.scalars(select(VenueReadinessAttestation).where(VenueReadinessAttestation.assignment_id == assignment.id).order_by(desc(VenueReadinessAttestation.attested_at)))).all())
        devices = list((await db.scalars(select(RoomDevice).where(RoomDevice.supplier_assignment_id == assignment.id))).all())
        open_incidents = await db.scalar(select(func.count(VenueOperationalIncident.id)).where(VenueOperationalIncident.assignment_id == assignment.id, VenueOperationalIncident.status != "RESOLVED")) or 0
        sync_failures = await db.scalar(select(func.count(VenueSyncJob.id)).where(VenueSyncJob.event_id == event.id, VenueSyncJob.status == "failed")) or 0
        result.append({**_assignment_dict(assignment, vendor, event), "readiness_status": attestations[0].status if attestations else "UNKNOWN", "latest_attestation_at": attestations[0].attested_at if attestations else None, "device_count": len(devices), "online_device_count": sum(1 for d in devices if d.status == "online"), "expired_credentials": sum(1 for d in devices if d.device_key_expires_at and d.device_key_expires_at <= datetime.now(timezone.utc)), "open_incidents": open_incidents, "sync_failures": sync_failures})
    return {"items": result, "freshness_at": datetime.now(timezone.utc)}


async def _search_job_for_control(db: AsyncSession, source: str, job_id: str, org_id: uuid.UUID) -> SearchJob:
    if source != "search_index": raise _problem("JOB_ACTION_UNSUPPORTED", f"{source} does not declare a governed control adapter.")
    try: parsed = uuid.UUID(job_id)
    except ValueError: raise _problem("NOT_FOUND", "Job not found.", 404)
    job = await db.scalar(select(SearchJob).where(SearchJob.id == parsed, SearchJob.organization_id == org_id))
    if job is None: raise _problem("NOT_FOUND", "Job not found.", 404)
    return job


async def _job_control(db: AsyncSession, actor: User, source: str, job_id: str, body: ReasonedCommand, idempotency_key: str, operation: str) -> dict[str, Any]:
    fingerprint = _fingerprint({"source": source, "job_id": job_id, "organization_id": body.organization_id, "event_id": body.event_id, "reason": body.reason, "operation": operation})
    existing = await db.scalar(select(JobControlRequest).where(JobControlRequest.organization_id == body.organization_id, JobControlRequest.operation_type == operation, JobControlRequest.idempotency_key == idempotency_key))
    if existing:
        if existing.request_hash != fingerprint: raise _problem("IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different request.")
        return {"id": existing.id, "status": existing.status, "successor_job_id": existing.successor_job_id, "replayed": True}
    job = await _search_job_for_control(db, source, job_id, body.organization_id)
    control = JobControlRequest(organization_id=body.organization_id, event_id=body.event_id, source_type=source, source_job_id=job_id, operation_type=operation, idempotency_key=idempotency_key, request_hash=fingerprint, reason=body.reason, status="PENDING", requested_by=actor.id)
    db.add(control); await db.flush()
    now = datetime.now(timezone.utc)
    if operation == "CANCEL":
        if job.status not in {"pending", "queued"}: raise _problem("JOB_ACTION_UNSUPPORTED", "Only a queued search job can be cooperatively cancelled.")
        job.status = "cancelled"; job.finished_at = now; control.status = "SUCCEEDED"
    else:
        if job.status not in {"failed", "cancelled"}: raise _problem("JOB_ACTION_UNSUPPORTED", "Only failed or cancelled search jobs can be retried.")
        successor = SearchJob(organization_id=job.organization_id, status="pending", entity_types=job.entity_types, records_processed=0, requested_by=actor.id, request_reason=body.reason, predecessor_job_id=job.id, queued_at=now)
        db.add(successor); await db.flush(); control.successor_job_id = str(successor.id); control.status = "SUCCEEDED"
        try:
            from workers.tasks.search_tasks import reindex_organization
            reindex_organization.delay(str(job.organization_id), str(successor.id), successor.entity_types or [])
        except Exception as exc:
            successor.status = "failed"; successor.error_code = "QUEUE_UNAVAILABLE"; successor.error_detail = "Search worker dispatch failed."; successor.finished_at = now
            control.status = "FAILED"; control.failure_code = "QUEUE_UNAVAILABLE"; control.failure_detail = "Search worker dispatch failed."
    control.completed_at = now
    _audit(db, actor, body.organization_id, "background_job", control.id, f"JOB_{operation}_REQUESTED", body.reason, {"source": source, "source_job_id": job_id, "status": control.status})
    await db.commit()
    return {"id": control.id, "status": control.status, "successor_job_id": control.successor_job_id, "replayed": False}


@router.get("/jobs/{source}/{job_id}")
async def get_job_detail(source: str, job_id: str, organization_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, organization_id):
        job = await _search_job_for_control(db, source, job_id, organization_id)
        return {"id": job.id, "source": source, "organization_id": job.organization_id, "status": job.status, "entity_types": job.entity_types, "records_processed": job.records_processed, "error_code": job.error_code, "error_detail": job.error_detail, "created_at": job.created_at, "started_at": job.started_at, "finished_at": job.finished_at, "capabilities": {"retry": job.status in {"failed", "cancelled"}, "cancel": job.status in {"pending", "queued"}}}


@router.post("/jobs/{source}/{job_id}/retry", status_code=202)
async def retry_job(source: str, job_id: str, body: ReasonedCommand, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128), db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    async with TenantContextGuard.scoped(db, body.organization_id): return await _job_control(db, actor, source, job_id, body, idempotency_key, "RETRY")


@router.post("/jobs/{source}/{job_id}/cancel", status_code=202)
async def cancel_job(source: str, job_id: str, body: ReasonedCommand, step_up: StepUpAuth, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128), db: AsyncSession = Depends(get_db), actor: User = Depends(require_super_admin)) -> dict[str, Any]:
    del step_up
    async with TenantContextGuard.scoped(db, body.organization_id): return await _job_control(db, actor, source, job_id, body, idempotency_key, "CANCEL")
