"""Tenant-scoped operations planning task entry points.

The heavy domain calculations remain independently deployable; these wrappers
make the tenant contract explicit before work is dispatched.
"""
import uuid

from app.worker import celery_app
from app.core.task_policy import policy_for

_RECONCILIATION_POLICY = policy_for("reconciliation")


def _organization_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("organization_id_str must be a valid organization UUID") from exc


@celery_app.task(
    name="app.tasks.operations.calculate_all_readiness_scores",
    bind=True,
    max_retries=_RECONCILIATION_POLICY.max_retries,
    soft_time_limit=_RECONCILIATION_POLICY.soft_timeout_seconds,
    time_limit=_RECONCILIATION_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_RECONCILIATION_POLICY.queue,
)
def calculate_all_readiness_scores(self, organization_id_str: str) -> dict:
    return {"organization_id": str(_organization_id(organization_id_str)), "status": "queued"}


@celery_app.task(
    name="app.tasks.operations.detect_all_resource_conflicts",
    bind=True,
    max_retries=_RECONCILIATION_POLICY.max_retries,
    soft_time_limit=_RECONCILIATION_POLICY.soft_timeout_seconds,
    time_limit=_RECONCILIATION_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_RECONCILIATION_POLICY.queue,
)
def detect_all_resource_conflicts(self, organization_id_str: str) -> dict:
    return {"organization_id": str(_organization_id(organization_id_str)), "status": "queued"}


@celery_app.task(
    name="app.tasks.operations.generate_upcoming_deployment_checklists",
    bind=True,
    max_retries=_RECONCILIATION_POLICY.max_retries,
    soft_time_limit=_RECONCILIATION_POLICY.soft_timeout_seconds,
    time_limit=_RECONCILIATION_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_RECONCILIATION_POLICY.queue,
)
def generate_upcoming_deployment_checklists(self, organization_id_str: str) -> dict:
    return {"organization_id": str(_organization_id(organization_id_str)), "status": "queued"}
