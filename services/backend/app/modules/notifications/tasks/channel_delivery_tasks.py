from __future__ import annotations

import asyncio
import sys
import uuid

from loguru import logger

from app.core.tenant_context import TenantContextGuard
from app.database import AsyncSessionLocal, tenant_org_id
from app.modules.notifications.services.channel_delivery_service import (
    ChannelDeliveryService,
)
from app.worker import celery_app
from app.core.async_runner import run_async as stable_run_async
from app.core.task_policy import is_retryable, policy_for

_NOTIFICATIONS_POLICY = policy_for("notifications")


def _run(coroutine):
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    return stable_run_async(coroutine)


@celery_app.task(
    name="app.tasks.dispatch_communication_batch",
    bind=True,
    max_retries=_NOTIFICATIONS_POLICY.max_retries,
    soft_time_limit=_NOTIFICATIONS_POLICY.soft_timeout_seconds,
    time_limit=_NOTIFICATIONS_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_NOTIFICATIONS_POLICY.queue,
)
def dispatch_communication_batch(
    self,
    batch_id: str,
    organization_id: str,
) -> None:
    # Parse caller-controlled identifiers before the retry block so malformed
    # messages are rejected permanently and never consume worker capacity.
    parsed_batch_id = uuid.UUID(batch_id)
    parsed_organization_id = uuid.UUID(organization_id)
    try:
        retry_pending = _run(
            _dispatch(
                parsed_batch_id,
                parsed_organization_id,
                worker_id=getattr(self.request, "id", None),
            )
        )
    except Exception as exc:
        logger.exception(
            "Communication batch dispatch failed: batch_id={}",
            batch_id,
        )
        attempt = int(getattr(self.request, "retries", 0) or 0)
        if not is_retryable(exc) or attempt >= _NOTIFICATIONS_POLICY.max_retries:
            _run(
                _mark_failed(
                    parsed_batch_id,
                    parsed_organization_id,
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
    if retry_pending:
        attempt = int(getattr(self.request, "retries", 0) or 0)
        if attempt >= _NOTIFICATIONS_POLICY.max_retries:
            _run(_mark_failed(parsed_batch_id, parsed_organization_id))
            return
        raise self.retry(
            countdown=min(
                300,
                _NOTIFICATIONS_POLICY.retry_delay(attempt, apply_jitter=True),
            ),
            max_retries=_NOTIFICATIONS_POLICY.max_retries,
        )


async def _dispatch(
    batch_id: uuid.UUID,
    organization_id: uuid.UUID,
    *,
    worker_id: str | None = None,
) -> bool:
    context_token = tenant_org_id.set(organization_id)
    try:
        async with AsyncSessionLocal() as db:
            await TenantContextGuard.apply(db, organization_id)
            batch = await ChannelDeliveryService.process_batch(
                db,
                batch_id=batch_id,
                organization_id=organization_id,
                worker_id=worker_id,
            )
            retry_pending = batch.status == "RETRY_PENDING"
            await db.commit()
            return retry_pending
    finally:
        tenant_org_id.reset(context_token)


async def _mark_failed(
    batch_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> None:
    context_token = tenant_org_id.set(organization_id)
    try:
        async with AsyncSessionLocal() as db:
            await TenantContextGuard.apply(db, organization_id)
            await ChannelDeliveryService.mark_system_failure(
                db,
                batch_id=batch_id,
                organization_id=organization_id,
                code="DELIVERY_WORKER_FAILURE",
            )
            await db.commit()
    finally:
        tenant_org_id.reset(context_token)
