from __future__ import annotations

import inspect

from app.worker import record_task_failure, _safe_task_error


def test_task_failure_recording_hashes_arguments_and_bounds_error_text():
    source = inspect.getsource(record_task_failure)
    sanitizer_source = inspect.getsource(_safe_task_error)
    assert "args_hash" in source
    assert "[:1000]" in sanitizer_source
    assert "task_failure_recording_failed" in source


def test_task_failure_error_sanitization_removes_sensitive_values():
    safe = _safe_task_error(
        ValueError("email=user@example.com token=super-secret password=pw123")
    )
    assert "user@example.com" not in safe
    assert "super-secret" not in safe
    assert "pw123" not in safe
    assert "[REDACTED_EMAIL]" in safe


def test_audit_task_sessions_dispose_their_engine():
    import inspect
    from app.tasks import audit_tasks

    source = inspect.getsource(audit_tasks._task_database_session)
    assert "asynccontextmanager" in inspect.getsource(audit_tasks)
    assert "await task_engine.dispose()" in source
    assert "poolclass=NullPool" in source
