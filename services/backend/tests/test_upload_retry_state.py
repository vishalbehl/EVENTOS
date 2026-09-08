from app.core.task_policy import PermanentTaskError, is_retryable


def test_upload_task_has_durable_retry_exhaustion_handler():
    from app.tasks import upload_jobs

    source = upload_jobs._mark_upload_failed.__doc__ or ""
    assert "terminal failure" in source


import uuid
import pytest


@pytest.mark.asyncio
async def test_retry_exhaustion_marks_nonterminal_upload_failed(monkeypatch):
    from app.tasks import upload_jobs

    class Row:
        status = "processing"
        task_id = None
        processing_error = None

    row = Row()
    committed = False

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def scalar(self, _statement):
            return row

        async def flush(self):
            return None

        async def commit(self):
            nonlocal committed
            committed = True

    class Factory:
        def __call__(self):
            return Session()

    monkeypatch.setattr(upload_jobs, "AsyncSessionLocal", Factory())
    upload_id = uuid.uuid4()
    organization_id = uuid.uuid4()
    await upload_jobs._mark_upload_failed(
        upload_id, organization_id, "task-1", RuntimeError("storage timeout")
    )

    assert row.status == "failed"
    assert row.task_id == "task-1"
    assert row.processing_error == "Processing failed after retries: RuntimeError"
    assert committed is True


def test_transient_upload_dependencies_are_retryable():
    assert is_retryable(RuntimeError("clamd unavailable")) is True


def test_upload_validation_errors_are_terminal():
    assert is_retryable(PermanentTaskError("invalid upload")) is False
    assert is_retryable(ValueError("invalid checksum")) is False
