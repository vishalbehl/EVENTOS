from __future__ import annotations

from contextlib import contextmanager
import json
from unittest.mock import MagicMock
import uuid


def test_legacy_task_families_have_explicit_bounded_annotations():
    from workers.celery_app import app
    from workers.task_policy import policy_for_task

    annotations = app.conf.task_annotations
    for family in (
        "file_tasks",
        "video_tasks",
        "import_tasks",
        "report_tasks",
        "notification_tasks",
        "search_tasks",
        "sync_tasks",
    ):
        prefix = f"workers.tasks.{family}."
        policy = policy_for_task(prefix)
        values = annotations[f"{prefix}*"]
        assert values["max_retries"] == policy.max_retries
        assert values["soft_time_limit"] == policy.soft_timeout_seconds
        assert values["time_limit"] == policy.hard_timeout_seconds
        assert values["acks_late"] is True


def test_policy_task_is_the_default_and_rejects_lost_messages():
    from workers.celery_app import PolicyTask, app

    # Celery materializes a concrete subclass around the configured task base.
    assert issubclass(app.Task, PolicyTask)
    assert app.conf.task_acks_late is True
    assert app.conf.task_reject_on_worker_lost is True
    assert app.conf.task_create_missing_queues is False


def test_legacy_task_families_use_isolated_queue_namespace():
    from workers.celery_app import app

    routes = app.conf.task_routes
    assert routes["workers.tasks.file_tasks.*"]["queue"] == "legacy-files"
    assert routes["workers.tasks.video_tasks.*"]["queue"] == "legacy-videos"
    assert routes["workers.tasks.report_tasks.*"]["queue"] == "legacy-reports"
    configured = {queue.name for queue in app.conf.task_queues}
    assert "legacy-files" in configured
    assert "files" not in configured


def test_dead_letter_persists_only_sanitized_failure_metadata(monkeypatch):
    from workers.db import get_db_session as real_get_db_session
    from workers.lib.dead_letter import record_dead_letter

    del real_get_db_session
    db = MagicMock()

    @contextmanager
    def fake_session():
        yield db

    monkeypatch.setattr("workers.db.get_db_session", fake_session)
    organization_id = uuid.uuid4()
    file_id = uuid.uuid4()
    record_dead_letter(
        task_id="legacy-task-001",
        task_name="workers.tasks.file_tasks.validate_presentation_file",
        retries=3,
        exception=RuntimeError("token=super-secret recipient=person@example.com"),
        args=[str(file_id), str(organization_id)],
        kwargs={},
    )

    params = db.execute.call_args.args[1]
    assert params["organization_id"] == str(organization_id)
    assert "super-secret" not in params["error_message"]
    assert "person@example.com" not in params["error_message"]
    assert params["replay_queue"] == "legacy-files"
    assert json.loads(params["replay_args"]) == [str(file_id), str(organization_id)]


def test_dead_letter_does_not_store_untrusted_payload_for_replay(monkeypatch):
    from workers.lib.dead_letter import record_dead_letter

    db = MagicMock()

    @contextmanager
    def fake_session():
        yield db

    monkeypatch.setattr("workers.db.get_db_session", fake_session)
    record_dead_letter(
        task_id="legacy-task-002",
        task_name="workers.tasks.notification_tasks.send_email",
        retries=1,
        exception=RuntimeError("provider unavailable"),
        args=["person@example.com", "Subject", "secret body"],
        kwargs={},
    )

    params = db.execute.call_args.args[1]
    assert params["replay_queue"] is None
    assert params["replay_args"] is None
    assert "person@example.com" not in params["error_message"]
