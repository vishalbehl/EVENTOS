# backend/app/routers/notifications.py
from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, update, delete, or_, func, nullslast
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, get_current_event, CurrentEvent
from app.modules.notifications.models.email_campaign import EmailCampaign
from app.modules.notifications.models.email_template import EmailTemplate
from app.modules.notifications.models.email_log import EmailLog
from app.modules.speakers.models.speaker import Speaker
from app.modules.auth.models.user import User
from app.modules.notifications.schemas.notification import (
    EmailTemplateCreate, EmailTemplateUpdate, EmailTemplateResponse,
    CampaignCreate, CampaignResponse, InviteSpeakersRequest,
    SendToSpeakersRequest,
    PaginatedEmailLogResponse, TestTemplateRequest
)
from app.schemas.common import MessageResponse
from app.modules.speakers.schemas.speaker import SpeakerSummary
from app.services import email_service, upload_service
from app.modules.analytics.services.analytics_service import get_event_email_analytics
from app.config import settings

router = APIRouter(prefix="/events/{event_id}/notifications", tags=["notifications"])


@router.post("/test-template", response_model=MessageResponse)
async def test_template(
    event: CurrentEvent,
    data: TestTemplateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Send a test email using a template and dummy data."""
    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.id == data.template_id,
            or_(EmailTemplate.event_id == event.id, EmailTemplate.event_id.is_(None))
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
    
    await send_email(
        to_email=data.to_email,
        subject=f"[TEST] {render_template(template.subject, variables)}",
        html_body=render_template(template.body_html, variables),
        event_id=event.id
    )
    
    return MessageResponse(message=f"Test email dispatched to {data.to_email}")


@router.get("/templates", response_model=List[EmailTemplateResponse])
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
            EmailTemplate.target_type == target_type
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


@router.get("/analytics")
async def get_analytics(
    event: CurrentEvent,
    target_type: str = "speaker",
    db: AsyncSession = Depends(get_db),
):
    """Fetch aggregated campaign analytics for the event."""
    return await get_event_email_analytics(db, event.id, target_type=target_type)


@router.get("/logs", response_model=PaginatedEmailLogResponse)
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
            .where(Participant.event_id == event.id)
        )
    else:
        query = (
            select(EmailLog)
            .join(Speaker, EmailLog.speaker_id == Speaker.id)
            .where(Speaker.event_id == event.id)
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


@router.get("/logs/download")
async def download_logs(
    event: CurrentEvent, 
    target_type: str = "speaker",
    db: AsyncSession = Depends(get_db)
):
    """Memory-efficient CSV export of delivery logs."""
    if target_type == "participant":
        from app.modules.registration.models.participant import Participant
        query = (
            select(EmailLog)
            .join(Participant, EmailLog.participant_id == Participant.id)
            .where(Participant.event_id == event.id)
            .order_by(EmailLog.sent_at.desc())
        )
    else:
        query = (
            select(EmailLog)
            .join(Speaker, EmailLog.speaker_id == Speaker.id)
            .where(Speaker.event_id == event.id)
            .order_by(EmailLog.sent_at.desc())
        )
    result = await db.execute(query)

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
    result = await db.execute(select(EmailLog).where(EmailLog.id == log_id))
    log = result.scalar_one_or_none()

    if log and not log.opened_at:
        log.opened_at = datetime.now(timezone.utc)
        await db.commit()

    # 1x1 transparent PNG pixel
    pixel_data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    return Response(content=pixel_data, media_type="image/png")


@router.post("/templates", response_model=EmailTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    event: CurrentEvent,
    data: EmailTemplateCreate,
    db: AsyncSession = Depends(get_db),
):
    template = EmailTemplate(
        event_id=event.id,
        **data.model_dump()
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return EmailTemplateResponse.model_validate(template)


@router.patch("/templates/{template_id}", response_model=EmailTemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    event: CurrentEvent,
    data: EmailTemplateUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id,
            or_(EmailTemplate.event_id == event.id, EmailTemplate.event_id.is_(None))
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # If editing a global system template, clone it as an event-specific template
    if template.event_id is None:
        # Check if an event-specific template of this name already exists to prevent duplicate clones!
        existing_clone = None
        if template.template_type != "custom":
            existing_res = await db.execute(
                select(EmailTemplate).where(
                    EmailTemplate.event_id == event.id,
                    EmailTemplate.name == template.name
                )
            )
            existing_clone = existing_res.scalar_one_or_none()
            
        if existing_clone:
            # Update the existing event-specific template instead of cloning again!
            for key, value in data.model_dump(exclude_unset=True).items():
                setattr(existing_clone, key, value)
            await db.commit()
            await db.refresh(existing_clone)
            return EmailTemplateResponse.model_validate(existing_clone)
            
        cloned_template = EmailTemplate(
            event_id=event.id,
            name=template.name,
            template_type=template.template_type,
            subject=template.subject,
            body_html=template.body_html,
            body_text=template.body_text,
            is_default=False,
        )
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(cloned_template, key, value)
        db.add(cloned_template)
        await db.commit()
        await db.refresh(cloned_template)
        return EmailTemplateResponse.model_validate(cloned_template)
    
    # Otherwise, update the event-specific template directly
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(template, key, value)
    
    await db.commit()
    await db.refresh(template)
    return EmailTemplateResponse.model_validate(template)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id,
            EmailTemplate.event_id == event.id
        )
    )
    template = result.scalar_one_or_none()
    if template:
        await db.delete(template)
        await db.commit()
    return None


async def get_campaign_recipient_count(db: AsyncSession, campaign: EmailCampaign) -> int:
    from sqlalchemy import select, func, or_
    
    if campaign.target_type == "participant":
        from app.modules.registration.models.participant import Participant
        query = select(func.count(Participant.id)).where(Participant.event_id == campaign.event_id)
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

    from app.modules.speakers.models.speaker import Speaker
    from app.modules.presentations.models.poster import Poster
    from app.modules.speakers.models.session_speaker import SessionSpeaker
    
    query = select(func.count(Speaker.id)).where(Speaker.event_id == campaign.event_id)
    
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
        from app.modules.speakers.models.session import Session
        room_sessions = select(Session.id).where(Session.room_id == campaign.room_id_filter)
        query = query.where(
            or_(
                Speaker.id.in_(select(SessionSpeaker.speaker_id).where(SessionSpeaker.session_id.in_(room_sessions))),
                Speaker.id.in_(select(Poster.speaker_id).where(Poster.session_id.in_(room_sessions)))
            )
        )
    
    res = await db.execute(query)
    return res.scalar_one()


@router.get("/campaigns", response_model=List[CampaignResponse])
async def list_campaigns(
    event: CurrentEvent,
    target_type: str = "speaker",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(EmailCampaign).where(
        EmailCampaign.event_id == event.id,
        EmailCampaign.target_type == target_type
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


@router.post("/campaigns", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    event: CurrentEvent,
    data: CampaignCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Enforce restrictions for non-admin roles
    if current_user.role not in ["super_admin", "admin", "organiser"]:
        if data.recipient_filter not in ["specific_session", "specific_room"]:
            raise HTTPException(
                status_code=403, 
                detail="Your role is only allowed to send campaigns to specific assigned sessions or rooms."
            )
        
        from app.modules.rbac.models.rbac import UserAccessNode
        node_id_to_check = data.session_id_filter if data.recipient_filter == "specific_session" else data.room_id_filter
        node_type = "SESSION" if data.recipient_filter == "specific_session" else "ROOM"
        
        if not node_id_to_check:
            raise HTTPException(status_code=400, detail=f"Missing {node_type.lower()} ID for filter.")
            
        check = await db.execute(
            select(UserAccessNode).where(
                UserAccessNode.user_id == current_user.id,
                UserAccessNode.node_id == node_id_to_check,
                UserAccessNode.node_type == node_type
            )
        )
        if not check.scalar_one_or_none():
            raise HTTPException(status_code=403, detail=f"You are not assigned to this {node_type.lower()}.")

    campaign_data = data.model_dump(exclude={"speaker_ids"})
    if data.speaker_ids:
        if data.target_type == "participant":
            from app.modules.registration.models.participant import Participant
            recipient_count_result = await db.execute(
                select(func.count(Participant.id)).where(
                    Participant.event_id == event.id,
                    Participant.id.in_(data.speaker_ids)
                )
            )
            valid_count: int = recipient_count_result.scalar_one()
            if valid_count == 0:
                raise HTTPException(status_code=400, detail="No valid participants found for this event.")
        else:
            from app.modules.speakers.models.speaker import Speaker
            recipient_count_result = await db.execute(
                select(func.count(Speaker.id)).where(
                    Speaker.event_id == event.id,
                    Speaker.id.in_(data.speaker_ids)
                )
            )
            valid_count: int = recipient_count_result.scalar_one()
            if valid_count == 0:
                raise HTTPException(status_code=400, detail="No valid speakers found for this event.")
        campaign_data["speaker_id_list"] = ",".join(str(sid) for sid in data.speaker_ids)
        campaign_data["total_recipients"] = valid_count

    campaign = EmailCampaign(
        event_id=event.id,
        created_by=current_user.id,
        **campaign_data
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return CampaignResponse.model_validate(campaign)


@router.post("/campaigns/{campaign_id}/send", response_model=MessageResponse)
async def send_campaign_trigger(
    campaign_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    """Trigger the celery task for an email campaign."""
    from app.modules.notifications.tasks.email_tasks import process_email_campaign
    
    result = await db.execute(
        select(EmailCampaign).where(
            EmailCampaign.id == campaign_id,
            EmailCampaign.event_id == event.id
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
    process_email_campaign.delay(str(campaign_id))
    
    return MessageResponse(message="Campaign dispatch initiated.")


@router.delete("/campaigns/{campaign_id}", response_model=MessageResponse)
async def delete_campaign(
    campaign_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an email campaign."""
    result = await db.execute(
        select(EmailCampaign).where(
            EmailCampaign.id == campaign_id,
            EmailCampaign.event_id == event.id
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
        
    if current_user.role not in ["super_admin", "admin", "organiser"]:
        if campaign.created_by != current_user.id:
            raise HTTPException(status_code=403, detail="You do not have permission to delete this campaign.")
            
    await db.delete(campaign)
    await db.commit()
    return MessageResponse(message="Campaign deleted successfully.")


@router.get("/recipients")
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
        query = select(Participant).where(Participant.event_id == event.id)

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

    query = select(Speaker).where(Speaker.event_id == event.id)

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


@router.post("/campaigns/send-to-speakers", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
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
        process_email_campaign.delay(str(campaign.id))

    return CampaignResponse.model_validate(campaign)


class AutoInviteResponse(BaseModel):
    """Response body for the auto-invite endpoint."""
    campaign_id: uuid.UUID
    total_speakers: int
    pending_speakers: int
    already_uploaded: int
    message: str


@router.post("/campaigns/auto-invite", response_model=AutoInviteResponse)
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

    # ── 1. Count speakers ────────────────────────────────
    total_result = await db.execute(
        select(func.count(Speaker.id)).where(Speaker.event_id == event.id)
    )
    total_speakers: int = total_result.scalar_one()

    pending_result = await db.execute(
        select(func.count(Speaker.id)).where(
            Speaker.event_id == event.id,
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
    process_email_campaign.delay(str(campaign.id))

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


@router.post("/campaigns/{campaign_id}/resend-failed", response_model=MessageResponse)
async def resend_failed_emails(
    campaign_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Reset 'failed' logs for a campaign and re-trigger the background task."""
    from app.modules.notifications.tasks.email_tasks import process_email_campaign
    
    await db.execute(
        update(EmailLog)
        .where(EmailLog.campaign_id == campaign_id, EmailLog.status.in_(["failed", "bounced"]))
        .values(status="queued", error_message=None)
    )
    
    process_email_campaign.delay(str(campaign_id))
    await db.commit()
    return MessageResponse(message="Retry task dispatched for failed emails.")
