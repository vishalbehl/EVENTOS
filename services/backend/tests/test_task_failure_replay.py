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


def test_replay_payload_allows_only_backend_identifier_tasks():
    from app.core.task_replay import replay_payload_for

    asset_id = uuid.uuid4()
    organization_id = uuid.uuid4()
    payload = replay_payload_for(
        "app.tasks.scan_asset_for_viruses",
        [asset_id, organization_id],
        {},
    )
    assert payload == {
        "queue": "files",
        "args": [str(asset_id), str(organization_id)],
    }


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


def test_operations_and_workflow_task_families_have_bounded_replay_contracts():
    from app.core.task_replay import replay_payload_for

    organization_id = str(uuid.uuid4())
    for task_name in (
        "app.tasks.operations.calculate_all_readiness_scores",
        "app.tasks.operations.detect_all_resource_conflicts",
        "app.tasks.operations.generate_upcoming_deployment_checklists",
        "app.tasks.workflow_jobs.check_expired_approvals",
        "app.tasks.workflow_jobs.check_escalations",
        "app.tasks.workflow_jobs.send_reminders",
    ):
        payload = replay_payload_for(task_name, [organization_id], {})
        assert payload is not None
        assert payload["args"] == [organization_id]


def test_notification_task_families_require_only_identifier_payloads():
    from app.core.task_replay import replay_payload_for

    batch_id = str(uuid.uuid4())
    organization_id = str(uuid.uuid4())
    campaign_id = str(uuid.uuid4())
    assert replay_payload_for(
        "app.tasks.dispatch_communication_batch",
        [batch_id, organization_id],
        {},
    )["args"] == [batch_id, organization_id]
    assert replay_payload_for(
        "app.tasks.process_email_campaign",
        [campaign_id, organization_id],
        {},
    )["args"] == [campaign_id, organization_id]


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


@pytest.mark.asyncio
async def test_replay_command_replays_duplicate_operator_request_without_second_dispatch(monkeypatch):
    from app.modules.operations_control.application import commands

    organization_id = uuid.uuid4()
    failure_id = uuid.uuid4()
    actor = SimpleNamespace(id=uuid.uuid4(), platform_role="super_admin", role="admin")
    failure = SimpleNamespace(
        id=failure_id,
        organization_id=organization_id,
        status="FAILED",
        task_id="failed-task-duplicate",
        task_name="app.tasks.process_durable_upload",
        replay_queue="files",
        replay_args=[str(uuid.uuid4()), str(organization_id)],
        replay_count=0,
        last_replayed_at=None,
    )
    control = SimpleNamespace(
        successor_job_id=f"replay-{failure_id}-1",
        status="DISPATCHING",
        request_hash=commands._fingerprint({
            "failure_id": str(failure_id),
            "organization_id": str(organization_id),
            "reason": "Recover this failed processing task safely",
            "operation": "REPLAY_TASK_FAILURE",
        }),
    )
    db = SimpleNamespace(
        scalar=AsyncMock(side_effect=[failure, None, control, failure, control]),
        add=Mock(),
        commit=AsyncMock(),
    )
    sender = Mock()
    monkeypatch.setattr(commands, "celery_app", SimpleNamespace(send_task=sender))

    service = commands.OperationsControlCommandService(db)
    first = await service.replay_task_failure(
        actor=actor,
        failure_id=failure_id,
        organization_id=organization_id,
        reason="Recover this failed processing task safely",
        idempotency_key="replay-key-duplicate-001",
    )
    second = await service.replay_task_failure(
        actor=actor,
        failure_id=failure_id,
        organization_id=organization_id,
        reason="Recover this failed processing task safely",
        idempotency_key="replay-key-duplicate-001",
    )

    assert first["job_id"] == second["job_id"] == control.successor_job_id
    assert first["replayed"] is False
    assert second["replayed"] is True
    sender.assert_called_once()
