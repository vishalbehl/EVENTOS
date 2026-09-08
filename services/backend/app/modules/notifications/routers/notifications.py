# backend/app/routers/notifications.py
from __future__ import annotations

import asyncio
import csv
import hashlib
import hmac
import io
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, update, delete, or_, func, nullslast
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, get_current_event, CurrentEvent
from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.communications.models.email_template import EmailTemplate
from app.modules.communications.models.email_log import EmailLog
from app.modules.events.models.speaker import Speaker
from app.modules.identity.models.user import User
from app.modules.notifications.schemas.notification import (
    EmailTemplateCreate, EmailTemplateUpdate, EmailTemplateResponse,
    EmailComponentCreate, EmailComponentUpdate, EmailComponentResponse,
    CampaignCreate, CampaignUpdate, CampaignResponse, InviteSpeakersRequest,
    SendToSpeakersRequest,
    PaginatedEmailLogResponse, TestTemplateRequest, EmailLogResponse
)
from app.modules.communications.models.email_component import EmailComponent
from app.schemas.common import MessageResponse
from app.modules.speakers.schemas.speaker import SpeakerSummary
from app.services import email_service, upload_service
from app.modules.analytics.services.analytics_service import get_event_email_analytics
from app.config import settings
from app.core.dependencies.feature_gate import enforce_event_feature, enforce_event_operation, require_event_feature, require_event_operation
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.audit.services.audit_service import AuditContext, AuditService
from app.modules.communications.models.channel_delivery import (
    CommunicationDelivery,
    CommunicationDeliveryBatch,
)
from app.modules.notifications.services.channel_delivery_service import (
    ChannelDeliveryService,
    batch_response,
)
from app.modules.notifications.application.queries import (
    CommunicationDeliveryQueryService,
    EmailLogQueryService,
    EmailCampaignQueryService,
    NotificationConfigurationQueryService,
    EmailComponentQueryService,
)
from app.schemas.cursor_pagination import CursorPage
from app.core.concurrency import require_if_match
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.notifications.tasks.channel_delivery_tasks import (
    dispatch_communication_batch,
)
from app.modules.platform.models.organization_console import (
    OrganizationNotificationChannelConfig,
)
from app.modules.events.services.event_template_mutation_service import (
    EventTemplateMutationService,
)
from app.modules.events.services.event_campaign_mutation_service import (
    EventCampaignMutationService,
)

router = APIRouter(prefix="/events/{event_id}/notifications", tags=["notifications"])


class ProviderDeliveryRequest(BaseModel):
    recipients: List[str] = Field(min_length=1, max_length=200)
    title: Optional[str] = Field(default=None, max_length=255)
    body: str = Field(min_length=1, max_length=4096)
    data: dict[str, Any] = Field(default_factory=dict)
    reason: str = Field(min_length=5, max_length=1000)
    case_reference: Optional[str] = Field(default=None, max_length=160)


@router.get("/provider-status")
async def provider_channel_status(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    """Return the selected organization's non-secret provider readiness."""
    rows = await NotificationConfigurationQueryService(db).list_channels(
        organization_id=event.organization_id
    )
    by_channel = {row.channel: row for row in rows}
    return {
        "event_id": event.id,
        "organization_id": event.organization_id,
        "channels": {
            channel: {
                "configured": channel in by_channel,
                "provider": by_channel[channel].provider
                if channel in by_channel
                else None,
                "state": by_channel[channel].state
                if channel in by_channel
                else "UNAVAILABLE",
                "verified_at": by_channel[channel].last_verified_at
                if channel in by_channel
                else None,
                "available": bool(
                    channel in by_channel
                    and by_channel[channel].state == "ACTIVE"
                    and by_channel[channel].last_verified_at
                ),
            }
            for channel in ("SMS", "WHATSAPP", "PUSH")
        },
        "freshness_at": datetime.now(timezone.utc),
    }


@router.post(
    "/channels/{channel}/deliveries",
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_provider_delivery(
    channel: Literal["SMS", "WHATSAPP", "PUSH"],
    payload: ProviderDeliveryRequest,
    event: CurrentEvent,
    idempotency_key: str = Header(
        ..., alias="Idempotency-Key", min_length=8, max_length=200
    ),
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """provider_delivery_mutations: queue a quota-reserved provider batch."""
    if channel == "SMS":
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "communications.sms.send",
            user_id=actor.id,
        )
    elif channel == "WHATSAPP":
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "communications.whatsapp.send",
            user_id=actor.id,
        )
    else:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "communications.push.send",
            user_id=actor.id,
        )
    batch, replayed = await ChannelDeliveryService.create_batch(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        channel=channel,
        recipients=payload.recipients,
        title=payload.title,
        body=payload.body,
        data=payload.data,
        reason=payload.reason,
        case_reference=payload.case_reference,
        idempotency_key=idempotency_key,
        actor_user_id=actor.id,
    )
    if not replayed:
        await AuditService.write_log_sync(
            AuditContext(
                action_type=f"{channel}_DELIVERY_BATCH_QUEUED",
                resource_type="communication_delivery_batch",
                resource_id=batch.id,
                actor_user_id=actor.id,
                organization_id=event.organization_id,
                actor_role=getattr(actor, "role", None),
                new_state={
                    "event_id": str(event.id),
                    "channel": channel,
                    "provider": batch.provider,
                    "requested_count": batch.requested_count,
                    "reason": payload.reason,
                    "case_reference": payload.case_reference,
                    "idempotency_key": idempotency_key,
                },
                is_sensitive=True,
            ),
            db,
        )
        await db.commit()
    deliveries = (
        await db.scalars(
            select(CommunicationDelivery).where(
                CommunicationDelivery.batch_id == batch.id,
                CommunicationDelivery.organization_id
                == event.organization_id,
                CommunicationDelivery.event_id == event.id,
            )
        )
    ).all()
    if batch.status in {"QUEUED", "RETRY_PENDING"}:
        try:
            dispatch_communication_batch.delay(
                str(batch.id), str(event.organization_id)
            )
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "DELIVERY_QUEUE_UNAVAILABLE",
                    "batch_id": str(batch.id),
                },
            ) from exc
    return {**batch_response(batch, list(deliveries)), "replayed": replayed}


@router.get("/channels/{channel}/deliveries")
async def list_provider_deliveries(
    channel: Literal["SMS", "WHATSAPP", "PUSH"],
    event: CurrentEvent,
    cursor: Optional[uuid.UUID] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if channel == "SMS":
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "communications.sms.send",
            user_id=actor.id,
        )
    elif channel == "WHATSAPP":
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "communications.whatsapp.send",
            user_id=actor.id,
        )
    else:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "communications.push.send",
            user_id=actor.id,
        )
    rows, has_more, cursor_valid = await CommunicationDeliveryQueryService(db).list_batches(
        organization_id=event.organization_id,
        event_id=event.id,
        channel=channel,
        cursor=cursor,
        limit=limit,
    )
    if not cursor_valid:
        raise HTTPException(status_code=404, detail="Cursor not found.")
    page = rows[:limit]
    return {
        "items": [batch_response(row) for row in page],
        "next_cursor": page[-1].id if has_more and page else None,
    }


@router.post("/test-template", response_model=MessageResponse)
async def test_template(
    event: CurrentEvent,
    data: TestTemplateRequest,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a test email using a template and dummy data."""
    await enforce_event_operation(db, event.organization_id, event.id, "communications.email.send", user_id=actor.id)
    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.id == data.template_id,
            or_(
                (EmailTemplate.scope_type == "EVENT") & (EmailTemplate.event_id == event.id),
                (EmailTemplate.scope_type == "ORGANIZATION") & (EmailTemplate.organization_id == event.organization_id),
                EmailTemplate.scope_type == "PLATFORM",
            ),
            EmailTemplate.deleted_at.is_(None),
        ).execution_options(skip_tenant_filter=True)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Use dummy data for testing
    from app.modules.notifications.services.email_service import build_speaker_variables, build_participant_variables, render_template, send_email
    
    if getattr(template, "target_type", "speaker") == "participant":
        class MockParticipant:
            def __init__(self):
                self.name = "Sarah Chen"
                self.email = data.to_email
                self.phone = "+1 555-0199"
                self.regno = "DEL-0001"
                self.role = "Delegate"
                self.company = "MIT"
                self.designation = "Researcher"
                self.country = "USA"
                self.paid_status = "Paid"
        variables = build_participant_variables(MockParticipant(), event)
    else:
        # Create a mock speaker
        class MockSpeaker:
            def __init__(self):
                self.first_name = "Sarah"
                self.last_name = "Chen"
                self.email = data.to_email
                self.upload_token = "test-token"
                self.affiliation = "MIT"
                self.country = "USA"
                self.event_id = event.id
                self.id = uuid.uuid4()
                
                class MockSession:
                    name = "Quantum Computing Summit"
                    
                class MockSessionSpeaker:
                    session = MockSession()
                    
                class MockFile:
                    original_filename = "quantum_key_distribution_v2.pptx"
                    file_size_bytes = 12428800  # 11.85 MB
                    upload_status = "rejected"
                    rejection_reason = "The slide aspect ratio must be 16:9, and embedded videos must be in MP4 format."
                    session_speaker = MockSessionSpeaker()
                    
                self.presentation_files = [MockFile()]

        class MockSession:
            name = "Quantum Computing Summit"
            room_name = "Hall A"
            start_datetime = datetime.now()

        variables = build_speaker_variables(
            MockSpeaker(), 
            MockSession(), 
            event,
            rejection_reason="The slide aspect ratio must be 16:9, and embedded videos must be in MP4 format."
        )
    
    reservation = await UsageReservationService.reserve(db, organization_id=event.organization_id, event_id=event.id, limit_key="max_emails_per_event", quantity=1, unit="recipient", idempotency_key=f"test-email:{idempotency_key}", metadata={"recipient": data.to_email})
    try:
        await send_email(
            to_email=data.to_email,
            subject=f"[TEST] {render_template(template.subject, variables)}",
            html_body=render_template(template.body_html, variables),
            event_id=event.id,
            db=db,
        )
        await UsageReservationService.consume(db, reservation.id, source="communications.test_email", actor_user_id=actor.id)
        await db.commit()
    except Exception:
        if reservation.status == "RESERVED":
            await UsageReservationService.release(db, reservation.id)
            await db.commit()
        raise
    
    return MessageResponse(message=f"Test email dispatched to {data.to_email}")


@router.get(
    "/components",
    response_model=List[EmailComponentResponse],
    dependencies=[require_event_operation("communications.campaign.read")],
)
async def list_components(
    event_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    List reusable UI components. Returns global ones + event-specific ones.
    """
    return await EmailComponentQueryService(db).list_for_event(event_id=event_id)


@router.post(
    "/components",
    response_model=EmailComponentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_event_operation("communications.campaign.manage")],
)
async def create_component(
    event_id: uuid.UUID,
    data: EmailComponentCreate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    idempotency_key: str = Header(
        ..., alias="Idempotency-Key", min_length=8, max_length=200
    ),
):
    """Create an event-owned component; global catalogue writes are platform-only."""
    if data.is_global:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "COMMAND_CENTER_GLOBAL_COMPONENT_REQUIRED"},
        )
    existing = await db.scalar(
        select(EmailComponent).where(
            EmailComponent.event_id == event.id,
            EmailComponent.name == data.name,
            EmailComponent.component_type == data.component_type,
            EmailComponent.deleted_at.is_(None),
        )
    )
    if existing is not None:
        if existing.default_config == data.default_config:
            return existing
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "EMAIL_COMPONENT_NAME_CONFLICT"},
        )
    component = EmailComponent(
        event_id=event.id,
        organization_id=event.organization_id,
        scope_type="EVENT",
        name=data.name,
        component_type=data.component_type,
        default_config=data.default_config,
        is_global=False,
        stable_key=f"legacy-{uuid.uuid4().hex[:12]}",
        category=data.component_type,
        document_fragment=data.default_config,
        created_by=user.id,
    )
    db.add(component)
    await db.flush()
    await AuditService.write_log_sync(
        AuditContext(
            action_type="EMAIL_COMPONENT_CREATED",
            resource_type="email_component",
            resource_id=component.id,
            actor_user_id=user.id,
            organization_id=event.organization_id,
            actor_role=getattr(user, "role", None),
            new_state={
                "event_id": str(event.id),
                "name": component.name,
                "component_type": component.component_type,
                "idempotency_key": idempotency_key,
            },
        ),
        db,
    )
    await db.commit()
    await db.refresh(component)
    return component

@router.delete(
    "/components/{component_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[require_event_operation("communications.campaign.manage")],
)
async def delete_component(
    event_id: uuid.UUID,
    component_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Soft-delete an event-owned component."""
    stmt = select(EmailComponent).where(
        EmailComponent.id == component_id,
        EmailComponent.event_id == event_id
    )
    res = await db.execute(stmt)
    component = res.scalars().first()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found or not editable")

    if component.deleted_at is None:
        component.deleted_at = datetime.now(timezone.utc)
        component.deleted_by = user.id
        await AuditService.write_log_sync(
            AuditContext(
                action_type="EMAIL_COMPONENT_ARCHIVED",
                resource_type="email_component",
                resource_id=component.id,
                actor_user_id=user.id,
                organization_id=event.organization_id,
                actor_role=getattr(user, "role", None),
                old_state={
                    "event_id": str(event.id),
                    "name": component.name,
                    "component_type": component.component_type,
                },
            ),
            db,
        )
    await db.commit()
    return None

# ==========================================
# Templates
# ==========================================
@router.get("/templates", response_model=List[EmailTemplateResponse], dependencies=[require_event_operation("communications.email.read")])
async def list_templates(
    event_id: uuid.UUID,
    event: CurrentEvent,
    target_type: str = "speaker",
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the effective published hierarchy without materializing inherited copies."""
    from app.modules.notifications.services.email_template_studio_service import (
        designer_enabled_for_event,
        list_effective_templates,
    )

    enabled, reason = await designer_enabled_for_event(
        db, event.organization_id, event_id, actor.id
    )
    effective = await list_effective_templates(
        db,
        organization_id=event.organization_id,
        event_id=event_id,
        target_type=target_type,
        designer_enabled=enabled,
    )
    response = []
    for template, origin in effective:
        row = EmailTemplateResponse.model_validate(template)
        response.append(row.model_copy(update={
            "lifecycle_state": "PUBLISHED",
            "effective_origin": origin,
            "editable": enabled,
            "fallback_reason": None if enabled else reason or "NOT_ENTITLED",
        }))
    return response


@router.get("/analytics", dependencies=[require_event_operation("communications.email.read")])
async def get_analytics(
    event: CurrentEvent,
    target_type: str = "speaker",
    db: AsyncSession = Depends(get_db),
):
    """Fetch aggregated campaign analytics for the event."""
    return await get_event_email_analytics(
        db,
        event.id,
        target_type=target_type,
        organization_id=event.organization_id,
    )


@router.get("/logs", response_model=PaginatedEmailLogResponse, dependencies=[require_event_operation("communications.email.read")])
async def get_email_logs(
    event: CurrentEvent,
    campaign_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    target_type: str = "speaker",
    page: int = 1,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Fetch email delivery logs with pagination and filtering."""
    return await EmailLogQueryService(db).list_legacy(
        event_id=event.id, target_type=target_type,
        campaign_id=campaign_id, status=status, page=page, limit=limit,
    )


@router.get(
    "/logs/cursor",
    response_model=CursorPage[EmailLogResponse],
    dependencies=[require_event_operation("communications.email.read")],
)
async def get_email_logs_cursor(
    event: CurrentEvent,
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    campaign_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    target_type: str = "speaker",
    db: AsyncSession = Depends(get_db),
):
    """Bounded cursor path for large delivery-log histories."""
    return await EmailLogQueryService(db).list_for_event(
        event_id=event.id,
        target_type=target_type,
        campaign_id=campaign_id,
        status=status,
        cursor=cursor,
        limit=limit,
    )


@router.get(
    "/logs/download",
    dependencies=[
        require_event_operation("communications.email.read"),
        require_event_operation("exports.create"),
    ],
)
async def download_logs(
    event: CurrentEvent,
    target_type: str = "speaker",
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Memory-efficient CSV export of delivery logs."""
    reservation = await UsageReservationService.reserve(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        limit_key="max_exports_per_event",
        quantity=1,
        unit="export",
        idempotency_key=f"email-log-export:{idempotency_key}",
        metadata={"target_type": target_type, "domain": "communications"},
    )
    if target_type == "participant":
        from app.modules.registration.models.participant import Participant
        query = (
            select(EmailLog)
            .join(Participant, EmailLog.participant_id == Participant.id)
            .where(Participant.event_id == event.id, Participant.deleted_at.is_(None))
            .order_by(EmailLog.sent_at.desc())
        )
    else:
        query = (
            select(EmailLog)
            .join(Speaker, EmailLog.speaker_id == Speaker.id)
            .where(Speaker.event_id == event.id, Speaker.deleted_at.is_(None))
            .order_by(EmailLog.sent_at.desc())
        )
    result = await db.execute(query)
    await AuditService.write_log_sync(
        AuditContext(
            action_type="EMAIL_LOG_EXPORT_ACCESSED",
            resource_type="event",
            resource_id=event.id,
            actor_user_id=actor.id,
            organization_id=event.organization_id,
            actor_role=getattr(actor, "role", None),
            new_state={"event_id": str(event.id), "target_type": target_type, "format": "csv"},
            is_sensitive=True,
        ),
        db,
    )
    await UsageReservationService.consume(
        db,
        reservation.id,
        source="organizer_portal.communications.email_log_export",
        actor_user_id=actor.id,
    )
    await db.commit()

    def generate_csv():
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write Header
        writer.writerow(["Email", "Subject", "Status", "Opened At", "Sent At"])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        # Write Rows
        for log in result.scalars():
            writer.writerow([
                log.to_email,
                log.subject,
                log.status,
                log.opened_at.isoformat() if log.opened_at else "N/A",
                log.sent_at.isoformat() if log.sent_at else "N/A",
            ])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    return StreamingResponse(
        generate_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=email_logs_{event.id}.csv"},
    )


@router.get("/track-open/{log_id}")
async def track_open(
    event_id: uuid.UUID,
    log_id: uuid.UUID, 
    db: AsyncSession = Depends(get_db)
):
    """Tracking pixel endpoint to record email opens."""
    result = await db.execute(
        select(EmailLog).where(EmailLog.id == log_id, EmailLog.event_id == event_id)
    )
    log = result.scalar_one_or_none()

    if log and not log.opened_at:
        log.opened_at = datetime.now(timezone.utc)
        await db.commit()

    # 1x1 transparent PNG pixel
    pixel_data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    return Response(content=pixel_data, media_type="image/png")


@router.post(
    "/templates",
    response_model=EmailTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_event_operation("communications.campaign.manage")],
)
async def create_template(
    event: CurrentEvent,
    data: EmailTemplateCreate,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template = await EventTemplateMutationService.create_email(
        db,
        event=event,
        payload=data,
        actor_user_id=actor.id,
    )
    await db.commit()
    await db.refresh(template)
    return EmailTemplateResponse.model_validate(template)


@router.patch(
    "/templates/{template_id}",
    response_model=EmailTemplateResponse,
    dependencies=[require_event_operation("communications.campaign.manage")],
)
async def update_template(
    template_id: uuid.UUID,
    event: CurrentEvent,
    data: EmailTemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template, _, _, _ = await EventTemplateMutationService.update_email(
        db,
        event=event,
        template_id=template_id,
        payload=data,
        actor_user_id=current_user.id,
    )
    await db.commit()
    await db.refresh(template)
    return EmailTemplateResponse.model_validate(template)


@router.delete(
    "/templates/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[require_event_operation("communications.campaign.manage")],
)
async def delete_template(
    template_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await EventTemplateMutationService.archive_email(
        db,
        event=event,
        template_id=template_id,
        actor_user_id=current_user.id,
    )
    await db.commit()
    return None


@router.post(
    "/templates/{template_id}/restore",
    response_model=EmailTemplateResponse,
    dependencies=[require_event_operation("communications.campaign.manage")],
)
async def restore_template(
    template_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template, _ = await EventTemplateMutationService.restore_email(
        db,
        event=event,
        template_id=template_id,
        actor_user_id=current_user.id,
    )
    await db.commit()
    await db.refresh(template)
    return EmailTemplateResponse.model_validate(template)


async def get_campaign_recipient_count(db: AsyncSession, campaign: EmailCampaign) -> int:
    from sqlalchemy import select, func, or_
    
    if campaign.target_type == "participant":
        from app.modules.registration.models.participant import Participant
        query = select(func.count(Participant.id)).where(
            Participant.event_id == campaign.event_id,
            Participant.deleted_at.is_(None),
        )
        if campaign.recipient_filter == "paid":
            query = query.where(Participant.paid_status == "Paid")
        elif campaign.recipient_filter == "unpaid":
            query = query.where(Participant.paid_status == "Unpaid")
        elif campaign.recipient_filter == "pending":
            query = query.where(Participant.paid_status == "Pending")
        elif campaign.recipient_filter in ("specific_speakers", "specific_participants", "custom_list", "custom") and campaign.speaker_id_list:
            import uuid as _uuid
            try:
                ids = [_uuid.UUID(s.strip()) for s in campaign.speaker_id_list.split(",") if s.strip()]
                query = query.where(Participant.id.in_(ids))
            except Exception:
                pass
        res = await db.execute(query)
        return res.scalar_one()

    from app.modules.events.models.speaker import Speaker
    from app.modules.presentations.models.poster import Poster
    from app.modules.agenda.models import SessionPerson as SessionSpeaker
    
    query = select(func.count(Speaker.id)).where(
        Speaker.event_id == campaign.event_id,
        Speaker.deleted_at.is_(None),
    )
    
    if campaign.recipient_filter == "pending_upload" or campaign.recipient_filter == "pending":
        query = query.where(Speaker.upload_status == "pending")
    elif campaign.recipient_filter == "uploaded":
        query = query.where(Speaker.upload_status == "uploaded")
    elif campaign.recipient_filter == "approved":
        query = query.where(Speaker.upload_status == "approved")
    elif campaign.recipient_filter == "rejected":
        query = query.where(Speaker.upload_status == "rejected")
    elif campaign.recipient_filter == "posters":
        query = query.where(
            Speaker.id.in_(select(Poster.speaker_id).where(Poster.event_id == campaign.event_id))
        )
    elif campaign.recipient_filter in ("specific_speakers", "custom_list", "custom") and campaign.speaker_id_list:
        import uuid as _uuid
        try:
            ids = [_uuid.UUID(s.strip()) for s in campaign.speaker_id_list.split(",") if s.strip()]
            query = query.where(Speaker.id.in_(ids))
        except Exception:
            pass
    elif campaign.recipient_filter == "specific_session" and campaign.session_id_filter:
        query = query.where(
            or_(
                Speaker.id.in_(select(SessionSpeaker.speaker_id).where(SessionSpeaker.session_id == campaign.session_id_filter)),
                Speaker.id.in_(select(Poster.speaker_id).where(Poster.session_id == campaign.session_id_filter))
            )
        )
    elif campaign.recipient_filter == "specific_room" and campaign.room_id_filter:
        from app.modules.agenda.models import Session
        room_sessions = select(Session.id).where(Session.room_id == campaign.room_id_filter)
        query = query.where(
            or_(
                Speaker.id.in_(select(SessionSpeaker.speaker_id).where(SessionSpeaker.session_id.in_(room_sessions))),
                Speaker.id.in_(select(Poster.speaker_id).where(Poster.session_id.in_(room_sessions)))
            )
        )
    
    res = await db.execute(query)
    return res.scalar_one()


@router.get("/campaigns", response_model=List[CampaignResponse], dependencies=[require_event_operation("communications.email.read")])
async def list_campaigns(
    event: CurrentEvent,
    target_type: str = "speaker",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaigns = await EmailCampaignQueryService(db).list_for_event(
        event_id=event.id,
        target_type=target_type,
        user_id=current_user.id,
        unrestricted=current_user.role in ["super_admin", "admin", "organiser"],
    )
    responses = []
    for campaign in campaigns:
        response = CampaignResponse.model_validate(campaign)
        if campaign.status == "draft":
            response = response.model_copy(
                update={
                    "total_recipients": await get_campaign_recipient_count(db, campaign),
                }
            )
        responses.append(response)
    return responses


@router.get("/campaigns/page", response_model=CursorPage[dict], dependencies=[require_event_operation("communications.email.read")])
async def list_campaigns_cursor(
    event: CurrentEvent,
    target_type: str = "speaker",
    cursor: str | None = Query(None, max_length=512),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await EmailCampaignQueryService(db).list_for_event_cursor(
        event_id=event.id,
        target_type=target_type,
        user_id=current_user.id,
        unrestricted=current_user.role in ["super_admin", "admin", "organiser"],
        cursor=cursor,
        limit=limit,
    )


@router.post(
    "/campaigns",
    response_model=CampaignResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_event_operation("communications.campaign.manage")],
)
async def create_campaign(
    event: CurrentEvent,
    data: CampaignCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", min_length=8, max_length=200),
):
    idem = await begin_idempotent(
        db, organization_id=event.organization_id, actor_id=current_user.id,
        operation="email_campaign.create",
        key=idempotency_key or f"legacy-{uuid.uuid4()}",
        payload=data.model_dump(mode="json"),
    )
    replay = replay_response(idem)
    if replay is not None:
        await db.commit()
        return CampaignResponse.model_validate(replay[1])
    campaign = await EventCampaignMutationService.create(
        db,
        event=event,
        payload=data,
        actor=current_user,
    )
    await db.commit()
    await db.refresh(campaign)
    response = CampaignResponse.model_validate(campaign)
    await complete_idempotent(db, idem, response_status=201, response_body=response.model_dump(mode="json"), resource_id=campaign.id)
    await db.commit()
    return response


@router.patch(
    "/campaigns/{campaign_id}",
    response_model=CampaignResponse,
    dependencies=[require_event_operation("communications.campaign.manage")],
)
async def update_campaign(
    campaign_id: uuid.UUID,
    data: CampaignUpdate,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", min_length=8, max_length=200),
) -> CampaignResponse:
    expected_version = require_if_match(if_match) if if_match is not None else None
    idem = await begin_idempotent(
        db, organization_id=event.organization_id, actor_id=current_user.id,
        operation="email_campaign.update", key=idempotency_key or f"legacy-{uuid.uuid4()}",
        payload={"campaign_id": str(campaign_id), "version": expected_version, **data.model_dump(mode="json", exclude_unset=True)},
    )
    replay = replay_response(idem)
    if replay is not None:
        await db.commit()
        return CampaignResponse.model_validate(replay[1])
    campaign, _, _ = await EventCampaignMutationService.update(
        db,
        event=event,
        campaign_id=campaign_id,
        payload=data,
        actor=current_user,
        expected_version=expected_version,
    )
    await db.commit()
    await db.refresh(campaign)
    response = CampaignResponse.model_validate(campaign)
    await complete_idempotent(db, idem, response_status=200, response_body=response.model_dump(mode="json"), resource_id=campaign.id)
    await db.commit()
    return response


@router.post(
    "/campaigns/{campaign_id}/send",
    response_model=MessageResponse,
    dependencies=[
        require_event_operation("communications.campaign.manage"),
        require_event_operation("communications.bulk_email.send"),
    ],
)
async def send_campaign_trigger(
    campaign_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", min_length=8, max_length=200),
    actor: User = Depends(get_current_user),
):
    """Trigger the celery task for an email campaign."""
    await enforce_event_feature(db, event.organization_id, event.id, "FEAT_BULK_EMAIL")
    from app.modules.notifications.tasks.email_tasks import process_email_campaign
    
    expected_version = require_if_match(if_match) if if_match is not None else None
    idem = await begin_idempotent(
        db, organization_id=event.organization_id, actor_id=actor.id,
        operation="email_campaign.send", key=idempotency_key or f"legacy-{uuid.uuid4()}",
        payload={"campaign_id": str(campaign_id), "version": expected_version},
    )
    replay = replay_response(idem)
    if replay is not None:
        await db.commit()
        return MessageResponse.model_validate(replay[1])
    result = await db.execute(
        select(EmailCampaign).where(
            EmailCampaign.id == campaign_id,
            EmailCampaign.event_id == event.id,
            EmailCampaign.deleted_at.is_(None),
        ).with_for_update()
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    if campaign.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft campaigns can be sent.")
    if expected_version is not None and campaign.version != expected_version:
        raise HTTPException(status_code=409, detail={"code": "RESOURCE_VERSION_CONFLICT", "current_version": campaign.version})

    campaign.status = "sending"
    campaign.version += 1
    response = MessageResponse(message="Campaign dispatch initiated.")
    await complete_idempotent(db, idem, response_status=200, response_body=response.model_dump(mode="json"), resource_id=campaign.id)
    await db.commit()

    # Dispatch to Celery
    process_email_campaign.delay(str(campaign_id), str(event.organization_id))
    
    return response


@router.delete(
    "/campaigns/{campaign_id}",
    response_model=MessageResponse,
    dependencies=[require_event_operation("communications.campaign.manage")],
)
async def delete_campaign(
    campaign_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", min_length=8, max_length=200),
):
    """Delete an email campaign."""
    expected_version = require_if_match(if_match) if if_match is not None else None
    idem = await begin_idempotent(
        db, organization_id=event.organization_id, actor_id=current_user.id,
        operation="email_campaign.archive", key=idempotency_key or f"legacy-{uuid.uuid4()}",
        payload={"campaign_id": str(campaign_id), "version": expected_version},
    )
    replay = replay_response(idem)
    if replay is not None:
        await db.commit()
        return MessageResponse.model_validate(replay[1])
    _, outcome = await EventCampaignMutationService.archive(
        db,
        event=event,
        campaign_id=campaign_id,
        actor=current_user,
        expected_version=expected_version,
    )
    await db.commit()
    response = MessageResponse(
        message=(
            "Campaign is already archived."
            if outcome == "ALREADY_ARCHIVED"
            else "Campaign archived and remains recoverable."
        )
    )
    await complete_idempotent(db, idem, response_status=200, response_body=response.model_dump(mode="json"), resource_id=campaign_id)
    await db.commit()
    return response


@router.post(
    "/campaigns/{campaign_id}/restore",
    response_model=CampaignResponse,
    dependencies=[require_event_operation("communications.campaign.manage")],
)
async def restore_campaign(
    campaign_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", min_length=8, max_length=200),
) -> CampaignResponse:
    idem = await begin_idempotent(
        db, organization_id=event.organization_id, actor_id=current_user.id,
        operation="email_campaign.restore", key=idempotency_key or f"legacy-{uuid.uuid4()}",
        payload={"campaign_id": str(campaign_id)},
    )
    replay = replay_response(idem)
    if replay is not None:
        await db.commit()
        return CampaignResponse.model_validate(replay[1])
    campaign, _ = await EventCampaignMutationService.restore(
        db,
        event=event,
        campaign_id=campaign_id,
        actor=current_user,
    )
    await db.commit()
    await db.refresh(campaign)
    response = CampaignResponse.model_validate(campaign)
    await complete_idempotent(db, idem, response_status=200, response_body=response.model_dump(mode="json"), resource_id=campaign.id)
    await db.commit()
    return response


@router.get("/recipients", dependencies=[require_event_operation("communications.email.read")])
async def get_recipients(
    event: CurrentEvent,
    filter: str = Query("all"),
    target_type: str = Query("speaker"),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch speaker or participant list matching target filter options.
    When target_type=participant, returns participants from the event.
    """
    if target_type == "participant":
        from app.modules.registration.models.participant import Participant
        query = select(Participant).where(
            Participant.event_id == event.id,
            Participant.deleted_at.is_(None),
        )

        if filter == "paid":
            query = query.where(Participant.paid_status == "Paid")
        elif filter == "unpaid":
            query = query.where(Participant.paid_status == "Unpaid")
        elif filter == "pending":
            query = query.where(Participant.paid_status == "Pending")
        elif filter.startswith("role_"):
            role_name = filter.replace("role_", "").capitalize()
            query = query.where(Participant.role == role_name)

        result = await db.execute(query.order_by(Participant.name))
        participants = result.scalars().all()

        return [
            {
                "id": str(p.id),
                "name": p.name,
                "email": p.email or "",
                "phone": p.phone or "",
                "role": p.role,
                "company": p.company or "",
                "regno": p.regno or "",
                "paid_status": p.paid_status,
            }
            for p in participants
        ]

    # Default: speakers
    from sqlalchemy.orm import selectinload
    from app.modules.presentations.models.poster import Poster

    query = select(Speaker).where(
        Speaker.event_id == event.id,
        Speaker.deleted_at.is_(None),
    )

    if filter == "pending_upload" or filter == "pending":
        query = query.where(Speaker.upload_status == "pending")
    elif filter == "uploaded":
        query = query.where(Speaker.upload_status == "uploaded")
    elif filter == "approved":
        query = query.where(Speaker.upload_status == "approved")
    elif filter == "rejected":
        query = query.where(Speaker.upload_status == "rejected")
    elif filter == "posters":
        query = query.where(
            Speaker.id.in_(select(Poster.speaker_id).where(Poster.event_id == event.id))
        )

    # Eager load relationships for validation
    query = query.options(
        selectinload(Speaker.presentation_files),
        selectinload(Speaker.posters),
        selectinload(Speaker.session_speakers)
    )

    result = await db.execute(query.order_by(Speaker.last_name, Speaker.first_name))
    speakers = result.scalars().all()

    summaries = []
    for s in speakers:
        summary = SpeakerSummary.model_validate(s)
        summary.talks_count = len(s.session_speakers) + len(s.posters)
        summary.files_total = summary.talks_count
        summary.files_uploaded = sum(1 for f in s.presentation_files if f.upload_status in {"processing", "pending_validation", "valid", "uploaded", "approved"})
        summary.files_approved = sum(1 for f in s.presentation_files if f.upload_status == "approved")
        summaries.append(summary)

    return summaries


@router.post(
    "/campaigns/send-to-speakers",
    response_model=CampaignResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        require_event_operation("communications.campaign.manage"),
        require_event_operation("communications.bulk_email.send"),
    ],
)
async def send_to_speakers(
    event: CurrentEvent,
    data: SendToSpeakersRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a campaign targeting a specific list of speakers and dispatch it immediately.
    Used by the speaker-row mail button and the bulk-email dialog in the Command Center.
    """
    from app.modules.notifications.tasks.email_tasks import process_email_campaign
    await enforce_event_feature(db, event.organization_id, event.id, "FEAT_BULK_EMAIL", user_id=current_user.id)

    # Validate template exists
    tpl_result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.id == data.template_id,
            or_(
                (EmailTemplate.scope_type == "EVENT") & (EmailTemplate.event_id == event.id),
                (EmailTemplate.scope_type == "ORGANIZATION") & (EmailTemplate.organization_id == event.organization_id),
                EmailTemplate.scope_type == "PLATFORM",
            ),
        ).execution_options(skip_tenant_filter=True)
    )
    template = tpl_result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")

    # Validate all speaker IDs belong to this event
    speaker_count_result = await db.execute(
        select(func.count(Speaker.id)).where(
            Speaker.event_id == event.id,
            Speaker.deleted_at.is_(None),
            Speaker.id.in_(data.recipient_ids)
        )
    )
    valid_count: int = speaker_count_result.scalar_one()
    if valid_count == 0:
        raise HTTPException(status_code=400, detail="No valid speakers found for this event.")

    # Build campaign
    id_csv = ",".join(str(sid) for sid in data.recipient_ids)
    campaign = EmailCampaign(
        event_id=event.id,
        created_by=current_user.id,
        template_id=data.template_id,
        template_version_id=template.current_published_version_id,
        name=f"Direct Send — {len(data.recipient_ids)} speaker(s)",
        recipient_filter="specific_speakers",
        speaker_id_list=id_csv,
        status="draft",
        total_recipients=valid_count,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)

    if data.send_immediately:
        campaign.status = "sending"
        await db.commit()
        process_email_campaign.delay(str(campaign.id), str(event.organization_id))

    return CampaignResponse.model_validate(campaign)


class AutoInviteResponse(BaseModel):
    """Response body for the auto-invite endpoint."""
    campaign_id: uuid.UUID
    total_speakers: int
    pending_speakers: int
    already_uploaded: int
    message: str


@router.post(
    "/campaigns/auto-invite",
    response_model=AutoInviteResponse,
    dependencies=[
        require_event_operation("communications.campaign.manage"),
        require_event_operation("communications.bulk_email.send"),
    ],
)
async def auto_invite_speakers(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    One-click post-import invitation blast.
    - Finds (or creates) the global upload_invite template.
    - Creates a campaign with recipient_filter='pending_upload' (only pending speakers).
    - Immediately dispatches the Celery task.
    - Returns total/pending speaker counts so the frontend can show accurate messaging.
    """
    from app.modules.notifications.tasks.email_tasks import process_email_campaign
    await enforce_event_feature(db, event.organization_id, event.id, "FEAT_BULK_EMAIL", user_id=current_user.id)

    # ── 1. Count speakers ────────────────────────────────
    total_result = await db.execute(
        select(func.count(Speaker.id)).where(
            Speaker.event_id == event.id,
            Speaker.deleted_at.is_(None),
        )
    )
    total_speakers: int = total_result.scalar_one()

    pending_result = await db.execute(
        select(func.count(Speaker.id)).where(
            Speaker.event_id == event.id,
            Speaker.deleted_at.is_(None),
            Speaker.upload_status == "pending"
        )
    )
    pending_speakers: int = pending_result.scalar_one()
    already_uploaded = total_speakers - pending_speakers

    # ── 2. Resolve the upload_invite template ────────────
    # Prefer event-specific; fall back to global default.
    from app.modules.notifications.services.email_template_studio_service import resolve_template_type
    template, _ = await resolve_template_type(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        template_type="upload_invite",
        target_type="speaker",
        user_id=current_user.id,
    )

    if not template:
        raise HTTPException(
            status_code=404,
            detail=(
                "No 'upload_invite' email template found. "
                "Create one in the Email Manager before sending invitations."
            )
        )

    if pending_speakers == 0:
        raise HTTPException(
            status_code=400,
            detail="All speakers have already uploaded their files. No invitations were sent."
        )

    # ── 3. Create campaign ───────────────────────────────
    campaign = EmailCampaign(
        event_id=event.id,
        created_by=current_user.id,
        template_id=template.id,
        name=f"Auto-Invite — {event.name}",
        recipient_filter="pending_upload",
        status="draft",
        total_recipients=pending_speakers,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)

    # ── 4. Dispatch Celery task ──────────────────────────
    campaign.status = "sending"
    await db.commit()
    process_email_campaign.delay(str(campaign.id), str(event.organization_id))

    return AutoInviteResponse(
        campaign_id=campaign.id,
        total_speakers=total_speakers,
        pending_speakers=pending_speakers,
        already_uploaded=already_uploaded,
        message=(
            f"{pending_speakers} invitation email{'s' if pending_speakers != 1 else ''} queued for delivery."
            + (f" {already_uploaded} speaker{'s' if already_uploaded != 1 else ''} skipped (already uploaded)." if already_uploaded > 0 else "")
        )
    )


@router.post(
    "/campaigns/{campaign_id}/resend-failed",
    response_model=MessageResponse,
    dependencies=[
        require_event_operation("communications.campaign.manage"),
        require_event_operation("communications.bulk_email.send"),
    ],
)
async def resend_failed_emails(
    campaign_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Reset 'failed' logs for a campaign and re-trigger the background task."""
    from app.modules.notifications.tasks.email_tasks import process_email_campaign
    await enforce_event_feature(db, event.organization_id, event.id, "FEAT_BULK_EMAIL")
    
    await db.execute(
        update(EmailLog)
        .where(EmailLog.campaign_id == campaign_id, EmailLog.status.in_(["failed", "bounced"]))
        .values(status="queued", error_message=None)
    )
    
    process_email_campaign.delay(str(campaign_id), str(event.organization_id))
    await db.commit()
    return MessageResponse(message="Retry task dispatched for failed emails.")


from pydantic import EmailStr

class SendSingleEmailRequest(BaseModel):
    recipient: EmailStr
    template: str
    link: str

email_router = APIRouter(prefix="/events/{event_id}/emails", tags=["emails"], dependencies=[require_event_feature("FEAT_EMAIL_NOTIFICATIONS")])

@email_router.post(
    "/send-single",
    response_model=MessageResponse,
    dependencies=[require_event_operation("communications.email.send")],
)
async def send_single_email(
    event_id: uuid.UUID,
    payload: SendSingleEmailRequest,
    event: CurrentEvent,
    idempotency_key: str = Header(min_length=16, max_length=120, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
):
    """
    Sends a single email based on a template and pre-rendered variables.
    """
    # 1. Fetch speaker
    speaker_res = await db.execute(
        select(Speaker).where(
            Speaker.event_id == event_id,
            Speaker.deleted_at.is_(None),
            func.lower(Speaker.email) == str(payload.recipient).lower()
        )
    )
    speaker = speaker_res.scalar_one_or_none()
    if not speaker:
        raise HTTPException(status_code=404, detail="Speaker not found.")

    # 2. Fetch template
    # Try finding template matching name or type for this event or global
    from app.modules.notifications.services.email_template_studio_service import (
        designer_enabled_for_event,
        list_effective_templates,
    )
    designer_enabled, _ = await designer_enabled_for_event(
        db, event.organization_id, event_id
    )
    effective = await list_effective_templates(
        db,
        organization_id=event.organization_id,
        event_id=event_id,
        target_type="speaker",
        designer_enabled=designer_enabled,
    )
    available = [row for row, _ in effective]
    template = next(
        (row for row in available if row.template_type == payload.template or row.name == payload.template),
        None,
    )
    if not template:
        template = next((row for row in available if row.template_type == "upload_invite"), None)

    if not template:
        subject = "Invitation: Complete Your Speaker Profile — {{EventName}}"
        body_html = """<p>Dear {{SpeakerName}},</p>
<p>Please update your speaker profile details using the link below:</p>
<p><a href="{{UploadLink}}">{{UploadLink}}</a></p>
<p>Best regards,<br/>The Organizing Committee</p>"""
    else:
        subject = template.subject
        body_html = template.body_html

    # 3. Build variables and render template
    from app.modules.notifications.services.email_service import build_speaker_variables, send_email
    from app.modules.notifications.services.email_renderer import render_template as render_with_css
    
    variables = build_speaker_variables(speaker, None, event, payload.link)
    
    rendered_subject = render_template(subject, variables)
    inlined_html, text_fallback = render_with_css(body_html, variables)

    # 4. Dispatch email
    reservation = await UsageReservationService.reserve(db, organization_id=event.organization_id, event_id=event.id, limit_key="max_emails_per_event", quantity=1, unit="recipient", idempotency_key=f"single-email:{idempotency_key}", metadata={"recipient": str(payload.recipient)})
    try:
        await send_email(
            to_email=payload.recipient,
            subject=rendered_subject,
            html_body=inlined_html,
            text_body=text_fallback,
            speaker_id=speaker.id,
            event_id=event_id,
            db=db,
        )
        await UsageReservationService.consume(db, reservation.id, source="communications.single_email")
        await db.commit()
    except Exception:
        if reservation.status == "RESERVED":
            await UsageReservationService.release(db, reservation.id)
            await db.commit()
        raise

    return MessageResponse(message="Email dispatched successfully.")


from app.modules.communications.models.email_asset import EmailAsset
from app.modules.notifications.schemas.email_asset import EmailAssetResponse


MAX_EMAIL_ASSET_BYTES = 5 * 1024 * 1024
EMAIL_ASSET_TYPES = {
    "image/png": ("png", lambda value: value.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/jpeg": ("jpg", lambda value: value.startswith(b"\xff\xd8\xff")),
    "image/gif": ("gif", lambda value: value.startswith((b"GIF87a", b"GIF89a"))),
    "image/webp": (
        "webp",
        lambda value: len(value) >= 12
        and value[:4] == b"RIFF"
        and value[8:12] == b"WEBP",
    ),
}

# Email clients cannot authenticate against Organizer Portal APIs. Only the
# token-bearing image delivery endpoint is public; management stays on the
# authenticated, entitlement-gated email_router.
email_asset_public_router = APIRouter(
    prefix="/events/{event_id}/emails", tags=["email-assets"]
)

@email_router.post(
    "/assets/upload",
    response_model=EmailAssetResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_event_operation("communications.campaign.manage")],
)
async def upload_asset(
    event_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
    idempotency_key: str = Header(
        ..., alias="Idempotency-Key", min_length=8, max_length=200
    ),
):
    """Upload a validated, metered image asset for email templates."""
    original_name = (file.filename or "").strip()
    if not original_name or len(original_name) > 255:
        raise HTTPException(status_code=422, detail={"code": "INVALID_FILE_NAME"})

    content_type = (file.content_type or "").lower()
    type_rule = EMAIL_ASSET_TYPES.get(content_type)
    if type_rule is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"code": "UNSUPPORTED_EMAIL_ASSET_TYPE"},
        )
    contents = await file.read(MAX_EMAIL_ASSET_BYTES + 1)
    if not contents:
        raise HTTPException(status_code=422, detail={"code": "EMPTY_FILE"})
    if len(contents) > MAX_EMAIL_ASSET_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "EMAIL_ASSET_TOO_LARGE", "max_bytes": MAX_EMAIL_ASSET_BYTES},
        )
    extension, signature_matches = type_rule
    if not signature_matches(contents):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"code": "INVALID_EMAIL_ASSET_CONTENT"},
        )

    reservation = await UsageReservationService.reserve(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        limit_key="storage_quota_mb",
        quantity=max(1, (len(contents) + 1024 * 1024 - 1) // (1024 * 1024)),
        unit="megabyte",
        idempotency_key=f"email-asset-upload:{idempotency_key}",
        metadata={
            "file_name": original_name,
            "consumption_quantity": len(contents),
            "consumption_unit": "byte",
        },
    )

    asset_id = uuid.uuid4()
    storage_path = (
        f"{event.organization_id}/{event.id}/email_assets/{asset_id}.{extension}"
    )
    access_token = secrets.token_urlsafe(32)
    access_token_hash = hashlib.sha256(access_token.encode("utf-8")).hexdigest()
    asset_url = (
        f"{settings.API_BASE_URL.rstrip('/')}{settings.api_v1_prefix}"
        f"/events/{event_id}/emails/assets/{asset_id}/download?token={access_token}"
    )

    try:
        await asyncio.to_thread(
            upload_service.upload_bytes,
            bucket=settings.S3_BUCKET_ASSETS,
            storage_path=storage_path,
            data=contents,
            content_type=content_type,
        )
    except Exception as exc:
        await UsageReservationService.release(db, reservation.id)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "ASSET_STORAGE_UNAVAILABLE"},
        ) from exc

    asset = EmailAsset(
        id=asset_id,
        scope_type="EVENT",
        organization_id=event.organization_id,
        event_id=event_id,
        user_id=current_user.id,
        name=original_name,
        url=asset_url,
        storage_path=storage_path,
        access_token_hash=access_token_hash,
        file_type=content_type,
        size_bytes=len(contents),
    )
    db.add(asset)
    try:
        await UsageReservationService.consume(
            db,
            reservation.id,
            source="organizer_portal.email_assets.upload",
            actor_user_id=current_user.id,
        )
        await db.commit()
        await db.refresh(asset)
    except Exception:
        await db.rollback()
        try:
            await asyncio.to_thread(
                upload_service.delete_object,
                settings.S3_BUCKET_ASSETS,
                storage_path,
            )
        except Exception:
            pass
        raise

    return asset


@email_router.get(
    "/assets",
    response_model=List[EmailAssetResponse],
    dependencies=[require_event_operation("communications.campaign.read")],
)
async def get_assets(
    event_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    """
    Get all uploaded assets for this event.
    """
    await enforce_event_feature(db, event.organization_id, event.id, "FEAT_EMAIL_NOTIFICATIONS")

    result = await db.execute(
        select(EmailAsset)
        .where(EmailAsset.event_id == event_id)
        .order_by(EmailAsset.created_at.desc())
    )
    return result.scalars().all()


@email_asset_public_router.get(
    "/assets/{asset_id}/download",
)
async def download_asset(
    event_id: uuid.UUID,
    asset_id: uuid.UUID,
    token: str = Query(..., min_length=32, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    """Serve a token-bearing public image URL embedded in delivered email."""
    result = await db.execute(
        select(EmailAsset).where(EmailAsset.id == asset_id, EmailAsset.event_id == event_id)
    )
    asset = result.scalar_one_or_none()
    supplied_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    if not asset or not hmac.compare_digest(asset.access_token_hash, supplied_hash):
        raise HTTPException(status_code=404, detail="Asset not found")

    try:
        contents = await asyncio.to_thread(
            upload_service.get_object_bytes,
            settings.S3_BUCKET_ASSETS,
            asset.storage_path,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail="Asset not found") from exc

    safe_name = asset.name.replace('"', "").replace("\r", "").replace("\n", "")
    return Response(
        content=contents,
        media_type=asset.file_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Disposition": f'inline; filename="{safe_name}"',
        },
    )

