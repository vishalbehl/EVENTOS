"""Transaction-owning commands for platform support tickets."""

from __future__ import annotations

import asyncio
import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException

from app.config import settings
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.subscription import ActivityTimeline
from app.modules.files.models.file import Asset, AssetVersion, VirusScan
from app.modules.identity.models.user import User
from app.modules.presentations.services.upload_service import create_presigned_upload, get_object_metadata
from app.modules.support.models.support_domain_tables import TicketAttachment
from app.modules.support.models.ticket import SupportTicket, TicketComment

TICKET_STATUSES = {"OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"}
TICKET_PRIORITIES = {"LOW", "NORMAL", "MEDIUM", "HIGH", "CRITICAL"}
STATUS_TRANSITIONS = {
    "OPEN": {"IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"},
    "IN_PROGRESS": {"OPEN", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"},
    "WAITING_ON_CUSTOMER": {"OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"},
    "RESOLVED": {"OPEN", "CLOSED"},
    "CLOSED": {"OPEN"},
}


class SupportTicketCommandService:
    """Create support tickets and their initial activity atomically."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, *, payload: dict, actor, sla_tier: str, dedicated_manager_entitled: bool) -> SupportTicket:
        now = datetime.now(timezone.utc)
        response_hours, resolution_hours = payload["sla_hours"]
        ticket = SupportTicket(
            organization_id=actor.organization_id,
            creator_id=actor.id,
            subject=payload["subject"].strip(),
            description=payload["content"].strip(),
            priority=payload["priority"],
            category=payload["category"].strip().upper(),
            status="OPEN",
            first_response_due_at=now + timedelta(hours=response_hours),
            resolution_due_at=now + timedelta(hours=resolution_hours),
        )
        try:
            self.db.add(ticket)
            await self.db.flush()
            self.db.add(TicketComment(ticket_id=ticket.id, author_id=actor.id, content=payload["content"].strip()))
            self.db.add(ActivityTimeline(
                organization_id=actor.organization_id,
                actor_id=actor.id,
                action_type="SUPPORT_TICKET_CREATED",
                metadata_data={
                    "ticket_id": str(ticket.id),
                    "subject": payload["subject"],
                    "sla_tier": sla_tier,
                    "dedicated_manager_entitled": dedicated_manager_entitled,
                },
            ))
            await self.db.commit()
            await self.db.refresh(ticket)
            return ticket
        except Exception:
            await self.db.rollback()
            raise

    async def update(self, *, ticket_id, organization_id, actor, payload: dict) -> SupportTicket:
        try:
            ticket = await self.db.scalar(
                select(SupportTicket).where(
                    SupportTicket.id == ticket_id,
                    SupportTicket.organization_id == organization_id,
                ).with_for_update()
            )
            if ticket is None:
                raise HTTPException(status_code=404, detail="Ticket not found.")
            if ticket.version != payload["version"]:
                raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": ticket.version})
            old_state = {
                "status": ticket.status,
                "priority": ticket.priority,
                "category": ticket.category,
                "assigned_to": str(ticket.assigned_to) if ticket.assigned_to else None,
                "version": ticket.version,
            }
            now = datetime.now(timezone.utc)
            next_status = payload.get("status")
            if next_status:
                if next_status not in TICKET_STATUSES:
                    raise HTTPException(status_code=422, detail={"code": "INVALID_STATUS", "allowed": sorted(TICKET_STATUSES)})
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
            priority = payload.get("priority")
            if priority:
                if priority not in TICKET_PRIORITIES:
                    raise HTTPException(status_code=422, detail={"code": "INVALID_PRIORITY", "allowed": sorted(TICKET_PRIORITIES)})
                ticket.priority = priority
            if payload.get("category"):
                ticket.category = payload["category"].strip().upper()
            if payload.get("assigned_to") is not None:
                assignee = await self.db.scalar(select(User).where(User.id == payload["assigned_to"], User.is_active.is_(True)))
                if not assignee or assignee.platform_role not in {"SUPER_ADMIN", "SUPPORT_ADMIN"}:
                    raise HTTPException(status_code=422, detail={"code": "INVALID_SUPPORT_ASSIGNEE"})
                ticket.assigned_to = assignee.id
            if payload.get("escalate") is True and ticket.escalated_at is None:
                ticket.escalated_at = now
            elif payload.get("escalate") is False:
                ticket.escalated_at = None
            ticket.version = int(ticket.version or 1) + 1
            ticket.updated_at = now
            self.db.add(AuditLog(
                organization_id=organization_id,
                actor_user_id=actor.id,
                resource_type="support_ticket",
                resource_id=ticket.id,
                action_type="SUPPORT_TICKET_UPDATED",
                actor_role=actor.platform_role or actor.role,
                old_state=old_state,
                new_state={"status": ticket.status, "priority": ticket.priority, "category": ticket.category, "version": ticket.version},
                change_diff={"reason": payload["reason"]},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(ticket)
            return ticket
        except Exception:
            await self.db.rollback()
            raise

    async def add_comment(self, *, ticket_id, organization_id, actor, content: str, is_internal: bool = False, reason: str | None = None, reopen_waiting: bool = False) -> str:
        try:
            ticket = await self.db.scalar(
                select(SupportTicket).where(
                    SupportTicket.id == ticket_id,
                    SupportTicket.organization_id == organization_id,
                ).with_for_update()
            )
            if ticket is None:
                raise HTTPException(status_code=404, detail="Ticket not found")
            self.db.add(TicketComment(ticket_id=ticket.id, author_id=actor.id, content=content.strip(), is_internal=is_internal))
            now = datetime.now(timezone.utc)
            if not is_internal and ticket.first_responded_at is None:
                ticket.first_responded_at = now
            if not is_internal and ticket.status == "OPEN":
                ticket.status = "IN_PROGRESS"
            elif not is_internal and reopen_waiting and ticket.status == "WAITING_ON_CUSTOMER":
                ticket.status = "IN_PROGRESS"
            ticket.version = int(ticket.version or 1) + 1
            ticket.updated_at = now
            if reason is not None:
                self.db.add(AuditLog(
                    organization_id=organization_id,
                    actor_user_id=actor.id,
                    resource_type="support_ticket",
                    resource_id=ticket.id,
                    action_type="SUPPORT_INTERNAL_NOTE_ADDED" if is_internal else "SUPPORT_REPLY_ADDED",
                    actor_role=actor.platform_role or actor.role,
                    new_state={"status": ticket.status, "version": ticket.version},
                    change_diff={"reason": reason or "support note"},
                    is_sensitive=True,
                ))
            await self.db.commit()
            return "Internal note added." if is_internal else "Reply added."
        except Exception:
            await self.db.rollback()
            raise

    async def complete_attachment(self, *, ticket_id, attachment_id, organization_id, actor, reason: str) -> tuple[TicketAttachment, Asset]:
        try:
            row = (await self.db.execute(
                select(TicketAttachment, Asset)
                .join(Asset, TicketAttachment.asset_id == Asset.id)
                .where(
                    TicketAttachment.id == attachment_id,
                    TicketAttachment.ticket_id == ticket_id,
                    TicketAttachment.organization_id == organization_id,
                )
                .with_for_update()
            )).one_or_none()
            if row is None:
                raise HTTPException(status_code=404, detail="Attachment not found.")
            attachment, asset = row
            if asset.processing_status not in {"UPLOADING", "QUARANTINED", "SCAN_FAILED"}:
                raise HTTPException(status_code=409, detail={"code": "INVALID_FILE_STATE", "current_state": asset.processing_status})
            try:
                metadata = await asyncio.to_thread(get_object_metadata, bucket=settings.S3_BUCKET_ASSETS, storage_path=asset.file_path)
            except FileNotFoundError as exc:
                raise HTTPException(status_code=409, detail={"code": "UPLOAD_NOT_FOUND"}) from exc
            if metadata["size"] != asset.file_size_bytes:
                asset.processing_status = "SCAN_FAILED"
                await self.db.commit()
                raise HTTPException(status_code=409, detail={"code": "UPLOAD_SIZE_MISMATCH"})
            if metadata.get("content_type") and metadata["content_type"] != asset.mime_type:
                asset.processing_status = "SCAN_FAILED"
                await self.db.commit()
                raise HTTPException(status_code=409, detail={"code": "UPLOAD_CONTENT_TYPE_MISMATCH"})
            asset.processing_status = "QUARANTINED"
            existing_scan = await self.db.scalar(select(VirusScan).where(VirusScan.asset_id == asset.id, VirusScan.status == "pending"))
            if existing_scan is None:
                self.db.add(VirusScan(asset_id=asset.id, status="pending"))
            self.db.add(AuditLog(
                organization_id=organization_id,
                actor_user_id=actor.id,
                resource_type="support_ticket",
                resource_id=ticket_id,
                action_type="SUPPORT_ATTACHMENT_QUARANTINED",
                actor_role=actor.platform_role or actor.role,
                change_diff={"reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

        try:
            from workers.tasks.file_tasks import scan_file_for_viruses
            scan_file_for_viruses.delay(str(asset.id), str(organization_id))
        except Exception:
            # The durable pending scan remains retryable if the worker broker is unavailable.
            pass
        return attachment, asset

    async def request_attachment_upload(self, *, ticket_id, organization_id, actor, payload: dict, idempotency_key: str, request_hash: str) -> tuple[TicketAttachment, Asset, dict]:
        try:
            ticket = await self.db.scalar(select(SupportTicket).where(
                SupportTicket.id == ticket_id,
                SupportTicket.organization_id == organization_id,
            ).with_for_update())
            if ticket is None:
                raise HTTPException(status_code=404, detail="Ticket not found.")
            existing = await self.db.scalar(select(TicketAttachment).where(
                TicketAttachment.organization_id == organization_id,
                TicketAttachment.ticket_id == ticket_id,
                TicketAttachment.idempotency_key == idempotency_key,
            ))
            if existing is not None:
                if existing.request_hash != request_hash:
                    raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
                asset = await self.db.get(Asset, existing.asset_id) if existing.asset_id else None
                if asset is None:
                    raise HTTPException(status_code=409, detail={"code": "ATTACHMENT_ASSET_MISSING"})
                upload = await asyncio.to_thread(create_presigned_upload, bucket=settings.S3_BUCKET_ASSETS, storage_path=asset.file_path, content_type=asset.mime_type, max_size_bytes=asset.file_size_bytes)
                return existing, asset, upload

            safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", payload["file_name"]).strip(".-") or "attachment"
            asset_id = uuid.uuid4()
            storage_path = f"{organization_id}/support/{ticket.id}/{asset_id}/{safe_name}"
            asset = Asset(
                id=asset_id,
                organization_id=organization_id,
                name=payload["file_name"],
                file_path=storage_path,
                file_size_bytes=payload["file_size_bytes"],
                mime_type=payload["mime_type"],
                processing_status="UPLOADING",
            )
            attachment = TicketAttachment(
                organization_id=organization_id,
                ticket_id=ticket.id,
                asset_id=asset.id,
                uploaded_by=actor.id,
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                file_path=storage_path,
                file_name=payload["file_name"],
            )
            self.db.add_all([asset, AssetVersion(asset_id=asset.id, version_number=1, file_path=storage_path), attachment])
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id,
                actor_user_id=actor.id,
                resource_type="support_ticket",
                resource_id=ticket.id,
                action_type="SUPPORT_ATTACHMENT_UPLOAD_REQUESTED",
                actor_role=actor.platform_role or actor.role,
                change_diff={"reason": payload["reason"]},
                is_sensitive=True,
            ))
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

        upload = await asyncio.to_thread(create_presigned_upload, bucket=settings.S3_BUCKET_ASSETS, storage_path=storage_path, content_type=payload["mime_type"], max_size_bytes=payload["file_size_bytes"])
        return attachment, asset, upload
