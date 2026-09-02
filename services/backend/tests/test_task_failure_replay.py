from __future__ import annotations

import inspect
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest


def test_replay_payload_is_allow_listed_and_identifier_only():
    from app.core.task_replay import replay_payload_for

    upload_id = uuid.uuid4()
    organization_id = uuid.uuid4()
    payload = replay_payload_for(
        "app.tasks.process_durable_upload",
        [upload_id, organization_id],
        {},
    )

    assert payload == {
        "queue": "files",
        "args": [str(upload_id), str(organization_id)],
    }

    named_payload = replay_payload_for(
        "app.tasks.analytics_projection_tasks.refresh_event_registration_summary",
        [],
        {"organization_id": organization_id, "event_id": upload_id},
    )
    assert named_payload == {
        "queue": "reports",
        "args": [str(organization_id), str(upload_id)],
    }


def test_replay_payload_rejects_unknown_tasks_and_arbitrary_arguments():
    from app.core.task_replay import replay_payload_for

    assert replay_payload_for("app.tasks.unknown", ["secret"], {}) is None
    assert replay_payload_for("app.tasks.process_durable_upload", ["id"], {}) is None
    assert replay_payload_for(
        "app.tasks.process_durable_upload",
        ["not-a-uuid", str(uuid.uuid4())],
        {},
    ) is None
    assert replay_payload_for(
        "app.tasks.process_durable_upload",
        ["id", "organization"],
        {"token": "must-not-persist"},
    ) is None
    assert replay_payload_for(
        "app.tasks.analytics_projection_tasks.refresh_event_registration_summary",
        [],
        {"organization_id": str(uuid.uuid4()), "token": "must-not-persist"},
    ) is None


def test_task_failure_model_contains_durable_replay_state():
    from app.modules.operations_control.models import TaskFailure

    columns = set(TaskFailure.__table__.columns.keys())
    assert {"replay_queue", "replay_args", "replay_count", "last_replayed_at"} <= columns


def test_replay_route_is_superadmin_and_idempotency_protected():
    from app.modules.operations_control import router

    source = inspect.getsource(router.replay_task_failure)
    assert "require_super_admin" in source
    assert "Idempotency-Key" in source
    assert "replay_task_failure" in source


@pytest.mark.asyncio
async def test_replay_command_dispatches_allowlisted_payload_once(monkeypatch):
    from app.modules.operations_control.application import commands

    organization_id = uuid.uuid4()
    failure_id = uuid.uuid4()
    actor = SimpleNamespace(id=uuid.uuid4(), platform_role="super_admin", role="admin")
    failure = SimpleNamespace(
        id=failure_id,
        organization_id=organization_id,
        status="FAILED",
        task_id="failed-task",
        task_name="app.tasks.process_durable_upload",
        replay_queue="files",
        replay_args=[str(uuid.uuid4()), str(organization_id)],
        replay_count=0,
        last_replayed_at=None,
    )
    control = SimpleNamespace(successor_job_id=f"replay-{failure_id}-1", status="DISPATCHING")
    db = SimpleNamespace(
        scalar=AsyncMock(side_effect=[failure, None, control]),
        add=Mock(),
        commit=AsyncMock(),
    )
    sender = Mock()
    monkeypatch.setattr(commands, "celery_app", SimpleNamespace(send_task=sender))

    result = await commands.OperationsControlCommandService(db).replay_task_failure(
        actor=actor,
        failure_id=failure_id,
        organization_id=organization_id,
        reason="Recover this failed processing task safely",
        idempotency_key="replay-key-001",
    )

    assert result["status"] == "QUEUED"
    assert result["replayed"] is False
    sender.assert_called_once_with(
        "app.tasks.process_durable_upload",
        args=failure.replay_args,
        queue="files",
        task_id=f"replay-{failure_id}-1",
    )
    assert failure.status == "REPLAY_QUEUED"
    assert failure.replay_count == 1
    assert db.commit.await_count == 2
