from __future__ import annotations

import uuid
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.core.dependencies.feature_gate import resolve_org_operation
from app.config import settings
from app.dependencies import StepUpAuth, get_current_user, get_db
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.subscription import ActivityTimeline
from app.modules.identity.models.user import User
from app.modules.files.models.file import Asset, AssetVersion, VirusScan
from app.modules.platform.support_access import (
    PlatformSupportScopeDependency,
    execute_platform_support_cursor_read,
)
from app.modules.support.models.ticket import SupportTicket, TicketComment
from app.modules.support.models.support_domain_tables import TicketAttachment
from app.modules.presentations.services.upload_service import create_presigned_download, create_presigned_upload, get_object_metadata
from app.schemas.cursor_pagination import CursorPage

router = APIRouter(prefix="/support/tickets", tags=["Support Desk"])

TICKET_STATUSES = {"OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"}
TICKET_PRIORITIES = {"LOW", "NORMAL", "MEDIUM", "HIGH", "CRITICAL"}
STATUS_TRANSITIONS = {
    "OPEN": {"IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"},
    "IN_PROGRESS": {"OPEN", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"},
    "WAITING_ON_CUSTOMER": {"OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"},
    "RESOLVED": {"OPEN", "CLOSED"},
    "CLOSED": {"OPEN"},
}
SLA_HOURS = {
    "CRITICAL": (1, 4),
    "HIGH": (4, 24),
    "MEDIUM": (8, 48),
    "NORMAL": (24, 72),
    "LOW": (48, 120),
}
SLA_TIER_MULTIPLIER = {
    "STANDARD": 1.0,
    "PRIORITY": 0.5,
    "MISSION_CRITICAL": 0.25,
}


class TicketCreateRequest(BaseModel):
    subject: str = Field(..., min_length=3, max_length=255)
    content: str = Field(..., min_length=3, max_length=20_000)
    priority: str = "MEDIUM"
    category: str = Field("GENERAL", min_length=2, max_length=50)


class TicketCommentRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=20_000)


class AdminTicketCommentRequest(TicketCommentRequest):
    is_internal: bool = False


class AdminTicketUpdateRequest(BaseModel):
    status: str | None = None
    priority: str | None = None
    assigned_to: uuid.UUID | None = None
    category: str | None = Field(None, min_length=2, max_length=50)
    escalate: bool | None = None
    reason: str = Field(..., min_length=12, max_length=1000)
    version: int = Field(..., ge=1)


class TicketCommentResponse(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    author_id: uuid.UUID
    author_email: str
    author_name: str
    content: str
    is_internal: bool
    created_at: datetime


class TicketResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    creator_id: uuid.UUID
    assigned_to: uuid.UUID | None = None
    assigned_agent: str | None = None
    subject: str
    description: str
    status: str
    priority: str
    category: str
    version: int
    is_escalated: bool
    first_response_due_at: datetime | None = None
    resolution_due_at: datetime | None = None
    first_responded_at: datetime | None = None
    resolved_at: datetime | None = None
    closed_at: datetime | None = None
    escalated_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AttachmentUploadRequest(BaseModel):
    file_name: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., min_length=3, max_length=150)
    file_size_bytes: int = Field(..., gt=0, le=25 * 1024 * 1024)
    reason: str = Field(..., min_length=12, max_length=1000)


class AttachmentCompletionRequest(BaseModel):
    reason: str = Field(..., min_length=12, max_length=1000)


class TicketAttachmentResponse(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    asset_id: uuid.UUID | None
    file_name: str
    mime_type: str | None
    file_size_bytes: int | None
    processing_status: str
    uploaded_by: uuid.UUID | None
    created_at: datetime
    upload_url: str | None = None
    upload_headers: dict[str, str] | None = None
    expires_in: int | None = None


ALLOWED_SUPPORT_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "text/plain",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _attachment_out(attachment: TicketAttachment, asset: Asset | None, upload: dict | None = None) -> TicketAttachmentResponse:
    return TicketAttachmentResponse(
        id=attachment.id,
        ticket_id=attachment.ticket_id,
        asset_id=attachment.asset_id,
        file_name=attachment.file_name,
        mime_type=asset.mime_type if asset else None,
        file_size_bytes=asset.file_size_bytes if asset else None,
        processing_status=asset.processing_status if asset else "LEGACY_UNVERIFIED",
        uploaded_by=attachment.uploaded_by,
        created_at=attachment.created_at,
        upload_url=upload.get("url") if upload else None,
        upload_headers={"Content-Type": asset.mime_type} if upload and asset else None,
        expires_in=upload.get("expires_in") if upload else None,
    )


def _normalize(value: str, allowed: set[str], label: str) -> str:
    normalized = value.strip().upper()
    if normalized not in allowed:
        raise HTTPException(status_code=422, detail={"code": f"INVALID_{label.upper()}", "allowed": sorted(allowed)})
    return normalized


def _ticket_response(ticket: SupportTicket, assigned_agent: str | None = None) -> TicketResponse:
    return TicketResponse(
        id=ticket.id,
        organization_id=ticket.organization_id,
        creator_id=ticket.creator_id,
        assigned_to=ticket.assigned_to,
        assigned_agent=assigned_agent,
        subject=ticket.subject,
        description=ticket.description,
        status=ticket.status,
        priority=ticket.priority,
        category=ticket.category,
        version=ticket.version,
        is_escalated=ticket.escalated_at is not None,
        first_response_due_at=ticket.first_response_due_at,
        resolution_due_at=ticket.resolution_due_at,
        first_responded_at=ticket.first_responded_at,
        resolved_at=ticket.resolved_at,
        closed_at=ticket.closed_at,
        escalated_at=ticket.escalated_at,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
    )


def _audit(ticket: SupportTicket, actor: User, action: str, reason: str, old_state: dict | None = None) -> AuditLog:
    return AuditLog(
        organization_id=ticket.organization_id,
        actor_user_id=actor.id,
        resource_type="support_ticket",
        resource_id=ticket.id,
        action_type=action,
        actor_role=actor.platform_role or actor.role,
        old_state=old_state,
        new_state={
            "status": ticket.status,
            "priority": ticket.priority,
            "category": ticket.category,
            "assigned_to": str(ticket.assigned_to) if ticket.assigned_to else None,
            "version": ticket.version,
            "escalated_at": ticket.escalated_at.isoformat() if ticket.escalated_at else None,
        },
        change_diff={"reason": reason},
        is_sensitive=True,
    )


async def _admin_ticket(db: AsyncSession, scope: PlatformSupportScopeDependency, ticket_id: uuid.UUID) -> SupportTicket:
    async with TenantContextGuard.scoped(db, scope.organization_id):
        ticket = await db.scalar(
            select(SupportTicket).where(
                SupportTicket.id == ticket_id,
                SupportTicket.organization_id == scope.organization_id,
            )
        )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    return ticket


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_ticket(
    payload: TicketCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="User not attached to an organization")
    priority = _normalize(payload.priority, TICKET_PRIORITIES, "priority")
    now = datetime.now(timezone.utc)
    response_hours, resolution_hours = SLA_HOURS[priority]
    sla_capability = await resolve_org_operation(
        db,
        current_user.organization_id,
        "support.sla.apply",
        user_id=current_user.id,
    )
    dedicated_manager = await resolve_org_operation(
        db,
        current_user.organization_id,
        "support.dedicated_manager",
        user_id=current_user.id,
    )
    sla_tier = (
        str(sla_capability.get("value", "STANDARD")).upper()
        if sla_capability.get("enabled")
        else "STANDARD"
    )
    multiplier = SLA_TIER_MULTIPLIER.get(sla_tier, 1.0)
    response_hours = max(response_hours * multiplier, 0.25)
    resolution_hours = max(resolution_hours * multiplier, 1.0)
    ticket = SupportTicket(
        organization_id=current_user.organization_id,
        creator_id=current_user.id,
        subject=payload.subject.strip(),
        description=payload.content.strip(),
        priority=priority,
        category=payload.category.strip().upper(),
        status="OPEN",
        first_response_due_at=now + timedelta(hours=response_hours),
        resolution_due_at=now + timedelta(hours=resolution_hours),
    )
    db.add(ticket)
    await db.flush()
    db.add(TicketComment(ticket_id=ticket.id, author_id=current_user.id, content=payload.content.strip()))
    db.add(ActivityTimeline(
        organization_id=current_user.organization_id,
        actor_id=current_user.id,
        action_type="SUPPORT_TICKET_CREATED",
        metadata_data={
            "ticket_id": str(ticket.id),
            "subject": payload.subject,
            "sla_tier": sla_tier,
            "dedicated_manager_entitled": bool(dedicated_manager.get("enabled")),
        },
    ))
    await db.commit()
    return {
        "message": "Ticket created successfully",
        "ticket_id": ticket.id,
        "sla_tier": sla_tier,
        "dedicated_manager_entitled": bool(dedicated_manager.get("enabled")),
    }


@router.get("/admin", response_model=CursorPage[TicketResponse])
async def list_admin_tickets(
    support_scope: PlatformSupportScopeDependency,
    db: AsyncSession = Depends(get_db),
    ticket_status: str | None = Query(None, alias="status"),
    priority: str | None = Query(None),
    assigned_to: uuid.UUID | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    statement = select(SupportTicket).where(SupportTicket.organization_id == support_scope.organization_id)
    if ticket_status:
        statement = statement.where(SupportTicket.status == _normalize(ticket_status, TICKET_STATUSES, "status"))
    if priority:
        statement = statement.where(SupportTicket.priority == _normalize(priority, TICKET_PRIORITIES, "priority"))
    if assigned_to:
        statement = statement.where(SupportTicket.assigned_to == assigned_to)
    page = await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=SupportTicket.updated_at,
        id_column=SupportTicket.id,
        cursor=cursor,
        limit=limit,
        resource_type="support_tickets",
    )
    return CursorPage(
        items=[_ticket_response(ticket) for ticket in page.items],
        next_cursor=page.next_cursor,
        has_next=page.has_next,
    )


@router.get("/admin/{ticket_id}", response_model=TicketResponse)
async def get_admin_ticket(
    ticket_id: uuid.UUID,
    support_scope: PlatformSupportScopeDependency,
    db: AsyncSession = Depends(get_db),
):
    ticket = await _admin_ticket(db, support_scope, ticket_id)
    return _ticket_response(ticket)


@router.get("/admin/{ticket_id}/attachments", response_model=list[TicketAttachmentResponse])
async def list_admin_ticket_attachments(
    ticket_id: uuid.UUID,
    support_scope: PlatformSupportScopeDependency,
    db: AsyncSession = Depends(get_db),
):
    await _admin_ticket(db, support_scope, ticket_id)
    async with TenantContextGuard.scoped(db, support_scope.organization_id):
        rows = (await db.execute(
            select(TicketAttachment, Asset)
            .outerjoin(Asset, TicketAttachment.asset_id == Asset.id)
            .where(
                TicketAttachment.organization_id == support_scope.organization_id,
                TicketAttachment.ticket_id == ticket_id,
            )
            .order_by(TicketAttachment.created_at.desc())
        )).all()
    return [_attachment_out(attachment, asset) for attachment, asset in rows]


@router.post("/admin/{ticket_id}/attachments/upload-request", response_model=TicketAttachmentResponse, status_code=201)
async def request_admin_ticket_attachment_upload(
    ticket_id: uuid.UUID,
    payload: AttachmentUploadRequest,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
):
    del step_up
    if payload.mime_type not in ALLOWED_SUPPORT_MIME_TYPES:
        raise HTTPException(status_code=422, detail={"code": "UNSUPPORTED_ATTACHMENT_TYPE"})
    request_hash = hashlib.sha256(json.dumps(payload.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()
    async with TenantContextGuard.scoped(db, support_scope.organization_id):
        ticket = await _admin_ticket(db, support_scope, ticket_id)
        existing = await db.scalar(select(TicketAttachment).where(
            TicketAttachment.organization_id == support_scope.organization_id,
            TicketAttachment.ticket_id == ticket_id,
            TicketAttachment.idempotency_key == idempotency_key,
        ))
        if existing:
            if existing.request_hash != request_hash:
                raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
            asset = await db.get(Asset, existing.asset_id) if existing.asset_id else None
            if not asset:
                raise HTTPException(status_code=409, detail={"code": "ATTACHMENT_ASSET_MISSING"})
            upload = create_presigned_upload(bucket=settings.S3_BUCKET_ASSETS, storage_path=asset.file_path, content_type=asset.mime_type, max_size_bytes=asset.file_size_bytes)
            return _attachment_out(existing, asset, upload)

        safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", payload.file_name).strip(".-") or "attachment"
        asset_id = uuid.uuid4()
        storage_path = f"{support_scope.organization_id}/support/{ticket.id}/{asset_id}/{safe_name}"
        asset = Asset(
            id=asset_id,
            organization_id=support_scope.organization_id,
            name=payload.file_name,
            file_path=storage_path,
            file_size_bytes=payload.file_size_bytes,
            mime_type=payload.mime_type,
            processing_status="UPLOADING",
        )
        attachment = TicketAttachment(
            organization_id=support_scope.organization_id,
            ticket_id=ticket.id,
            asset_id=asset.id,
            uploaded_by=support_scope.actor.id,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
            file_path=storage_path,
            file_name=payload.file_name,
        )
        db.add_all([asset, AssetVersion(asset_id=asset.id, version_number=1, file_path=storage_path), attachment])
        await db.flush()
        db.add(_audit(ticket, support_scope.actor, "SUPPORT_ATTACHMENT_UPLOAD_REQUESTED", payload.reason))
        upload = create_presigned_upload(bucket=settings.S3_BUCKET_ASSETS, storage_path=storage_path, content_type=payload.mime_type, max_size_bytes=payload.file_size_bytes)
        await db.commit()
        return _attachment_out(attachment, asset, upload)


@router.post("/admin/{ticket_id}/attachments/{attachment_id}/complete", response_model=TicketAttachmentResponse)
async def complete_admin_ticket_attachment(
    ticket_id: uuid.UUID,
    attachment_id: uuid.UUID,
    payload: AttachmentCompletionRequest,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    db: AsyncSession = Depends(get_db),
):
    del step_up
    async with TenantContextGuard.scoped(db, support_scope.organization_id):
        ticket = await _admin_ticket(db, support_scope, ticket_id)
        row = (await db.execute(
            select(TicketAttachment, Asset)
            .join(Asset, TicketAttachment.asset_id == Asset.id)
            .where(
                TicketAttachment.id == attachment_id,
                TicketAttachment.ticket_id == ticket_id,
                TicketAttachment.organization_id == support_scope.organization_id,
            )
            .with_for_update()
        )).one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Attachment not found.")
        attachment, asset = row
        if asset.processing_status not in {"UPLOADING", "QUARANTINED", "SCAN_FAILED"}:
            raise HTTPException(status_code=409, detail={"code": "INVALID_FILE_STATE", "current_state": asset.processing_status})
        try:
            metadata = get_object_metadata(bucket=settings.S3_BUCKET_ASSETS, storage_path=asset.file_path)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=409, detail={"code": "UPLOAD_NOT_FOUND"}) from exc
        if metadata["size"] != asset.file_size_bytes:
            asset.processing_status = "SCAN_FAILED"
            await db.commit()
            raise HTTPException(status_code=409, detail={"code": "UPLOAD_SIZE_MISMATCH"})
        if metadata.get("content_type") and metadata["content_type"] != asset.mime_type:
            asset.processing_status = "SCAN_FAILED"
            await db.commit()
            raise HTTPException(status_code=409, detail={"code": "UPLOAD_CONTENT_TYPE_MISMATCH"})
        asset.processing_status = "QUARANTINED"
        existing_scan = await db.scalar(select(VirusScan).where(VirusScan.asset_id == asset.id, VirusScan.status == "pending"))
        if not existing_scan:
            db.add(VirusScan(asset_id=asset.id, status="pending"))
        db.add(_audit(ticket, support_scope.actor, "SUPPORT_ATTACHMENT_QUARANTINED", payload.reason))
        await db.commit()
    try:
        from workers.tasks.file_tasks import scan_file_for_viruses
        scan_file_for_viruses.delay(str(asset.id), str(support_scope.organization_id))
    except Exception as exc:
        logger.exception("Failed to queue malware scan for support attachment {}: {}", asset.id, exc)
    return _attachment_out(attachment, asset)


@router.get("/admin/{ticket_id}/attachments/{attachment_id}/download")
async def download_admin_ticket_attachment(
    ticket_id: uuid.UUID,
    attachment_id: uuid.UUID,
    support_scope: PlatformSupportScopeDependency,
    db: AsyncSession = Depends(get_db),
):
    async with TenantContextGuard.scoped(db, support_scope.organization_id):
        ticket = await _admin_ticket(db, support_scope, ticket_id)
        row = (await db.execute(
            select(TicketAttachment, Asset)
            .join(Asset, TicketAttachment.asset_id == Asset.id)
            .where(
                TicketAttachment.id == attachment_id,
                TicketAttachment.ticket_id == ticket_id,
                TicketAttachment.organization_id == support_scope.organization_id,
            )
        )).one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Attachment not found.")
        attachment, asset = row
        if asset.processing_status != "READY":
            raise HTTPException(status_code=409, detail={"code": "FILE_NOT_READY", "current_state": asset.processing_status})
        url = create_presigned_download(bucket=settings.S3_BUCKET_ASSETS, storage_path=asset.file_path, filename=attachment.file_name)
        db.add(_audit(ticket, support_scope.actor, "SUPPORT_ATTACHMENT_DOWNLOADED", support_scope.reason))
        await db.commit()
    return {"download_url": url, "expires_in": settings.S3_PRESIGNED_EXPIRY_SECONDS}


@router.patch("/admin/{ticket_id}", response_model=TicketResponse)
async def update_admin_ticket(
    ticket_id: uuid.UUID,
    payload: AdminTicketUpdateRequest,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    db: AsyncSession = Depends(get_db),
):
    del step_up
    async with TenantContextGuard.scoped(db, support_scope.organization_id):
        ticket = await _admin_ticket(db, support_scope, ticket_id)
        if ticket.version != payload.version:
            raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": ticket.version})
        old_state = {
            "status": ticket.status,
            "priority": ticket.priority,
            "category": ticket.category,
            "assigned_to": str(ticket.assigned_to) if ticket.assigned_to else None,
            "version": ticket.version,
        }
        now = datetime.now(timezone.utc)
        if payload.status:
            next_status = _normalize(payload.status, TICKET_STATUSES, "status")
            if next_status != ticket.status and next_status not in STATUS_TRANSITIONS.get(ticket.status, set()):
                raise HTTPException(status_code=409, detail={"code": "INVALID_STATUS_TRANSITION", "from": ticket.status, "to": next_status})
            ticket.status = next_status
            if next_status == "RESOLVED":
                ticket.resolved_at = now
            elif next_status == "CLOSED":
                ticket.closed_at = now
            elif next_status == "OPEN":
                ticket.resolved_at = None
                ticket.closed_at = None
        if payload.priority:
            ticket.priority = _normalize(payload.priority, TICKET_PRIORITIES, "priority")
        if payload.category:
            ticket.category = payload.category.strip().upper()
        if payload.assigned_to is not None:
            assignee = await db.scalar(select(User).where(User.id == payload.assigned_to, User.is_active.is_(True)))
            if not assignee or assignee.platform_role not in {"SUPER_ADMIN", "SUPPORT_ADMIN"}:
                raise HTTPException(status_code=422, detail={"code": "INVALID_SUPPORT_ASSIGNEE"})
            ticket.assigned_to = assignee.id
        if payload.escalate is True and ticket.escalated_at is None:
            ticket.escalated_at = now
        elif payload.escalate is False:
            ticket.escalated_at = None
        ticket.version += 1
        ticket.updated_at = now
        db.add(_audit(ticket, support_scope.actor, "SUPPORT_TICKET_UPDATED", payload.reason, old_state))
        await db.commit()
        await db.refresh(ticket)
    return _ticket_response(ticket)


@router.get("/admin/{ticket_id}/comments", response_model=list[TicketCommentResponse])
async def get_admin_ticket_comments(
    ticket_id: uuid.UUID,
    support_scope: PlatformSupportScopeDependency,
    db: AsyncSession = Depends(get_db),
):
    await _admin_ticket(db, support_scope, ticket_id)
    async with TenantContextGuard.scoped(db, support_scope.organization_id):
        rows = (
            await db.execute(
                select(TicketComment, User.email, User.first_name, User.last_name)
                .join(User, TicketComment.author_id == User.id)
                .where(TicketComment.ticket_id == ticket_id)
                .order_by(TicketComment.created_at.asc())
            )
        ).all()
    return [TicketCommentResponse(
        id=comment.id,
        ticket_id=comment.ticket_id,
        author_id=comment.author_id,
        author_email=email,
        author_name=f"{first_name} {last_name}".strip() or email,
        content=comment.content,
        is_internal=comment.is_internal,
        created_at=comment.created_at,
    ) for comment, email, first_name, last_name in rows]


@router.post("/admin/{ticket_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_admin_ticket_comment(
    ticket_id: uuid.UUID,
    payload: AdminTicketCommentRequest,
    support_scope: PlatformSupportScopeDependency,
    db: AsyncSession = Depends(get_db),
):
    async with TenantContextGuard.scoped(db, support_scope.organization_id):
        ticket = await _admin_ticket(db, support_scope, ticket_id)
        comment = TicketComment(
            ticket_id=ticket.id,
            author_id=support_scope.actor.id,
            content=payload.content.strip(),
            is_internal=payload.is_internal,
        )
        db.add(comment)
        now = datetime.now(timezone.utc)
        if not payload.is_internal and ticket.first_responded_at is None:
            ticket.first_responded_at = now
        if not payload.is_internal and ticket.status == "OPEN":
            ticket.status = "IN_PROGRESS"
        ticket.version += 1
        ticket.updated_at = now
        db.add(_audit(ticket, support_scope.actor, "SUPPORT_INTERNAL_NOTE_ADDED" if payload.is_internal else "SUPPORT_REPLY_ADDED", support_scope.reason))
        await db.commit()
    return {"message": "Internal note added." if payload.is_internal else "Reply added."}


@router.get("")
async def list_tickets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    statement = select(SupportTicket).where(SupportTicket.organization_id == current_user.organization_id).order_by(SupportTicket.updated_at.desc())
    rows = (await db.execute(statement)).scalars().all()
    return [_ticket_response(ticket).model_dump() for ticket in rows]


@router.get("/{ticket_id}/comments", response_model=list[TicketCommentResponse])
async def get_ticket_comments(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = await db.scalar(select(SupportTicket).where(SupportTicket.id == ticket_id, SupportTicket.organization_id == current_user.organization_id))
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    rows = (
        await db.execute(
            select(TicketComment, User.email, User.first_name, User.last_name)
            .join(User, TicketComment.author_id == User.id)
            .where(TicketComment.ticket_id == ticket_id, TicketComment.is_internal.is_(False))
            .order_by(TicketComment.created_at.asc())
        )
    ).all()
    return [TicketCommentResponse(
        id=comment.id,
        ticket_id=comment.ticket_id,
        author_id=comment.author_id,
        author_email=email,
        author_name=f"{first_name} {last_name}".strip() or email,
        content=comment.content,
        is_internal=False,
        created_at=comment.created_at,
    ) for comment, email, first_name, last_name in rows]


@router.post("/{ticket_id}/comments")
async def add_ticket_comment(
    ticket_id: uuid.UUID,
    payload: TicketCommentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = await db.scalar(select(SupportTicket).where(SupportTicket.id == ticket_id, SupportTicket.organization_id == current_user.organization_id))
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    db.add(TicketComment(ticket_id=ticket.id, author_id=current_user.id, content=payload.content.strip()))
    if ticket.status == "WAITING_ON_CUSTOMER":
        ticket.status = "IN_PROGRESS"
    ticket.version += 1
    ticket.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Comment added successfully"}
