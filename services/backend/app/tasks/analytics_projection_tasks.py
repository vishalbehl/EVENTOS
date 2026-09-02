"""Bounded background refreshes for durable analytics projections."""

import uuid

from app.database import AsyncSessionLocal, tenant_org_id
from app.modules.analytics.services.event_registration_projection import refresh_event_registration_summary
from app.modules.analytics.models.event_registration_summary import EventRegistrationSummary
from app.worker import celery_app
from app.core.async_runner import run_async
from app.core.task_policy import is_retryable, policy_for
from app.tasks.projection_task_support import mark_projection_failed, projection_execution_lock

_REPORTS_POLICY = policy_for("reports")

async def _mark_projection_failed(
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    exc: Exception,
) -> None:
    """Compatibility wrapper for the shared terminal-failure handler."""
    await mark_projection_failed(
        EventRegistrationSummary,
        organization_id=organization_id,
        event_id=event_id,
        exc=exc,
        session_factory=AsyncSessionLocal,
    )


@celery_app.task(
    name="app.tasks.analytics_projection_tasks.refresh_event_registration_summary",
    bind=True,
    max_retries=_REPORTS_POLICY.max_retries,
    soft_time_limit=_REPORTS_POLICY.soft_timeout_seconds,
    time_limit=_REPORTS_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_REPORTS_POLICY.queue,
)
def refresh_event_registration_summary_task(self, organization_id: str, event_id: str):
    """Refresh one projection; retries are safe because the operation is a rebuild."""
    async def run():
        org = uuid.UUID(str(organization_id))
        event = uuid.UUID(str(event_id))
        token = tenant_org_id.set(org)
        try:
            async with projection_execution_lock(
                "registration-summary",
                organization_id=org,
                event_id=event,
            ) as should_run:
                if should_run:
                    async with AsyncSessionLocal() as db:
                        await refresh_event_registration_summary(db, organization_id=org, event_id=event)
                        await db.commit()
        finally:
            tenant_org_id.reset(token)

    try:
        run_async(run())
    except Exception as exc:
        policy = policy_for("reports")
        if not is_retryable(exc) or self.request.retries >= policy.max_retries:
            try:
                run_async(
                    _mark_projection_failed(
                        uuid.UUID(str(organization_id)),
                        uuid.UUID(str(event_id)),
                        exc,
                    )
                )
            except Exception:
                # The original task error remains authoritative if terminal
                # state persistence is temporarily unavailable.
                pass
            raise
        raise self.retry(
            exc=exc,
            countdown=policy.retry_delay(self.request.retries, apply_jitter=True),
            max_retries=policy.max_retries,
        )
