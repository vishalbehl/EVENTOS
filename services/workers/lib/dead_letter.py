"""Durable, sanitized terminal failure records for standalone workers."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any
import uuid


_SENSITIVE_VALUE_RE = re.compile(
    r"(?i)(password|passwd|secret|token|api[_-]?key|authorization|cookie)"
    r"\s*[:=]\s*([^\s,;]+)"
)
_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)


def sanitize_failure_text(value: Any, *, limit: int = 1000) -> str:
    """Keep diagnostics useful while excluding common credential/identity data."""
    text = str(value or "Task failed")
    text = _SENSITIVE_VALUE_RE.sub(r"\1=[REDACTED]", text)
    text = _EMAIL_RE.sub("[REDACTED_EMAIL]", text)
    return text[:limit]


# Only positional/keyword payloads consisting entirely of UUIDs can be replayed.
# Requests containing names, URLs, message bodies, or credentials are never
# copied into the durable failure row.
_REPLAYABLE: dict[str, tuple[str, tuple[str, ...]]] = {
    "workers.tasks.file_tasks.validate_presentation_file": ("files", ("file_id", "organization_id")),
    "workers.tasks.file_tasks.generate_file_thumbnail": ("files", ("file_id", "organization_id")),
    "workers.tasks.file_tasks.convert_presentation_to_pdf": ("files", ("file_id", "organization_id")),
    "workers.tasks.video_tasks.normalise_video_file": ("videos", ("file_id", "organization_id")),
    "workers.tasks.video_tasks.extract_video_metadata": ("videos", ("file_id", "organization_id")),
    "workers.tasks.report_tasks.generate_event_summary_report": (
        "reports", ("event_id", "organization_id", "requested_by_user_id")
    ),
    "workers.tasks.report_tasks.generate_session_readiness_csv": (
        "reports", ("event_id", "organization_id")
    ),
    "workers.tasks.report_tasks.generate_organization_console_export": (
        "reports", ("organization_id", "requested_by_user_id", "export_id")
    ),
}


def _uuid_only(values: list[Any]) -> list[str] | None:
    result: list[str] = []
    for value in values:
        try:
            result.append(str(uuid.UUID(str(value))))
        except (AttributeError, TypeError, ValueError):
            return None
    return result


def replay_payload_for(
    task_name: str,
    args: tuple[Any, ...] | list[Any] | None,
    kwargs: dict[str, Any] | None,
) -> tuple[str, list[str]] | None:
    spec = _REPLAYABLE.get(task_name)
    if spec is None:
        return None
    queue, names = spec
    positional = list(args or [])
    named = kwargs or {}
    if positional and named:
        return None
    if named:
        if set(named) != set(names):
            return None
        values = [named[name] for name in names]
    else:
        if len(positional) != len(names):
            return None
        values = positional
    normalized = _uuid_only(values)
    if normalized is None:
        return None
    from workers.task_policy import legacy_queue_for

    return legacy_queue_for(queue), normalized


def _organization_id(task_name: str, args: list[Any], kwargs: dict[str, Any]) -> uuid.UUID | None:
    value = kwargs.get("organization_id") or kwargs.get("org_id")
    if value is None:
        if "organization_console_export" in task_name and args:
            value = args[0]
        elif len(args) >= 2:
            value = args[1]
    try:
        return uuid.UUID(str(value)) if value is not None else None
    except (AttributeError, TypeError, ValueError):
        return None


def record_dead_letter(
    *,
    task_id: str | None,
    task_name: str,
    retries: int,
    exception: BaseException | None,
    args: tuple[Any, ...] | list[Any] | None,
    kwargs: dict[str, Any] | None,
) -> None:
    """Upsert one bounded terminal failure row; never alter task semantics."""
    if not task_id:
        return
    positional = list(args or [])
    named = kwargs or {}
    payload_hash = hashlib.sha256(
        json.dumps({"args": positional, "kwargs": named}, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()
    replay = replay_payload_for(task_name, positional, named)
    organization_id = _organization_id(task_name, positional, named)

    try:
        from sqlalchemy import text
        from workers.db import get_db_session

        replay_queue, replay_args = replay or (None, None)
        with get_db_session() as db:
            db.execute(
                text(
                    """
                    INSERT INTO operations.task_failures
                        (id, task_id, task_name, organization_id, status,
                         retry_count, exception_type, error_message, args_hash,
                         replay_queue, replay_args, replay_count, created_at)
                    VALUES
                        (:id, :task_id, :task_name, :organization_id, 'FAILED',
                         :retry_count, :exception_type, :error_message, :args_hash,
                         :replay_queue, CAST(:replay_args AS jsonb), 0, CURRENT_TIMESTAMP)
                    ON CONFLICT (task_id) DO UPDATE SET
                        status = 'FAILED',
                        retry_count = GREATEST(operations.task_failures.retry_count, EXCLUDED.retry_count),
                        exception_type = EXCLUDED.exception_type,
                        error_message = EXCLUDED.error_message,
                        args_hash = EXCLUDED.args_hash,
                        replay_queue = COALESCE(EXCLUDED.replay_queue, operations.task_failures.replay_queue),
                        replay_args = COALESCE(EXCLUDED.replay_args, operations.task_failures.replay_args)
                    """
                ),
                {
                    "id": str(uuid.uuid4()),
                    "task_id": str(task_id)[:255],
                    "task_name": str(task_name or "unknown")[:255],
                    "organization_id": str(organization_id) if organization_id else None,
                    "retry_count": max(0, int(retries or 0)),
                    "exception_type": type(exception).__name__ if exception else "UnknownError",
                    "error_message": sanitize_failure_text(exception),
                    "args_hash": payload_hash,
                    "replay_queue": replay_queue,
                    "replay_args": json.dumps(replay_args) if replay_args else None,
                },
            )
    except Exception:
        # Failure persistence is observability. It must never crash a worker or
        # turn a successfully retried task into a different outcome.
        return
