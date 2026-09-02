import uuid
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.modules.analytics.services.projection_dispatch import (
    enqueue_event_registration_projection_refresh,
    enqueue_event_speaker_projection_refresh,
)


def test_projection_dispatch_uses_reports_queue_and_verified_ids():
    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()
    celery = SimpleNamespace(send_task=Mock())

    with patch("app.worker.celery_app", celery):
        assert enqueue_event_registration_projection_refresh(
            organization_id=organization_id,
            event_id=event_id,
        ) is True

    celery.send_task.assert_called_once_with(
        "app.tasks.analytics_projection_tasks.refresh_event_registration_summary",
        kwargs={
            "organization_id": str(organization_id),
            "event_id": str(event_id),
        },
        queue="reports",
    )


def test_projection_dispatch_is_best_effort_when_broker_is_unavailable():
    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()
    celery = SimpleNamespace(send_task=Mock(side_effect=RuntimeError("down")))

    with patch("app.worker.celery_app", celery):
        assert enqueue_event_registration_projection_refresh(
            organization_id=organization_id,
            event_id=event_id,
        ) is False


def test_speaker_projection_dispatch_uses_reports_queue_and_is_best_effort():
    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()
    celery = SimpleNamespace(send_task=Mock())
    with patch("app.worker.celery_app", celery):
        assert enqueue_event_speaker_projection_refresh(
            organization_id=organization_id, event_id=event_id
        ) is True
    celery.send_task.assert_called_once_with(
        "app.tasks.speaker_projection_tasks.refresh_event_speaker_summary",
        kwargs={"organization_id": str(organization_id), "event_id": str(event_id)},
        queue="reports",
    )
