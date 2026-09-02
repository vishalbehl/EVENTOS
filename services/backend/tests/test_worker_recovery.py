"""Focused proofs for durable worker recovery and replay behavior."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest


@pytest.mark.asyncio
async def test_terminal_upload_replay_is_read_only_and_idempotent(monkeypatch):
    from app.tasks import upload_jobs

    row = type("Upload", (), {"status": "ready", "task_id": "original-task"})()
    commits = 0

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def scalar(self, _statement):
            return row

        async def commit(self):
            nonlocal commits
            commits += 1

    class Factory:
        def __call__(self):
            return Session()

    monkeypatch.setattr(upload_jobs, "AsyncSessionLocal", Factory())
    result = await upload_jobs._process(uuid.uuid4(), uuid.uuid4(), "replayed-task")

    assert result["status"] == "ready"
    assert result["idempotent"] is True
    assert commits == 0
    assert row.task_id == "original-task"


@pytest.mark.asyncio
async def test_exhausted_import_retry_persists_upload_and_job_terminal_state(monkeypatch):
    from app.tasks import upload_jobs

    upload = type(
        "Upload",
        (),
        {"status": "scanning", "task_id": None, "processing_error": None},
    )()
    job = type(
        "ImportJob",
        (),
        {"status": "processing", "error_summary": None, "completed_at": None},
    )()
    commits = 0

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def scalar(self, _statement):
            return upload if not hasattr(self, "looked_up_job") else job

        async def commit(self):
            nonlocal commits
            commits += 1

    original_factory = Session

    class Factory:
        def __call__(self):
            session = original_factory()
            original_scalar = session.scalar

            async def scalar(statement):
                if hasattr(session, "looked_up_upload"):
                    session.looked_up_job = True
                else:
                    session.looked_up_upload = True
                return await original_scalar(statement)

            session.scalar = scalar
            return session

    monkeypatch.setattr(upload_jobs, "AsyncSessionLocal", Factory())
    await upload_jobs._mark_import_failed(
        uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), "failed-task", RuntimeError("storage timeout")
    )

    assert upload.status == "failed"
    assert upload.task_id == "failed-task"
    assert upload.processing_error == "Import upload failed after retries: RuntimeError"
    assert job.status == "failed"
    assert job.completed_at is not None
    assert commits == 1


@pytest.mark.parametrize(
    ("status", "imported", "failed", "total", "expected"),
    [
        ("processing", 25, 5, 100, 30),
        ("completed", 100, 0, 100, 100),
        ("failed", 40, 10, 100, 50),
        ("processing", 0, 0, 0, 0),
    ],
)
def test_import_progress_is_reconstructed_from_durable_counters(
    status, imported, failed, total, expected
):
    from app.core.job_status import job_status_from_import

    job = type(
        "ImportJob",
        (),
        {
            "id": uuid.uuid4(),
            "job_type": "registration_import",
            "status": status,
            "rows_imported": imported,
            "rows_failed": failed,
            "rows_total": total,
            "error_summary": [{"row": 1, "error": "invalid value"}]
            if status == "failed"
            else None,
            "created_at": datetime.now(timezone.utc),
            "completed_at": datetime.now(timezone.utc) if status == "completed" else None,
        },
    )()

    result = job_status_from_import(job)

    assert result.progress == expected
    assert 0 <= result.progress <= 100
    assert result.stage == status
    assert result.error is not None if status == "failed" else result.error is None
