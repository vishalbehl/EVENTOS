# backend/app/tasks/email_tasks.py
import asyncio
import sys
import uuid
from datetime import datetime, timezone
from loguru import logger
from sqlalchemy import select, update, or_
from sqlalchemy.orm import selectinload

from app.worker import celery_app
from app.database import AsyncSessionLocal
from app.config import settings
from app.models.email_campaign import EmailCampaign
from app.models.email_log import EmailLog
from app.models.speaker import Speaker
from app.models.poster import Poster
from app.models.session_speaker import SessionSpeaker
from app.models.session import Session
from app.services import email_service

def _run_async(coro):
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    return asyncio.run(coro)

@celery_app.task(name="app.tasks.process_email_campaign", bind=True, max_retries=3)
def process_email_campaign(self, campaign_id_str: str) -> None:
    """
    Background task to process a bulk email campaign.
    Handles snapshotting, batching, and status updates.
    """
    campaign_id = uuid.UUID(campaign_id_str)
    logger.info(f"[Celery] Processing campaign: {campaign_id}")

    try:
        _run_async(_process_email_campaign_async(campaign_id))
    except Exception as exc:
        logger.exception(f"[Celery] Error processing campaign {campaign_id}: {exc}")
        raise self.retry(exc=exc, countdown=60)

async def _process_email_campaign_async(campaign_id: uuid.UUID) -> None:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy.pool import NullPool
    
    task_engine = create_async_engine(
        settings.async_database_url,
        echo=settings.debug,
        poolclass=NullPool,
    )
    
    TaskSessionLocal = async_sessionmaker(
        bind=task_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with TaskSessionLocal() as db:
        # 1. Fetch Campaign with Template and Event
        result = await db.execute(
            select(EmailCampaign)
            .options(selectinload(EmailCampaign.template), selectinload(EmailCampaign.event))
            .where(EmailCampaign.id == campaign_id)
        )
        campaign = result.scalar_one_or_none()
        if not campaign or campaign.status == "sent":
            return

        # 2. Update status to sending
        campaign.status = "sending"
        await db.commit()

        # 3. Identify Recipients (Snapshot)
        if campaign.target_type == "participant":
            from app.models.participant import Participant
            query = select(Participant).where(Participant.event_id == campaign.event_id)
            if campaign.recipient_filter == "paid":
                query = query.where(Participant.paid_status == "Paid")
            elif campaign.recipient_filter == "unpaid":
                query = query.where(Participant.paid_status == "Unpaid")
            elif campaign.recipient_filter == "pending":
                query = query.where(Participant.paid_status == "Pending")
            elif campaign.recipient_filter in ("specific_speakers", "specific_participants", "custom_list", "custom") and campaign.speaker_id_list:
                import uuid as _uuid
                ids = [_uuid.UUID(s.strip()) for s in campaign.speaker_id_list.split(",") if s.strip()]
                query = query.where(Participant.id.in_(ids))
            
            result = await db.execute(query)
            recipients = result.scalars().all()
        else:
            query = select(Speaker).where(Speaker.event_id == campaign.event_id)
            if campaign.recipient_filter == "pending_upload":
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
                ids = [_uuid.UUID(s.strip()) for s in campaign.speaker_id_list.split(",") if s.strip()]
                query = query.where(Speaker.id.in_(ids))
            elif campaign.recipient_filter == "specific_session" and campaign.session_id_filter:
                query = query.where(
                    or_(
                        Speaker.id.in_(select(SessionSpeaker.speaker_id).where(SessionSpeaker.session_id == campaign.session_id_filter)),
                        Speaker.id.in_(select(Poster.speaker_id).where(Poster.session_id == campaign.session_id_filter))
                    )
                )
            elif campaign.recipient_filter == "specific_room" and campaign.room_id_filter:
                room_sessions = select(Session.id).where(Session.room_id == campaign.room_id_filter)
                query = query.where(
                    or_(
                        Speaker.id.in_(select(SessionSpeaker.speaker_id).where(SessionSpeaker.session_id.in_(room_sessions))),
                        Speaker.id.in_(select(Poster.speaker_id).where(Poster.session_id.in_(room_sessions)))
                    )
                )
            
            result = await db.execute(query)
            recipients = result.scalars().all()
        
        campaign.total_recipients = len(recipients)
        await db.commit()

        if not recipients:
            campaign.status = "sent"
            campaign.sent_at = datetime.now(timezone.utc)
            await db.commit()
            return

        # 4. Batch Processing
        batch_size = 50
        emails_sent_in_batch = 0
        for i in range(0, len(recipients), batch_size):
            batch = recipients[i:i + batch_size]
            
            # Render and send batch
            for recipient in batch:
                if campaign.target_type == "participant":
                    # Idempotency check: Skip if already sent for this campaign + email
                    log_check = await db.execute(
                        select(EmailLog).where(
                            EmailLog.campaign_id == campaign.id,
                            EmailLog.to_email == recipient.email,
                            EmailLog.status == "sent"
                        )
                    )
                    if log_check.scalar_one_or_none():
                        continue

                    # Build variables
                    variables = email_service.build_participant_variables(recipient, campaign.event)
                    
                    from app.services.email_renderer import render_template as render_with_css

                    # 1. Substitute variables in subject
                    subject = email_service.render_template(campaign.template.subject, variables)

                    # 2. Render HTML, inject variables, and inline CSS
                    inlined_html, text_fallback = render_with_css(
                        html=campaign.template.body_html,
                        variables=variables
                    )

                    # 3. Send (which handles pixel injection and the final SMTP MIME assembly)
                    msg_id = await email_service.send_email(
                        to_email=recipient.email,
                        subject=subject,
                        html_body=inlined_html,
                        text_body=text_fallback,
                        participant_id=recipient.id,
                        campaign_id=campaign.id,
                        event_id=campaign.event_id,
                        db=db
                    )
                else:
                    speaker = recipient
                    # Load session associations if needed (ensure we have session data for variables)
                    res_ss = await db.execute(
                        select(SessionSpeaker)
                        .options(selectinload(SessionSpeaker.session).selectinload(Session.room))
                        .where(SessionSpeaker.speaker_id == speaker.id)
                        .order_by(SessionSpeaker.start_time)
                    )
                    session_speakers = res_ss.scalars().all()
                    session = session_speakers[0].session if session_speakers else None

                    res_posters = await db.execute(
                        select(Poster)
                        .options(selectinload(Poster.session).selectinload(Session.room))
                        .where(Poster.speaker_id == speaker.id)
                    )
                    posters = res_posters.scalars().all()

                    from app.models.presentation_file import PresentationFile
                    res_files = await db.execute(
                        select(PresentationFile)
                        .where(PresentationFile.speaker_id == speaker.id)
                        .options(selectinload(PresentationFile.session_speaker).selectinload(SessionSpeaker.session))
                    )
                    from sqlalchemy.orm.attributes import set_committed_value
                    set_committed_value(speaker, "presentation_files", res_files.scalars().all())

                    # Idempotency check: Skip if already sent for this campaign + email
                    log_check = await db.execute(
                        select(EmailLog).where(
                            EmailLog.campaign_id == campaign.id,
                            EmailLog.to_email == speaker.email,
                            EmailLog.status == "sent"
                        )
                    )
                    if log_check.scalar_one_or_none():
                        continue

                    # Build variables
                    variables = email_service.build_speaker_variables(
                        speaker, session, campaign.event, session_speakers=session_speakers, posters=posters
                    )
                    
                    from app.services.email_renderer import render_template as render_with_css

                    # 1. Substitute variables in subject
                    subject = email_service.render_template(campaign.template.subject, variables)

                    template_html = campaign.template.body_html
                    total_presentations = len(session_speakers) + len(posters)
                    if (total_presentations > 1 or len(posters) >= 1) and "{{SessionTable}}" not in template_html:
                        table_append = f"""
                        <br><br>
                        <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
                            <h3 style="font-size: 16px; font-weight: 700; color: #1e293b; margin: 0 0 16px 0;">Your Scheduled Presentations</h3>
                            <p style="font-size: 13px; color: #64748b; margin: 0 0 16px 0;">You are scheduled to present the following sessions/posters. Please verify the dates, times, and locations below:</p>
                            {variables["SessionTable"]}
                        </div>
                        """
                        template_html = f"{template_html}{table_append}"

                    # 2. Render HTML, inject variables, and inline CSS
                    inlined_html, text_fallback = render_with_css(
                        html=template_html,
                        variables=variables
                    )

                    # 3. Send
                    msg_id = await email_service.send_email(
                        to_email=speaker.email,
                        subject=subject,
                        html_body=inlined_html,
                        text_body=text_fallback,
                        speaker_id=speaker.id,
                        campaign_id=campaign.id,
                        event_id=campaign.event_id,
                        db=db
                    )
                
                if msg_id:
                    campaign.sent_count += 1
                    emails_sent_in_batch += 1
                    
                    # Periodic commit for progress tracking (every 10 emails)
                    if emails_sent_in_batch >= 10:
                        await db.commit()
                        emails_sent_in_batch = 0
            
            await db.commit()
            # Throttling: Pause between batches to respect provider limits
            if i + batch_size < len(recipients):
                await asyncio.sleep(1) 

        # 5. Mark as Sent
        campaign.status = "sent"
        campaign.sent_at = datetime.now(timezone.utc)
        await db.commit()

        # Emit websocket notification and log it
        try:
            from app.models.notification_event import NotificationEvent
            from app.services.websocket_service import broadcast_to_event
            
            notif_event = NotificationEvent(
                id=uuid.uuid4(),
                correlation_id=campaign.id,
                channel="WEBSOCKET",
                status="SENT",
                occurred_at=datetime.now(timezone.utc),
                provider_response={"title": "Campaign Sent", "desc": f"Campaign '{campaign.name}' successfully sent."}
            )
            db.add(notif_event)
            await db.commit()

            await broadcast_to_event(
                event_id=campaign.event_id,
                payload={
                    "title": "Campaign Sent",
                    "time": "Just now",
                    "desc": f"Campaign '{campaign.name}' successfully sent to {campaign.sent_count} recipients.",
                    "icon": "Mail",
                    "color": "text-[var(--success)]"
                },
                event_name="notification"
            )
        except Exception as ws_err:
            logger.warning(f"Failed to broadcast websocket notification: {ws_err}")

    await task_engine.dispose()
