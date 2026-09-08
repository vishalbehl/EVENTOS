"""Transaction-owning commands for technology service requests."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_service
from app.core.cache import invalidate_event
from app.modules.events.models.event import Event
from app.modules.technology_services.models import ServiceRequest, ServiceRequestItem, ServiceRequestComment, ServiceRequestEventSnapshot, ServiceRequestAttachment
from app.modules.files.models.file import DurableUpload
from app.core.idempotency_service import complete_idempotent
from app.core.concurrency import raise_version_conflict
from app.modules.technology_services.recommendations import event_facts
from app.modules.technology_services.events import dispatch_staged_event, stage_event


class TechnologyServiceCommandService:
    """Own service-request mutations while keeping routers HTTP-oriented only."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def complete_idempotent(self, record, *, response_status: int, response_body: dict, resource_id=None) -> None:
        await complete_idempotent(self.db, record, response_status=response_status, response_body=response_body, resource_id=resource_id)
        await self.db.commit()

    async def record_recommendation_snapshot(self, *, event_id: uuid.UUID, organization_id: uuid.UUID, facts: dict[str, Any], overrides: dict[str, Any]) -> None:
        request = await self.db.scalar(select(ServiceRequest).where(ServiceRequest.event_id == event_id, ServiceRequest.organization_id == organization_id).order_by(ServiceRequest.id.desc()).limit(1))
        if request is None:
            return
        run_number = int(await self.db.scalar(select(func.count(ServiceRequestEventSnapshot.id)).where(ServiceRequestEventSnapshot.request_id == request.id)) or 0) + 1
        self.db.add(ServiceRequestEventSnapshot(request_id=request.id, event_id=event_id, run_number=run_number, facts=facts, overrides=overrides))
        await self.db.commit()
        await cache_service.invalidate_domain("venue_ops_recommendations", organization_id, event_id)
        await invalidate_event(organization_id, event_id)

    async def attach_upload(self, *, request_id: uuid.UUID, organization_id: uuid.UUID, user, upload_id: uuid.UUID) -> ServiceRequestAttachment:
        request = await self.db.scalar(select(ServiceRequest).where(ServiceRequest.id == request_id, ServiceRequest.organization_id == organization_id).with_for_update())
        upload = await self.db.scalar(select(DurableUpload).where(DurableUpload.id == upload_id, DurableUpload.organization_id == organization_id))
        if request is None or upload is None or upload.event_id != request.event_id:
            raise HTTPException(status_code=404, detail="Request or upload not found.")
        if upload.status not in {"ready", "uploaded", "processing", "scanning", "verifying"}:
            raise HTTPException(status_code=409, detail={"code": "UPLOAD_NOT_ATTACHABLE", "status": upload.status})
        attachment = ServiceRequestAttachment(request_id=request.id, uploaded_by=user.id, file_name=upload.original_filename, storage_key=upload.object_key, content_type=upload.mime_type, size_bytes=upload.size_bytes)
        self.db.add(attachment)
        request.version = int(request.version or 1) + 1
        outbox = stage_event(self.db, event_id=request.event_id, name="venue_ops.request.updated", payload={"event_id": str(request.event_id), "request_id": str(request.id), "entity_version": request.version, "status": request.status, "attachment_id": str(attachment.id)})
        await self.db.commit()
        await cache_service.invalidate_domain("venue_ops_recommendations", request.organization_id, request.event_id)
        await invalidate_event(request.organization_id, request.event_id)
        await self.db.refresh(attachment)
        await self.db.refresh(outbox)
        await dispatch_staged_event(self.db, outbox)
        return attachment

    async def _event_for_user(self, *, event_id: uuid.UUID, user) -> Event:
        event = await self.db.scalar(
            select(Event)
            .where(Event.id == event_id, Event.deleted_at.is_(None))
            .execution_options(skip_tenant_filter=True)
        )
        platform_admin = (
            getattr(user, "role", None) == "super_admin"
            or getattr(user, "platform_role", None) == "SUPER_ADMIN"
            or getattr(user, "is_platform_admin", False)
        )
        if event is None or (
            getattr(user, "organization_id", None) != event.organization_id
            and not platform_admin
        ):
            raise HTTPException(status_code=404, detail="Event not found.")
        return event

    async def create(
        self,
        *,
        event_id: uuid.UUID,
        user,
        title: str,
        description: str | None,
        priority: str,
        request_type: str,
        items: list[dict[str, Any]],
        planning_overrides: dict[str, Any] | None = None,
    ) -> ServiceRequest:
        event = await self._event_for_user(event_id=event_id, user=user)
        facts = await event_facts(self.db, event)
        row = ServiceRequest(
            organization_id=event.organization_id,
            event_id=event.id,
            request_number=f"SR-{uuid.uuid4().hex[:10].upper()}",
            title=title,
            description=description,
            status="DRAFT",
            priority=priority,
            request_type=request_type,
            requested_by=user.id,
            version=1,
            event_snapshot=facts,
            planning_overrides=planning_overrides or {},
        )
        try:
            self.db.add(row)
            await self.db.flush()
            self.db.add(ServiceRequestEventSnapshot(request_id=row.id, event_id=row.event_id, run_number=1, facts=facts, overrides=planning_overrides or {}))
            for item in items:
                self.db.add(
                    ServiceRequestItem(
                        request_id=row.id,
                        description=str(item.get("notes") or item.get("description") or item.get("service_id") or item.get("requirement_type") or "Service item"),
                        quantity=max(1, int(item.get("quantity", 1))),
                        service_definition_id=uuid.UUID(str(item["service_definition_id"])) if item.get("service_definition_id") else None,
                        template_type=item.get("template_type"),
                        template_id=uuid.UUID(str(item["template_id"])) if item.get("template_id") else None,
                        template_version=item.get("template_version"),
                        source=str(item.get("source", "ORGANISER_ADDED")),
                        duration_days=max(1, int(item.get("duration_days", 1))),
                        room_scope=item.get("room_scope") or [],
                        configuration=item.get("configuration") or item.get("requirement_data") or {},
                        notes=item.get("notes"),
                        included_scope=item.get("included_scope") or [],
                        excluded_scope=item.get("excluded_scope") or [],
                    )
                )
            outbox = stage_event(self.db, event_id=row.event_id, name="venue_ops.request.created", payload={"event_id": str(row.event_id), "request_id": str(row.id), "entity_version": row.version, "status": row.status})
            await self.db.commit()
            await invalidate_event(event.organization_id, event.id)
            await cache_service.invalidate_domain("venue_ops_recommendations", event.organization_id, event.id)
            await self.db.refresh(row)
            await self.db.refresh(outbox)
            await dispatch_staged_event(self.db, outbox)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def transition(
        self, *, request_id: uuid.UUID, target: str, organization_id: uuid.UUID, expected_version: int | None = None, actor_id: uuid.UUID | None = None
    ) -> ServiceRequest:
        try:
            row = await self.db.scalar(
                select(ServiceRequest)
                .where(
                    ServiceRequest.id == request_id,
                    ServiceRequest.organization_id == organization_id,
                )
                .with_for_update()
            )
            if row is None:
                raise HTTPException(status_code=404, detail="Service request not found.")
            if expected_version is not None and row.version != expected_version:
                raise_version_conflict(row.version)
            row.status = target
            row.version = int(row.version or 1) + 1
            if target == "SUBMITTED":
                row.submitted_at = datetime.now(timezone.utc)
                row.submitted_by = actor_id
            outbox = stage_event(self.db, event_id=row.event_id, name="venue_ops.request.submitted" if target == "SUBMITTED" else "venue_ops.request.updated", payload={"event_id": str(row.event_id), "request_id": str(row.id), "entity_version": row.version, "status": row.status})
            await self.db.commit()
            await cache_service.invalidate_domain("venue_ops_recommendations", row.organization_id, row.event_id)
            await invalidate_event(row.organization_id, row.event_id)
            await self.db.refresh(row)
            await self.db.refresh(outbox)
            await dispatch_staged_event(self.db, outbox)
            return row
        except HTTPException:
            raise
        except Exception:
            await self.db.rollback()
            raise

    async def save_draft(self, *, request_id: uuid.UUID, organization_id: uuid.UUID, user, items: list[dict[str, Any]], overrides: dict[str, Any] | None = None, description: str | None = None, expected_version: int | None = None) -> ServiceRequest:
        row = await self.db.scalar(select(ServiceRequest).where(ServiceRequest.id == request_id, ServiceRequest.organization_id == organization_id).with_for_update())
        if row is None: raise HTTPException(status_code=404, detail="Service request not found.")
        if row.status not in {"DRAFT", "REVISION_REQUESTED"}: raise HTTPException(status_code=409, detail="REQUEST_NOT_EDITABLE")
        if expected_version is not None and row.version != expected_version: raise_version_conflict(row.version)
        row.description = description if description is not None else row.description
        row.planning_overrides = overrides or row.planning_overrides or {}
        event = await self.db.scalar(select(Event).where(Event.id == row.event_id).execution_options(skip_tenant_filter=True))
        facts = await event_facts(self.db, event)
        row.event_snapshot = facts
        row.version = int(row.version or 1) + 1
        await self.db.execute(delete(ServiceRequestItem).where(ServiceRequestItem.request_id == row.id))
        snapshot_count = await self.db.scalar(select(func.count(ServiceRequestEventSnapshot.id)).where(ServiceRequestEventSnapshot.request_id == row.id)) or 0
        self.db.add(ServiceRequestEventSnapshot(request_id=row.id, event_id=row.event_id, run_number=int(snapshot_count) + 1, facts=facts, overrides=overrides or row.planning_overrides or {}))
        for item in items:
            self.db.add(ServiceRequestItem(request_id=row.id, description=str(item.get("description") or item.get("name") or item.get("requirement_type") or "Service item"), quantity=max(1, int(item.get("quantity", 1))), service_definition_id=uuid.UUID(str(item["service_definition_id"])) if item.get("service_definition_id") else None, template_type=item.get("template_type"), template_id=uuid.UUID(str(item["template_id"])) if item.get("template_id") else None, template_version=item.get("template_version"), source=str(item.get("source", "ORGANISER_ADDED")), duration_days=max(1, int(item.get("duration_days", 1))), room_scope=item.get("room_scope") or [], configuration=item.get("configuration") or item.get("requirement_data") or {}, notes=item.get("notes"), included_scope=item.get("included_scope") or [], excluded_scope=item.get("excluded_scope") or []))
        outbox = stage_event(self.db, event_id=row.event_id, name="venue_ops.request.updated", payload={"event_id": str(row.event_id), "request_id": str(row.id), "entity_version": row.version, "status": row.status})
        await self.db.commit()
        await cache_service.invalidate_domain("venue_ops_recommendations", row.organization_id, row.event_id)
        await invalidate_event(row.organization_id, row.event_id)
        await self.db.refresh(row)
        await self.db.refresh(outbox)
        await dispatch_staged_event(self.db, outbox)
        return row

    async def add_comment(self, *, request_id: uuid.UUID, organization_id: uuid.UUID, user, body: str) -> ServiceRequestComment:
        row = await self.db.scalar(select(ServiceRequest).where(ServiceRequest.id == request_id, ServiceRequest.organization_id == organization_id))
        if row is None: raise HTTPException(status_code=404, detail="Service request not found.")
        comment = ServiceRequestComment(request_id=row.id, author_id=user.id, author_type="COMMAND_CENTER" if getattr(user, "role", "") == "super_admin" else "ORGANISER", body=body)
        row.version = int(row.version or 1) + 1
        self.db.add(comment)
        outbox = stage_event(self.db, event_id=row.event_id, name="venue_ops.clarification.created", payload={"event_id": str(row.event_id), "request_id": str(row.id), "entity_version": row.version, "comment_id": str(comment.id)})
        await self.db.commit()
        await cache_service.invalidate_domain("venue_ops_recommendations", row.organization_id, row.event_id)
        await invalidate_event(row.organization_id, row.event_id)
        await dispatch_staged_event(self.db, outbox)
        return comment
