"""Best-effort prompt publication of an already committed, recoverable intent."""
from uuid import UUID

from loguru import logger
import redis

from app.config import settings
from app.core.distributed_rate_limit import ADMIT_LUA, Budget, identity_key


# Synchronous post-commit callers run in a thread. Do not share asyncio pools
# across API and Celery loops, or recursively enter the worker async-runner lock.
_publication_redis = redis.Redis.from_url(
    settings.redis_lock_url,
    decode_responses=True,
    max_connections=32,
    socket_connect_timeout=settings.REDIS_OPERATION_TIMEOUT_SECONDS,
    socket_timeout=settings.REDIS_OPERATION_TIMEOUT_SECONDS,
)


def _publication_admitted(campaign_id: UUID, organization_id: UUID, dispatch_id: UUID) -> bool:
    # One bounded atomic check prevents duplicate generations and noisy tenants
    # consuming the shared publisher. Aliases/platform/recovery share these keys.
    budgets = (
        Budget("campaign-publish:v1:global", 100, 60, burst=20),
        Budget(f"campaign-publish:v1:tenant:{identity_key(str(organization_id))}", 20, 60, burst=2),
        Budget(f"campaign-publish:v1:dispatch:{identity_key(f'{organization_id}:{campaign_id}:{dispatch_id}')}",
               1, 300, burst=1),
    )
    args = []
    for budget in budgets:
        args.extend((budget.capacity, budget.window_seconds, budget.burst or budget.capacity, int(budget.fixed)))
    result = _publication_redis.eval(ADMIT_LUA, len(budgets), *[budget.key for budget in budgets], *args)
    return bool(result[0])


def queue_campaign_delivery(campaign_id, organization_id, dispatch_id, reservation_id=None):
    try:
        campaign_id, organization_id, dispatch_id = (
            UUID(str(value)) for value in (campaign_id, organization_id, dispatch_id)
        )
        reservation_id = UUID(str(reservation_id)) if reservation_id else None
        if not _publication_admitted(campaign_id, organization_id, dispatch_id):
            logger.info("Campaign broker publication deferred: campaign={} code=PUBLICATION_BUDGET_EXHAUSTED", campaign_id)
            return False
        from app.modules.notifications.tasks.email_tasks import process_email_campaign
        # Expiry bounds the executable age, not physical Redis queue length.
        # Provider operations are still independently authorised in the worker.
        process_email_campaign.apply_async(
            args=(str(campaign_id), str(organization_id)),
            kwargs={"reservation_id_str": str(reservation_id) if reservation_id else None,
                    "dispatch_id_str": str(dispatch_id)},
            expires=300,
            retry=False,
        )
        return True
    except Exception as exc:
        # The committed campaign is the durable intent. Scheduled scoped recovery
        # republishes it; provider secrets and broker URLs must not enter logs.
        logger.warning("Campaign broker publication pending: campaign={} error={}",
            campaign_id, type(exc).__name__)
        return False
