"""Phase 3A release evidence for the four explicit acceptance gates.

These tests intentionally use the real PostgreSQL test database and separate
committed sessions where the behavior depends on transaction boundaries.
Broker publication is represented by a controlled task double; no customer
messages or external providers are contacted.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.idempotency_service import (
    begin_idempotent,
    complete_idempotent,
    purge_expired,
    replay_response,
)
from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.communications.models.email_template import EmailTemplate
from app.modules.events.models.event import Event
from app.modules.files.models.file import DurableUpload
from app.modules.identity.models.user import User
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.platform.models.organization import Organization
from app.modules.registration.application.commands import PromoCodeCommandService
from app.modules.registration.routers.payments import PromoCodeUpdate
from app.modules.registration.models.promo_code import PromoCode


async def _committed_event(factory) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID]:
    """Create isolated committed data visible to both concurrency sessions."""
    async with factory() as session:
        organization = Organization(
            name="Phase 3A Gate Org",
            slug=f"phase3a-gate-{uuid.uuid4().hex[:10]}",
            plan="pro",
        )
        session.add(organization)
        await session.flush()
        actor = User(
            organization_id=organization.id,
            email=f"phase3a-{uuid.uuid4().hex[:10]}@test.com",
            password_hash="gate-test-password-hash",
            first_name="Phase",
            last_name="Gate",
            role="organiser",
            is_active=True,
        )
        session.add(actor)
        await session.flush()
        event = Event(
            organization_id=organization.id,
            created_by=actor.id,
            name="Phase 3A Concurrency Event",
            short_code=f"P3A{uuid.uuid4().hex[:8].upper()}",
            location="Test City",
            venue_name="Test Hall",
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 3),
            timezone="UTC",
            status="draft",
            max_file_size_mb=500,
            allowed_formats=["pdf"],
        )
        session.add(event)
        await session.flush()
        promo = PromoCode(
            event_id=event.id,
            code=f"GATE{uuid.uuid4().hex[:8].upper()}",
            discount_type="percentage",
            discount_value=10,
            is_active=True,
        )
        session.add(promo)
        await session.commit()
        return organization.id, actor.id, event.id, promo.id


@pytest.mark.asyncio
async def test_separate_sessions_allow_one_versioned_mutation_and_reject_the_stale_race(
    committed_session_factory,
):
    """Two database sessions using the same version produce one winner."""
    organization_id, actor_id, event_id, promo_id = await _committed_event(
        committed_session_factory
    )
    actor = SimpleNamespace(id=actor_id, organization_id=organization_id)
    payloads = [PromoCodeUpdate(is_active=False), PromoCodeUpdate(is_active=True)]

    async def mutate(payload):
        async with committed_session_factory() as session:
            event = await session.get(Event, event_id)
            assert event is not None
            return await PromoCodeCommandService.update(
                session,
                event=event,
                promo_id=promo_id,
                payload=payload,
                actor=actor,
                idempotency_key=f"phase3a-race-{uuid.uuid4()}",
                if_match="1",
            )

    outcomes = await asyncio.gather(
        *(mutate(payload) for payload in payloads), return_exceptions=True
    )
    successes = [outcome for outcome in outcomes if not isinstance(outcome, Exception)]
    conflicts = [
        outcome
        for outcome in outcomes
        if isinstance(outcome, HTTPException)
        and outcome.status_code == 409
        and outcome.detail["code"] == "RESOURCE_VERSION_CONFLICT"
    ]
    assert len(successes) == 1, outcomes
    assert len(conflicts) == 1, outcomes

    async with committed_session_factory() as session:
        promo = await session.get(PromoCode, promo_id)
        assert promo is not None
        assert promo.version == 2


@pytest.mark.asyncio
async def test_broker_failure_keeps_committed_campaign_intent_recoverable(
    committed_session_factory, monkeypatch
):
    """A failed publish is retried from the durable sending state."""
    organization_id, actor_id, event_id, _ = await _committed_event(
        committed_session_factory
    )
    campaign_id = uuid.uuid4()
    old_time = datetime.now(timezone.utc) - timedelta(minutes=45)
    async with committed_session_factory() as session:
        template = EmailTemplate(
            event_id=event_id,
            organization_id=organization_id,
            created_by=actor_id,
            name="Phase 3A Gate Template",
            template_type="custom",
            subject="Gate test",
            body_html="<p>Gate test</p>",
            is_default=False,
        )
        session.add(template)
        await session.flush()
        campaign = EmailCampaign(
            id=campaign_id,
            event_id=event_id,
            template_id=template.id,
            created_by=actor_id,
            name="Phase 3A Broker Recovery",
            recipient_filter="all",
            target_type="speaker",
            status="sending",
            total_recipients=0,
            sent_count=0,
            created_at=old_time,
            updated_at=old_time,
        )
        session.add(campaign)
        await session.commit()

    from app.modules.notifications.tasks import email_tasks

    calls: list[tuple[str, str, str | None]] = []
    attempts = 0

    def publish(campaign_id_arg, organization_id_arg, reservation_id=None):
        nonlocal attempts
        attempts += 1
        calls.append((campaign_id_arg, organization_id_arg, reservation_id))
        if attempts == 1:
            raise RuntimeError("controlled broker outage")

    monkeypatch.setattr(email_tasks, "AsyncSessionLocal", committed_session_factory)
    monkeypatch.setattr(email_tasks.process_email_campaign, "delay", publish)

    first = await email_tasks._recover_email_campaign_dispatches()
    async with committed_session_factory() as session:
        campaign = await session.get(EmailCampaign, campaign_id)
        assert campaign is not None
        assert campaign.status == "sending"
        assert campaign.sent_at is None
    second = await email_tasks._recover_email_campaign_dispatches()

    assert first == 0
    assert second == 1
    assert calls == [(str(campaign_id), str(organization_id), None)] * 2


@pytest.mark.asyncio
async def test_idempotency_expiry_allows_reuse_and_bounded_purge_removes_expired_rows(
    db: AsyncSession, organization: Organization, organizer: User
):
    """Expired keys do not block new work and maintenance deletes bounded rows."""
    operation = "phase3a.expiry.evidence"
    key = f"expired-{uuid.uuid4()}"
    db.add(
        IdempotencyRecord(
            organization_id=organization.id,
            actor_id=organizer.id,
            operation=operation,
            idempotency_key=key,
            request_hash="expired-request-hash",
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
    )
    await db.flush()

    fresh = await begin_idempotent(
        db,
        organization_id=organization.id,
        actor_id=organizer.id,
        operation=operation,
        key=key,
        payload={"fresh": True},
        ttl_seconds=600,
    )
    await complete_idempotent(
        db,
        fresh,
        response_status=200,
        response_body={"accepted": True},
    )
    assert replay_response(fresh) == (200, {"accepted": True})

    expired_ids = []
    for index in range(2):
        row = IdempotencyRecord(
            organization_id=organization.id,
            actor_id=organizer.id,
            operation=f"phase3a.purge.{index}",
            idempotency_key=str(uuid.uuid4()),
            request_hash="purge-request-hash",
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
        db.add(row)
        await db.flush()
        expired_ids.append(row.id)

    assert await purge_expired(db, batch_size=1) == 1
    remaining = await db.scalars(
        select(IdempotencyRecord.id).where(IdempotencyRecord.id.in_(expired_ids))
    )
    assert len(list(remaining)) == 1


@pytest.mark.asyncio
async def test_old_writers_can_omit_new_version_columns_and_receive_server_defaults(
    db: AsyncSession,
    organization: Organization,
    organizer: User,
    event: Event,
):
    """The forward migration keeps old INSERT statements compatible."""
    now = datetime.now(timezone.utc)
    object_key = f"phase3a-old-writer/{uuid.uuid4()}"
    upload_id = (
        await db.scalar(
            text(
                """
                INSERT INTO content.durable_uploads
                    (id, organization_id, event_id, created_by, object_key,
                     storage_bucket, original_filename, mime_type, size_bytes,
                     status, created_at, updated_at)
                VALUES
                    (:id, :organization_id, :event_id, :created_by, :object_key,
                     :storage_bucket, :original_filename, :mime_type, :size_bytes,
                     :status, :created_at, :updated_at)
                RETURNING version
                """
            ),
            {
                "id": uuid.uuid4(),
                "organization_id": organization.id,
                "event_id": event.id,
                "created_by": organizer.id,
                "object_key": object_key,
                "storage_bucket": "assets",
                "original_filename": "old-writer.pdf",
                "mime_type": "application/pdf",
                "size_bytes": 4,
                "status": "created",
                "created_at": now,
                "updated_at": now,
            },
        )
    )
    assert upload_id == 1

    template = EmailTemplate(
        event_id=event.id,
        organization_id=organization.id,
        created_by=organizer.id,
        name="Old writer campaign template",
        template_type="custom",
        subject="Compatibility",
        body_html="<p>Compatibility</p>",
        is_default=False,
    )
    db.add(template)
    await db.flush()
    campaign_version = await db.scalar(
        text(
            """
            INSERT INTO communications.email_campaigns
                (id, event_id, template_id, created_by, name,
                 recipient_filter, target_type, status, total_recipients,
                 sent_count, created_at, updated_at)
            VALUES
                (:id, :event_id, :template_id, :created_by, :name,
                 :recipient_filter, :target_type, :status, :total_recipients,
                 :sent_count, :created_at, :updated_at)
            RETURNING version
            """
        ),
        {
            "id": uuid.uuid4(),
            "event_id": event.id,
            "template_id": template.id,
            "created_by": organizer.id,
            "name": "Old writer campaign",
            "recipient_filter": "all",
            "target_type": "speaker",
            "status": "draft",
            "total_recipients": 0,
            "sent_count": 0,
            "created_at": now,
            "updated_at": now,
        },
    )
    assert campaign_version == 1
