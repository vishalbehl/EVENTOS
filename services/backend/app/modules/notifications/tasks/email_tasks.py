# backend/app/tasks/email_tasks.py
import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone
from loguru import logger
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.worker import celery_app
from app.database import AsyncSessionLocal
from app.config import settings
from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.communications.models.email_log import EmailLog
from app.modules.events.models.event import Event
from app.services import email_service
from app.core.tenant_context import TenantContextGuard
from app.database import tenant_org_id
from app.core.dependencies.feature_gate import enforce_event_operation
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.platform.models.organization_console import UsageReservation
from app.core.async_runner import run_async as stable_run_async
from app.core.task_policy import is_retryable, policy_for
from app.modules.notifications.services.campaign_authority import reauthorize_dispatch
from app.core.tenant_job_capacity import JobCapacityDeferred, tenant_job_slot, renew_job_slot

def _run_async(coro):
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    return stable_run_async(coro)

_NOTIFICATIONS_POLICY = policy_for("notifications")


@celery_app.task(
    name="app.tasks.recover_email_campaign_dispatches",
    queue=_NOTIFICATIONS_POLICY.queue,
    soft_time_limit=_NOTIFICATIONS_POLICY.soft_timeout_seconds,
    time_limit=_NOTIFICATIONS_POLICY.hard_timeout_seconds,
    acks_late=True,
)
def recover_email_campaign_dispatches(organization_id_str: str | None = None, after_organization_id: str | None = None, after_campaign_id: str | None = None) -> int:
    """Re-publish committed campaign intents left sending by broker outages."""
    return _run_async(_recover_email_campaign_dispatches(organization_id_str, after_organization_id, after_campaign_id))


async def _recover_email_campaign_dispatches(organization_id_str=None, after_organization_id=None, after_campaign_id=None) -> int:
    if organization_id_str is None:
        return await _recover_email_campaign_dispatches_with_scope(
            organization_id_str, after_organization_id, after_campaign_id,
        )
    from app.tasks.tenant_job_scope import parse_required_organization_id
    organization_id = parse_required_organization_id(organization_id_str)
    context_token = tenant_org_id.set(organization_id)
    try:
        async with tenant_job_slot(organization_id, "campaign_recovery"):
            return await _recover_email_campaign_dispatches_with_scope(
                organization_id_str, after_organization_id, after_campaign_id,
            )
    except JobCapacityDeferred as exc:
        logger.warning("Campaign recovery deferred: code={}", exc.code)
        return 0
    finally:
        tenant_org_id.reset(context_token)


async def _recover_email_campaign_dispatches_with_scope(organization_id_str=None, after_organization_id=None, after_campaign_id=None) -> int:
    from app.modules.notifications.services.campaign_queue import queue_campaign_delivery
    from app.tasks.tenant_job_scope import parse_required_organization_id, tenant_job_session
    if organization_id_str is None:
        # Scheduler-only allowlisted tenant-ID projection, never customer records.
        # Core table selection avoids implicit customer ORM portfolio projections.
        if tenant_org_id.get() is not None:
            raise PermissionError("Campaign scheduler inventory requires an unscoped scheduler context")
        from app.modules.platform.models.organization import Organization
        table = Organization.__table__
        statement = select(table.c.id).where(table.c.is_active.is_(True)).order_by(table.c.id).limit(100)
        if after_organization_id:
            statement = statement.where(table.c.id > parse_required_organization_id(after_organization_id))
        async with AsyncSessionLocal() as db:
            ids = tuple((await db.scalars(statement)).all())
        # Broker failure raises here; the next scheduled traversal restarts.
        for organization_id in ids:
            recover_email_campaign_dispatches.delay(str(organization_id))
        if len(ids) == 100:
            recover_email_campaign_dispatches.delay(after_organization_id=str(ids[-1]))
        return len(ids)

    organization_id = parse_required_organization_id(organization_id_str)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
    queued = 0
    async with tenant_job_session(organization_id) as db:
        statement = (
            select(EmailCampaign.id, EmailCampaign.send_dispatch_id)
            .join(Event, Event.id == EmailCampaign.event_id)
            .where(
                Event.organization_id == organization_id,
                Event.deleted_at.is_(None),
                EmailCampaign.status == "sending",
                EmailCampaign.sent_at.is_(None),
                EmailCampaign.updated_at < cutoff,
                EmailCampaign.deleted_at.is_(None),
                EmailCampaign.send_dispatch_id.is_not(None),
                EmailCampaign.send_organization_id == organization_id,
                or_(EmailCampaign.worker_token.is_(None),
                    EmailCampaign.worker_lease_until <= func.clock_timestamp()),
            )
            .order_by(EmailCampaign.id)
            .limit(50)
        )
        if after_campaign_id:
            statement = statement.where(EmailCampaign.id > parse_required_organization_id(after_campaign_id))
        rows = list((await db.execute(statement)).all())
        for campaign_id, dispatch_id in rows:
            try:
                from types import SimpleNamespace
                campaign = SimpleNamespace(id=campaign_id)
                current = await reauthorize_dispatch(db, campaign, organization_id, dispatch_id)
                reservation = await db.scalar(select(UsageReservation).where(
                    UsageReservation.organization_id == organization_id,
                    UsageReservation.event_id == current.event_id,
                    UsageReservation.metric_key == "max_emails_per_event",
                    UsageReservation.status == "RESERVED",
                    UsageReservation.metadata_json["campaign_id"].as_string() == str(campaign.id),
                    UsageReservation.metadata_json["dispatch_id"].as_string() == str(dispatch_id),
                ))
                if reservation and (reservation.metadata_json or {}).get("reconciliation_required"):
                    await db.rollback()
                    continue
                reservation_id = reservation.id if reservation else None
                await db.commit()  # release policy locks before broker network I/O
                await renew_job_slot(organization_id, "campaign_recovery")
                if await asyncio.to_thread(queue_campaign_delivery, campaign_id, organization_id, dispatch_id, reservation_id):
                    queued += 1
            except JobCapacityDeferred:
                await db.rollback()
                raise  # Do not swallow lost coordination and continue publishing.
            except Exception as exc:
                await db.rollback()
                logger.warning("Campaign recovery unavailable: error={}", type(exc).__name__)
                continue
    if len(rows) == 50:
        await renew_job_slot(organization_id, "campaign_recovery")
        recover_email_campaign_dispatches.delay(str(organization_id), after_campaign_id=str(rows[-1].id))
    return queued


@celery_app.task(
    name="app.tasks.process_email_campaign",
    bind=True,
    max_retries=_NOTIFICATIONS_POLICY.max_retries,
    soft_time_limit=_NOTIFICATIONS_POLICY.soft_timeout_seconds,
    time_limit=_NOTIFICATIONS_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_NOTIFICATIONS_POLICY.queue,
)
def process_email_campaign(
    self, campaign_id_str: str, organization_id_str: str, reservation_id_str: str | None = None,
    dispatch_id_str: str | None = None
) -> None:
    """
    Background task to process a bulk email campaign.
    Handles snapshotting, batching, and status updates.
    """
    campaign_id = uuid.UUID(campaign_id_str)
    organization_id = uuid.UUID(organization_id_str)
    reservation_id = uuid.UUID(reservation_id_str) if reservation_id_str else None
    dispatch_id = uuid.UUID(dispatch_id_str) if dispatch_id_str else None
    worker_token = uuid.uuid4()
    logger.info(f"[Celery] Processing campaign: {campaign_id}")

    try:
        _run_async(_process_email_campaign_async(campaign_id, organization_id, reservation_id, dispatch_id, worker_token))
    except JobCapacityDeferred as exc:
        # Recovery revisits the durable intent. No hot retry loop, false terminal
        # delivery failure or quota release on coordination/capacity rejection.
        logger.warning("Campaign worker deferred: campaign={} code={}", campaign_id, exc.code)
        return
    except Exception as exc:
        logger.error(f"Campaign processing failed: campaign={campaign_id} error={type(exc).__name__}")
        attempt = int(getattr(self.request, "retries", 0) or 0)
        if not is_retryable(exc) or attempt >= _NOTIFICATIONS_POLICY.max_retries:
            # Persist only a type-level diagnostic. Exception strings can
            # contain recipient data or provider credentials.
            _run_async(
                _fail_campaign_async(
                    campaign_id,
                    organization_id,
                    f"{type(exc).__name__}: campaign processing failed",
                    reservation_id,
                    dispatch_id,
                    worker_token,
                )
            )
            return
        raise self.retry(
            exc=exc,
            countdown=min(
                300,
                _NOTIFICATIONS_POLICY.retry_delay(attempt, apply_jitter=True),
            ),
            max_retries=_NOTIFICATIONS_POLICY.max_retries,
        )
    finally:
        _run_async(_release_worker_lease_async(campaign_id, organization_id, dispatch_id, worker_token))


async def _release_worker_lease_async(campaign_id, organization_id, dispatch_id, worker_token):
    from app.modules.notifications.services.campaign_worker_lease import release_worker_lease
    context_token = tenant_org_id.set(organization_id)
    try:
        async with AsyncSessionLocal() as db:
            await TenantContextGuard.apply(db, organization_id)
            await release_worker_lease(db, campaign_id, organization_id, dispatch_id, worker_token)
            await db.commit()
    except Exception as exc:
        # A DB outage leaves an expiring lease; do not mask the original task result.
        logger.warning("Campaign lease cleanup unavailable: {}", type(exc).__name__)
    finally:
        tenant_org_id.reset(context_token)


async def _fail_campaign_async(campaign_id: uuid.UUID, organization_id: uuid.UUID, failure: str, reservation_id: uuid.UUID | None = None, dispatch_id: uuid.UUID | None = None, worker_token: uuid.UUID | None = None) -> None:
    """Release held quota only after Celery has exhausted every retry."""
    context_token = tenant_org_id.set(organization_id)
    try:
        async with AsyncSessionLocal() as db:
            await TenantContextGuard.apply(db, organization_id)
            campaign = await db.scalar(select(EmailCampaign).join(Event, Event.id == EmailCampaign.event_id).where(
                EmailCampaign.id == campaign_id, Event.organization_id == organization_id).with_for_update(of=EmailCampaign))
            if campaign is None or campaign.send_dispatch_id != dispatch_id or campaign.send_organization_id != organization_id:
                return
            if worker_token is None or campaign.worker_token != worker_token:
                return  # an obsolete worker cannot fail/settle another worker's intent
            reservation = await db.scalar(select(UsageReservation).where(
                UsageReservation.organization_id == organization_id,
                UsageReservation.id == reservation_id,
                UsageReservation.event_id == campaign.event_id,
                UsageReservation.metric_key == "max_emails_per_event",
                UsageReservation.metadata_json["campaign_id"].as_string() == str(campaign_id),
                UsageReservation.metadata_json["dispatch_id"].as_string() == str(dispatch_id),
            ).with_for_update()) if reservation_id else await db.scalar(select(UsageReservation).where(
                UsageReservation.organization_id == organization_id,
                UsageReservation.idempotency_key == f"email-campaign:{campaign_id}:{dispatch_id}",
                UsageReservation.event_id == campaign.event_id,
                UsageReservation.metric_key == "max_emails_per_event",
                UsageReservation.metadata_json["campaign_id"].as_string() == str(campaign_id),
                UsageReservation.metadata_json["dispatch_id"].as_string() == str(dispatch_id),
            ).with_for_update())
            if reservation:
                from app.modules.notifications.services.campaign_settlement import settle_campaign_reservation
                await settle_campaign_reservation(db, campaign=campaign,
                    organization_id=organization_id, dispatch_id=dispatch_id, reservation=reservation)
            if campaign and campaign.status != "sent":
                campaign.status = "failed"
                campaign.version += 1
            logger.error(f"Email campaign permanently failed: campaign={campaign_id} failure={failure}")
            await db.commit()
    finally:
        tenant_org_id.reset(context_token)

async def _process_email_campaign_async(
    campaign_id: uuid.UUID, organization_id: uuid.UUID, reservation_id: uuid.UUID | None = None, dispatch_id: uuid.UUID | None = None,
    worker_token: uuid.UUID | None = None,
) -> None:
    context_token = tenant_org_id.set(organization_id)
    try:
        await _process_email_campaign_in_tenant(campaign_id, organization_id, reservation_id, dispatch_id, worker_token)
    finally:
        tenant_org_id.reset(context_token)


async def _process_email_campaign_in_tenant(
    campaign_id: uuid.UUID, organization_id: uuid.UUID, reservation_id: uuid.UUID | None = None, dispatch_id: uuid.UUID | None = None,
    worker_token: uuid.UUID | None = None,
) -> None:
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

    try:
        await _process_email_campaign_with_session(TaskSessionLocal, campaign_id, organization_id, reservation_id, dispatch_id, worker_token)
    finally:
        await task_engine.dispose()


async def _process_email_campaign_with_session(
    session_factory, campaign_id: uuid.UUID, organization_id: uuid.UUID, reservation_id: uuid.UUID | None = None, dispatch_id: uuid.UUID | None = None,
    worker_token: uuid.UUID | None = None,
) -> None:
    from types import SimpleNamespace
    # Validate the actual dispatch before consuming a tenant slot. Close the
    # transaction (including policy locks) before the coordination network call.
    async with session_factory() as db:
        await TenantContextGuard.apply(db, organization_id)
        await reauthorize_dispatch(db, SimpleNamespace(id=campaign_id), organization_id, dispatch_id)
        await db.rollback()
    async with tenant_job_slot(organization_id, "email_campaign"):
        await _process_email_campaign_with_slot(
            session_factory, campaign_id, organization_id, reservation_id, dispatch_id, worker_token,
        )


async def _process_email_campaign_with_slot(
    session_factory, campaign_id: uuid.UUID, organization_id: uuid.UUID, reservation_id: uuid.UUID | None = None, dispatch_id: uuid.UUID | None = None,
    worker_token: uuid.UUID | None = None,
) -> None:

    async with session_factory() as db:
        await TenantContextGuard.apply(db, organization_id)
        # 1. Fetch Campaign with Template and Event
        result = await db.execute(
            select(EmailCampaign)
            .options(selectinload(EmailCampaign.template), selectinload(EmailCampaign.event))
            .where(EmailCampaign.id == campaign_id, EmailCampaign.event.has(Event.organization_id == organization_id))
        )
        campaign = result.scalar_one_or_none()
        if not campaign or campaign.status == "sent":
            return
        await reauthorize_dispatch(db, campaign, organization_id, dispatch_id)
        from app.modules.notifications.services.campaign_worker_lease import acquire_worker_lease, renew_worker_lease
        if not await acquire_worker_lease(db, campaign, organization_id, dispatch_id, worker_token):
            await db.rollback()
            return  # duplicate broker delivery; current lease owner continues
        await db.refresh(campaign, with_for_update=True)
        if campaign.send_dispatch_id != dispatch_id:
            return

        # 2. Claim draft/scheduled work under the row lock. A retry that
        # arrives after a worker has already claimed the campaign continues
        # the same logical operation without creating a second claim.
        if campaign.status in {"draft", "scheduled", "failed"}:
            campaign.status = "sending"
            campaign.version += 1
        await db.commit()

        # 3. Seal the dispatch cohort in SQL, not application memory.
        from app.modules.notifications.services.campaign_snapshot_service import (
            prepare_campaign_snapshot, campaign_snapshot_batch, validate_snapshot_recipient,
        )
        total_recipients = await prepare_campaign_snapshot(db, campaign, organization_id, dispatch_id)
        await renew_worker_lease(db, campaign, organization_id, dispatch_id, worker_token)

        if not total_recipients:
            await reauthorize_dispatch(db, campaign, organization_id, dispatch_id)
            if reservation_id:
                empty_reservation = await db.scalar(select(UsageReservation).where(
                    UsageReservation.id == reservation_id, UsageReservation.organization_id == organization_id,
                    UsageReservation.event_id == campaign.event_id,
                    UsageReservation.metric_key == "max_emails_per_event",
                    UsageReservation.metadata_json["campaign_id"].as_string() == str(campaign_id),
                    UsageReservation.metadata_json["dispatch_id"].as_string() == str(dispatch_id),
                ).with_for_update())
                if empty_reservation and empty_reservation.status == "RESERVED":
                    await UsageReservationService.release(db, empty_reservation.id)
            campaign.status = "sent"
            campaign.sent_at = datetime.now(timezone.utc)
            await db.commit()
            return

        # Re-check canonical access inside the worker so a restriction or kill
        # switch applied after dispatch still stops delivery. Capacity remains
        # reserved across retries and is released only on terminal failure.
        await enforce_event_operation(
            db,
            organization_id,
            campaign.event_id,
            "communications.bulk_email.send",
        )
        if reservation_id:
            reservation = await db.scalar(select(UsageReservation).where(
                UsageReservation.id == reservation_id,
                UsageReservation.organization_id == organization_id,
                UsageReservation.event_id == campaign.event_id,
                UsageReservation.metric_key == "max_emails_per_event",
                UsageReservation.status == "RESERVED",
                UsageReservation.metadata_json["campaign_id"].as_string() == str(campaign_id),
                UsageReservation.metadata_json["dispatch_id"].as_string() == str(dispatch_id),
            ).with_for_update())
            if not reservation:
                raise RuntimeError("Provided email quota reservation is unavailable")
        else:
            reservation = await UsageReservationService.reserve(
                db,
                organization_id=organization_id,
                event_id=campaign.event_id,
                limit_key="max_emails_per_event",
                quantity=total_recipients,
                unit="recipient",
                idempotency_key=f"email-campaign:{campaign.id}:{dispatch_id}",
                ttl_seconds=86_400,
                metadata={"campaign_id": str(campaign.id), "dispatch_id": str(dispatch_id), "delivery_hold": True},
            )
        await db.commit()

        # Preserve the hold for provided/legacy reservations too, before delivery.
        reservation.metadata_json = {**(reservation.metadata_json or {}), "delivery_hold": True}
        await db.commit()

        # Published campaigns pin a concrete version. If Email Designer access
        # expires before dispatch, tenant/event customizations are deliberately
        # replaced by the matching platform default and the fallback is audited.
        delivery_subject = campaign.template.subject
        delivery_html = campaign.template.body_html
        from app.modules.communications.models.email_template_version import EmailTemplateVersion
        from app.modules.notifications.services.email_template_studio_service import (
            designer_enabled_for_event,
            resolve_template_type,
        )
        designer_enabled, fallback_reason = await designer_enabled_for_event(
            db, organization_id, campaign.event_id
        )
        if designer_enabled and campaign.template_version_id:
            pinned = await db.get(EmailTemplateVersion, campaign.template_version_id)
            if pinned:
                delivery_subject, delivery_html = pinned.subject, pinned.body_html
        elif not designer_enabled and campaign.template.scope_type != "PLATFORM":
            platform_template, _ = await resolve_template_type(
                db,
                organization_id=organization_id,
                event_id=campaign.event_id,
                template_type=campaign.template.template_type,
                target_type=campaign.target_type,
            )
            if platform_template:
                delivery_subject, delivery_html = platform_template.subject, platform_template.body_html
                logger.warning(
                    "Campaign %s fell back to platform template because Email Designer is unavailable: %s",
                    campaign.id,
                    fallback_reason or "NOT_ENTITLED",
                )

        # 4. Batch Processing
        emails_sent_in_batch = 0
        after_recipient = None
        processed_recipients = 0
        while True:
            await reauthorize_dispatch(db, campaign, organization_id, dispatch_id)
            await renew_worker_lease(db, campaign, organization_id, dispatch_id, worker_token)
            batch, after_recipient = await campaign_snapshot_batch(
                db, campaign, organization_id, dispatch_id, after=after_recipient)
            speaker_data = {}
            if batch and campaign.target_type == "speaker":
                from app.modules.notifications.services.campaign_speaker_data import campaign_speaker_data
                speaker_data = await campaign_speaker_data(
                    db, organization_id=organization_id, event_id=campaign.event_id,
                    speaker_ids=[recipient.id for recipient in batch],
                )
            await db.commit()  # no policy lock across provider network calls
            if not batch:
                break
            
            # Render and send batch
            for recipient in batch:
                # Each delivery is ordered separately; revocation stops later
                # sends without retaining a database lock across provider I/O.
                await reauthorize_dispatch(db, campaign, organization_id, dispatch_id)
                await renew_worker_lease(db, campaign, organization_id, dispatch_id, worker_token)
                await validate_snapshot_recipient(db, campaign, organization_id, dispatch_id, recipient)
                await db.commit()
                if campaign.target_type == "participant":
                    # Build variables
                    variables = email_service.build_participant_variables(recipient, campaign.event)
                    
                    from app.modules.notifications.services.email_renderer import render_template as render_with_css

                    # 1. Substitute variables in subject
                    subject = email_service.render_template(delivery_subject, variables)

                    # 2. Render HTML, inject variables, and inline CSS
                    inlined_html, text_fallback = render_with_css(
                        source=delivery_html,
                        variables=variables
                    )

                    log_id = await email_service.claim_campaign_recipient(
                        db,
                        campaign_id=campaign.id,
                        event_id=campaign.event_id,
                        to_email=recipient.email,
                        subject=subject,
                        participant_id=recipient.id,
                        campaign=campaign, organization_id=organization_id, dispatch_id=dispatch_id,
                        worker_token=worker_token,
                    )
                    if log_id is None:
                        continue

                    # 3. Send (which handles pixel injection and the final SMTP MIME assembly)
                    msg_id = await email_service.send_email(
                        to_email=recipient.email,
                        subject=subject,
                        html_body=inlined_html,
                        text_body=text_fallback,
                        participant_id=recipient.id,
                        campaign_id=campaign.id,
                        event_id=campaign.event_id,
                        log_id=log_id,
                        db=db,
                        meter_usage=False,
                    )
                else:
                    speaker = recipient
                    related = speaker_data[speaker.id]
                    session_speakers = related["sessions"]
                    session = session_speakers[0].session if session_speakers else None
                    posters = related["posters"]

                    # Build variables
                    variables = email_service.build_speaker_variables(
                        speaker, session, campaign.event, session_speakers=session_speakers,
                        posters=posters, presentation_files=related["files"],
                    )
                    
                    from app.modules.notifications.services.email_renderer import render_template as render_with_css

                    # 1. Substitute variables in subject
                    subject = email_service.render_template(delivery_subject, variables)

                    template_html = delivery_html
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
                        source=template_html,
                        variables=variables
                    )

                    log_id = await email_service.claim_campaign_recipient(
                        db,
                        campaign_id=campaign.id,
                        event_id=campaign.event_id,
                        to_email=speaker.email,
                        subject=subject,
                        speaker_id=speaker.id,
                        campaign=campaign, organization_id=organization_id, dispatch_id=dispatch_id,
                        worker_token=worker_token,
                    )
                    if log_id is None:
                        continue

                    # 3. Send
                    msg_id = await email_service.send_email(
                        to_email=speaker.email,
                        subject=subject,
                        html_body=inlined_html,
                        text_body=text_fallback,
                        speaker_id=speaker.id,
                        campaign_id=campaign.id,
                        event_id=campaign.event_id,
                        log_id=log_id,
                        db=db,
                        meter_usage=False,
                    )
                
                # Persist the provider outcome before advancing to another recipient.
                # A crash before this commit remains uncertain, never a safe resend.
                await db.commit()
                if msg_id:
                    campaign.sent_count += 1
                    emails_sent_in_batch += 1
                    
                    # Periodic commit for progress tracking (every 10 emails)
                    if emails_sent_in_batch >= 10:
                        await db.commit()
                        emails_sent_in_batch = 0
            
            await db.commit()
            # Throttling: Pause between batches to respect provider limits
            processed_recipients += len(batch)
            if processed_recipients < total_recipients:
                await asyncio.sleep(1) 

        if processed_recipients != total_recipients:
            raise RuntimeError("Campaign snapshot count requires reconciliation")
        await reauthorize_dispatch(db, campaign, organization_id, dispatch_id)
        await renew_worker_lease(db, campaign, organization_id, dispatch_id, worker_token)
        pending_delivery = await db.scalar(select(EmailLog.id).where(
            EmailLog.campaign_id == campaign_id, EmailLog.event_id == campaign.event_id,
            EmailLog.status.in_(("sending", "delivery_unknown", "queued")),
        ).limit(1))
        if pending_delivery is not None:
            from app.modules.notifications.services.campaign_settlement import settle_campaign_reservation
            await settle_campaign_reservation(db, campaign=campaign,
                organization_id=organization_id, dispatch_id=dispatch_id, reservation=reservation)
            await db.commit()
            raise RuntimeError("Campaign provider outcomes require reconciliation")
        from app.modules.notifications.services.campaign_settlement import settle_campaign_reservation
        if not await settle_campaign_reservation(db, campaign=campaign,
            organization_id=organization_id, dispatch_id=dispatch_id, reservation=reservation):
            await db.commit()
            raise RuntimeError("Campaign quota requires reconciliation")
        # Set status after the settlement's locked refresh, not before it.
        failed_delivery = await db.scalar(select(EmailLog.id).where(
            EmailLog.campaign_id == campaign_id, EmailLog.event_id == campaign.event_id,
            EmailLog.status.in_(("failed", "bounced")),
        ).limit(1))
        campaign.sent_count = int(await db.scalar(select(func.count(EmailLog.id)).where(
            EmailLog.campaign_id == campaign_id, EmailLog.event_id == campaign.event_id,
            EmailLog.status.in_(("sent", "delivered")),
        )) or 0)
        campaign.status = "failed" if failed_delivery is not None else "sent"
        campaign.version += 1
        campaign.sent_at = datetime.now(timezone.utc)
        await db.commit()
        if failed_delivery is not None:
            return  # never publish a campaign.sent signal for failed deliveries

        # Emit websocket notification and log it
        try:
            from app.modules.communications.models.notification_event import NotificationEvent
            await reauthorize_dispatch(db, campaign, organization_id, dispatch_id)
            await renew_worker_lease(db, campaign, organization_id, dispatch_id, worker_token)
            await db.commit()
            from app.modules.venue.services.websocket_service import broadcast_to_event
            
            notif_event = NotificationEvent(
                id=uuid.uuid4(),
                correlation_id=campaign.id,
                channel="WEBSOCKET",
                status="PENDING",
                occurred_at=datetime.now(timezone.utc),
                provider_response={"type": "campaign.sent", "campaign_id": str(campaign.id)}
            )
            db.add(notif_event)
            await db.commit()

            await broadcast_to_event(
                event_id=campaign.event_id,
                payload={
                    "type": "campaign.sent",
                    "event_id": str(campaign.event_id),
                    "campaign_id": str(campaign.id),
                    "status": "sent",
                    "version": campaign.version,
                },
                event_name="notification"
            )
            # Redis publication is not proof of browser receipt or durable delivery.
            notif_event.status = "PUBLISHED"
            await db.commit()
        except Exception as ws_err:
            logger.warning(f"Campaign realtime publication unavailable: {type(ws_err).__name__}")

