from __future__ import annotations

from app.database import AsyncSessionLocal
from app.core.idempotency_service import purge_expired
from app.worker import celery_app
from app.core.async_runner import run_async
from app.core.task_policy import is_retryable, policy_for


_RECONCILIATION_POLICY = policy_for("reconciliation")


@celery_app.task(
    name="app.tasks.idempotency_tasks.purge_expired",
    bind=True,
    queue=_RECONCILIATION_POLICY.queue,
    soft_time_limit=_RECONCILIATION_POLICY.soft_timeout_seconds,
    time_limit=_RECONCILIATION_POLICY.hard_timeout_seconds,
    max_retries=_RECONCILIATION_POLICY.max_retries,
    acks_late=True,
)
def purge_expired_idempotency_records(self) -> int:
    async def run() -> int:
        async with AsyncSessionLocal() as db:
            async with db.begin():
                return await purge_expired(db)

    try:
        return run_async(run())
    except Exception as exc:
        attempt = int(getattr(self.request, "retries", 0) or 0)
        if is_retryable(exc) and attempt < _RECONCILIATION_POLICY.max_retries:
            raise self.retry(
                exc=exc,
                countdown=min(300, _RECONCILIATION_POLICY.retry_delay(attempt, apply_jitter=True)),
                max_retries=_RECONCILIATION_POLICY.max_retries,
            )
        raise
