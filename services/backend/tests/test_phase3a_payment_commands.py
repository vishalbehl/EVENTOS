from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.registration.application.commands import (
    PaymentCommandService,
    PromoCodeCommandService,
)
from app.modules.registration.models.promo_code import PromoCode
from app.modules.registration.routers.payments import (
    PaymentConfigUpdateRequest,
    PromoCodeCreate,
    PromoCodeUpdate,
)
from tests.conftest import activate_event_for_test


@pytest.mark.asyncio
async def test_payment_config_rejects_stale_version_and_replays(
    db: AsyncSession, event, organizer
):
    await activate_event_for_test(db, event)
    initial_version = int(event.version or 1)
    key = f"payment-config-{uuid.uuid4()}"

    next_version = await PaymentCommandService.update_config(
        db,
        event=event,
        payload=PaymentConfigUpdateRequest(payment_enabled=True),
        actor=organizer,
        idempotency_key=key,
        expected_version=initial_version,
    )
    assert next_version == initial_version + 1

    replay_version = await PaymentCommandService.update_config(
        db,
        event=event,
        payload=PaymentConfigUpdateRequest(payment_enabled=True),
        actor=organizer,
        idempotency_key=key,
        expected_version=initial_version,
    )
    assert replay_version == next_version

    with pytest.raises(HTTPException) as conflict:
        await PaymentCommandService.update_config(
            db,
            event=event,
            payload=PaymentConfigUpdateRequest(auto_approve_paid=False),
            actor=organizer,
            idempotency_key=f"payment-config-stale-{uuid.uuid4()}",
            expected_version=initial_version,
        )
    assert conflict.value.status_code == 409
    assert conflict.value.detail["code"] == "RESOURCE_VERSION_CONFLICT"


@pytest.mark.asyncio
async def test_promo_code_update_is_versioned_and_replay_safe(
    db: AsyncSession, event, organizer
):
    await activate_event_for_test(db, event)
    promo = PromoCode(
        event_id=event.id,
        code="PHASE3A",
        discount_type="percentage",
        discount_value=10,
        is_active=True,
    )
    db.add(promo)
    await db.commit()
    await db.refresh(promo)
    initial_version = int(promo.version or 1)
    key = f"promo-update-{uuid.uuid4()}"

    updated = await PromoCodeCommandService.update(
        db,
        event=event,
        promo_id=promo.id,
        payload=PromoCodeUpdate(is_active=False),
        actor=organizer,
        idempotency_key=key,
        if_match=str(initial_version),
    )
    assert updated.version == initial_version + 1

    replayed = await PromoCodeCommandService.update(
        db,
        event=event,
        promo_id=promo.id,
        payload=PromoCodeUpdate(is_active=False),
        actor=organizer,
        idempotency_key=key,
        if_match=str(initial_version),
    )
    assert replayed.version == updated.version

    with pytest.raises(HTTPException) as conflict:
        await PromoCodeCommandService.update(
            db,
            event=event,
            promo_id=promo.id,
            payload=PromoCodeUpdate(is_active=True),
            actor=organizer,
            idempotency_key=f"promo-stale-{uuid.uuid4()}",
            if_match=str(initial_version),
        )
    assert conflict.value.status_code == 409
    assert conflict.value.detail["code"] == "RESOURCE_VERSION_CONFLICT"
