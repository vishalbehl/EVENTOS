"""Best-effort dispatch for durable analytics projection refreshes."""

import logging
import uuid

logger = logging.getLogger(__name__)


def enqueue_event_registration_projection_refresh(
    *,
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
) -> bool:
    """Queue a refresh after commit without making the command fail post-commit.

    The projection task is deliberately dispatched outside the database
    transaction. PostgreSQL remains authoritative; a later retry/rebuild can
    repair a projection if the broker is temporarily unavailable.
    """
    try:
        from app.worker import celery_app

        celery_app.send_task(
            "app.tasks.analytics_projection_tasks.refresh_event_registration_summary",
            kwargs={
                "organization_id": str(organization_id),
                "event_id": str(event_id),
            },
            queue="reports",
        )
        return True
    except Exception as exc:
        # Keep broker failures actionable without logging tenant identifiers.
        logger.warning(
            "analytics_projection_dispatch_failed error_type=%s",
            type(exc).__name__,
        )
        return False


def enqueue_event_attendance_projection_refresh(
    *, organization_id: uuid.UUID, event_id: uuid.UUID
) -> bool:
    """Queue attendance projection refresh after a committed check-in change."""
    try:
        from app.worker import celery_app

        celery_app.send_task(
            "app.tasks.attendance_projection_tasks.refresh_event_attendance_summary",
            kwargs={"organization_id": str(organization_id), "event_id": str(event_id)},
            queue="reports",
        )
        return True
    except Exception as exc:
        logger.warning("analytics_attendance_projection_dispatch_failed error_type=%s", type(exc).__name__)
        return False


def enqueue_event_payment_projection_refresh(
    *, organization_id: uuid.UUID, event_id: uuid.UUID
) -> bool:
    """Queue payment projection refresh after a committed payment change."""
    try:
        from app.worker import celery_app

        celery_app.send_task(
            "app.tasks.payment_projection_tasks.refresh_event_payment_summary",
            kwargs={"organization_id": str(organization_id), "event_id": str(event_id)},
            queue="reports",
        )
        return True
    except Exception as exc:
        logger.warning("analytics_payment_projection_dispatch_failed error_type=%s", type(exc).__name__)
        return False


def enqueue_event_speaker_projection_refresh(
    *, organization_id: uuid.UUID, event_id: uuid.UUID
) -> bool:
    """Queue speaker projection refresh after a committed speaker/file change."""
    try:
        from app.worker import celery_app

        celery_app.send_task(
            "app.tasks.speaker_projection_tasks.refresh_event_speaker_summary",
            kwargs={"organization_id": str(organization_id), "event_id": str(event_id)},
            queue="reports",
        )
        return True
    except Exception as exc:
        logger.warning("analytics_speaker_projection_dispatch_failed error_type=%s", type(exc).__name__)
        return False
