# backend/app/routers/notifications.py
from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
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
    CampaignCreate, CampaignUpdate, CampaignResponse, InviteSpeakersRequest,
    SendToSpeakersRequest,
    PaginatedEmailLogResponse, TestTemplateRequest
)
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
    rows = (
        await db.scalars(
            select(OrganizationNotificationChannelConfig)
            .where(
                OrganizationNotificationChannelConfig.organization_id
                == event.organization_id,
                OrganizationNotificationChannelConfig.channel.in_(
                    ["SMS", "WHATSAPP", "PUSH"]
                ),
                OrganizationNotificationChannelConfig.deleted_at.is_(None),
            )
            .order_by(OrganizationNotificationChannelConfig.channel)
        )
    ).all()
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
    query = (
        select(CommunicationDeliveryBatch)
        .where(
            CommunicationDeliveryBatch.organization_id
            == event.organization_id,
            CommunicationDeliveryBatch.event_id == event.id,
            CommunicationDeliveryBatch.channel == channel,
        )
        .order_by(CommunicationDeliveryBatch.created_at.desc())
        .limit(limit + 1)
    )
    if cursor:
        cursor_time = await db.scalar(
            select(CommunicationDeliveryBatch.created_at).where(
                CommunicationDeliveryBatch.id == cursor,
                CommunicationDeliveryBatch.organization_id
                == event.organization_id,
                CommunicationDeliveryBatch.event_id == event.id,
            )
        )
        if cursor_time is None:
            raise HTTPException(status_code=404, detail="Cursor not found.")
        query = query.where(
            CommunicationDeliveryBatch.created_at < cursor_time
        )
    rows = (await db.scalars(query)).all()
    has_more = len(rows) > limit
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
            or_(EmailTemplate.event_id == event.id, EmailTemplate.event_id.is_(None)),
            EmailTemplate.deleted_at.is_(None),
        )
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


@router.get("/templates", response_model=List[EmailTemplateResponse], dependencies=[require_event_operation("communications.email.read")])
async def list_templates(
    event: CurrentEvent,
    target_type: str = "speaker",
    db: AsyncSession = Depends(get_db),
):
    """Fetch templates, shadowing global defaults with event-specific templates."""
    result = await db.execute(
        select(EmailTemplate)
        .where(
            or_(EmailTemplate.event_id == event.id, EmailTemplate.event_id.is_(None)),
            EmailTemplate.target_type == target_type,
            EmailTemplate.deleted_at.is_(None),
        )
        .order_by(EmailTemplate.created_at.desc())
    )
    all_templates = result.scalars().all()
    
    # Identify template names for which an event-specific version exists
    event_specific_names = {
        t.name for t in all_templates 
        if t.event_id is not None and t.template_type != "custom"
    }
    
    filtered_templates = []
    seen_event_names = set()
    for t in all_templates:
        if t.event_id is not None and t.template_type != "custom":
            # Skip legacy duplicates of the same name (keeping the newest one because of created_at.desc())
            if t.name in seen_event_names:
                continue
            seen_event_names.add(t.name)
            
        if t.event_id is None and t.template_type != "custom":
            # Skip global default if the event has its own customized template of this name
            if t.name in event_specific_names:
                continue
        filtered_templates.append(t)
        
    return [EmailTemplateResponse.model_validate(t) for t in filtered_templates]


@router.get("/analytics", dependencies=[require_event_operation("communications.email.read")])
async def get_analytics(
    event: CurrentEvent,
    target_type: str = "speaker",
    db: AsyncSession = Depends(get_db),
):
    """Fetch aggregated campaign analytics for the event."""
    return await get_event_email_analytics(db, event.id, target_type=target_type)


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
    if target_type == "participant":
        from app.modules.registration.models.participant import Participant
        query = (
            select(EmailLog)
            .join(Participant, EmailLog.participant_id == Participant.id)
            .where(Participant.event_id == event.id, Participant.deleted_at.is_(None))
        )
    else:
        query = (
            select(EmailLog)
            .join(Speaker, EmailLog.speaker_id == Speaker.id)
            .where(Speaker.event_id == event.id, Speaker.deleted_at.is_(None))
        )

    if campaign_id:
        query = query.where(EmailLog.campaign_id == campaign_id)

    if status:
        query = query.where(EmailLog.status == status)

    # Count total for pagination
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Apply pagination and sorting
    result = await db.execute(
        query.order_by(EmailLog.sent_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    logs = result.scalars().all()
    
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": logs
    }


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
    from app.modules.events.models.session_speaker import SessionSpeaker
    
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
        from app.modules.events.models.session import Session
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
    q = select(EmailCampaign).where(
        EmailCampaign.event_id == event.id,
        EmailCampaign.target_type == target_type,
        EmailCampaign.deleted_at.is_(None),
    )

    # Restricted roles only see their own campaigns or those targeting their assigned nodes
    if current_user.role not in ["super_admin", "admin", "organiser"]:
        from app.modules.rbac.models.rbac import UserAccessNode
        assigned_nodes = select(UserAccessNode.node_id).where(UserAccessNode.user_id == current_user.id)
        
        q = q.where(
            or_(
                EmailCampaign.created_by == current_user.id,
                EmailCampaign.session_id_filter.in_(assigned_nodes),
                EmailCampaign.room_id_filter.in_(assigned_nodes)
            )
        )

    result = await db.execute(q.order_by(EmailCampaign.created_at.desc()))
    campaigns = result.scalars().all()
    for campaign in campaigns:
        if campaign.status == "draft":
            campaign.total_recipients = await get_campaign_recipient_count(db, campaign)
    await db.commit()
    return campaigns


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
):
    campaign = await EventCampaignMutationService.create(
        db,
        event=event,
        payload=data,
        actor=current_user,
    )
    await db.commit()
    await db.refresh(campaign)
    return CampaignResponse.model_validate(campaign)


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
) -> CampaignResponse:
    campaign, _, _ = await EventCampaignMutationService.update(
        db,
        event=event,
        campaign_id=campaign_id,
        payload=data,
        actor=current_user,
    )
    await db.commit()
    await db.refresh(campaign)
    return CampaignResponse.model_validate(campaign)


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
):
    """Trigger the celery task for an email campaign."""
    await enforce_event_feature(db, event.organization_id, event.id, "FEAT_BULK_EMAIL")
    from app.modules.notifications.tasks.email_tasks import process_email_campaign
    
    result = await db.execute(
        select(EmailCampaign).where(
            EmailCampaign.id == campaign_id,
            EmailCampaign.event_id == event.id,
            EmailCampaign.deleted_at.is_(None),
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    if campaign.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft campaigns can be sent.")

    campaign.status = "sending"
    await db.commit()

    # Dispatch to Celery
    process_email_campaign.delay(str(campaign_id), str(event.organization_id))
    
    return MessageResponse(message="Campaign dispatch initiated.")


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
):
    """Delete an email campaign."""
    _, outcome = await EventCampaignMutationService.archive(
        db,
        event=event,
        campaign_id=campaign_id,
        actor=current_user,
    )
    await db.commit()
    return MessageResponse(
        message=(
            "Campaign is already archived."
            if outcome == "ALREADY_ARCHIVED"
            else "Campaign archived and remains recoverable."
        )
    )


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
) -> CampaignResponse:
    campaign, _ = await EventCampaignMutationService.restore(
        db,
        event=event,
        campaign_id=campaign_id,
        actor=current_user,
    )
    await db.commit()
    await db.refresh(campaign)
    return CampaignResponse.model_validate(campaign)


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
            or_(EmailTemplate.event_id == event.id, EmailTemplate.event_id.is_(None))
        )
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
    tpl_result = await db.execute(
        select(EmailTemplate)
        .where(
            EmailTemplate.template_type == "upload_invite",
            or_(
                EmailTemplate.event_id == event.id,
                EmailTemplate.event_id.is_(None),
            )
        )
        .order_by(
            # Event-specific first (non-null event_id sorts last in DESC, so we flip)
            nullslast(EmailTemplate.event_id.desc()),
            EmailTemplate.created_at.asc(),
        )
        .limit(1)
    )
    template = tpl_result.scalar_one_or_none()

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
    tpl_res = await db.execute(
        select(EmailTemplate)
        .where(
            or_(EmailTemplate.event_id == event_id, EmailTemplate.event_id.is_(None)),
            or_(
                EmailTemplate.template_type == payload.template,
                EmailTemplate.name == payload.template
            )
        )
        .order_by(EmailTemplate.event_id.desc(), EmailTemplate.created_at.desc())
    )
    template = tpl_res.scalars().first()

    # Fallback to upload_invite template if not found
    if not template:
        tpl_res = await db.execute(
            select(EmailTemplate)
            .where(
                or_(EmailTemplate.event_id == event_id, EmailTemplate.event_id.is_(None)),
                EmailTemplate.template_type == "upload_invite"
            )
            .order_by(EmailTemplate.event_id.desc(), EmailTemplate.created_at.desc())
        )
        template = tpl_res.scalars().first()

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

