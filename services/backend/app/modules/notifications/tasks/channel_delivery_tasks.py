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


def _run(coroutine):
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    return asyncio.run(coroutine)


@celery_app.task(
    name="app.tasks.dispatch_communication_batch",
    bind=True,
    max_retries=2,
)
def dispatch_communication_batch(
    self,
    batch_id: str,
    organization_id: str,
) -> None:
    try:
        retry_pending = _run(
            _dispatch(
                uuid.UUID(batch_id),
                uuid.UUID(organization_id),
            )
        )
    except Exception as exc:
        logger.exception(
            "Communication batch dispatch failed: batch_id={}",
            batch_id,
        )
        if self.request.retries >= self.max_retries:
            _run(
                _mark_failed(
                    uuid.UUID(batch_id),
                    uuid.UUID(organization_id),
                )
            )
            return
        raise self.retry(
            exc=exc,
            countdown=30 * (self.request.retries + 1),
        )
    if retry_pending:
        raise self.retry(countdown=30 * (self.request.retries + 1))


async def _dispatch(
    batch_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    context_token = tenant_org_id.set(organization_id)
    try:
        async with AsyncSessionLocal() as db:
            await TenantContextGuard.apply(db, organization_id)
            batch = await ChannelDeliveryService.process_batch(
                db,
                batch_id=batch_id,
                organization_id=organization_id,
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
