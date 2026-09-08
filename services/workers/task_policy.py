"""Shared retry and timeout policy for the standalone worker package."""

from __future__ import annotations

from dataclasses import dataclass
import random
from typing import Any

from celery.exceptions import Retry
from fastapi import HTTPException


class PermanentTaskError(Exception):
    """A caller-controlled error that must not consume retry capacity."""


@dataclass(frozen=True)
class TaskPolicy:
    queue: str
    soft_timeout_seconds: int
    hard_timeout_seconds: int
    max_retries: int
    backoff_seconds: int
    jitter: bool = True

    def __post_init__(self) -> None:
        if not self.queue.strip():
            raise ValueError("task queue is required")
        if self.soft_timeout_seconds <= 0:
            raise ValueError("soft timeout must be positive")
        if self.hard_timeout_seconds < self.soft_timeout_seconds:
            raise ValueError("hard timeout must not be shorter than soft timeout")
        if self.max_retries < 0 or self.backoff_seconds < 0:
            raise ValueError("retry settings must not be negative")

    def retry_delay(self, retry_number: int, *, apply_jitter: bool = False) -> int:
        delay = self.backoff_seconds * (2 ** max(0, min(int(retry_number), 8)))
        if apply_jitter and self.jitter:
            delay += random.randint(0, max(1, delay // 4))
        return delay


WORKER_POLICIES: dict[str, TaskPolicy] = {
    "critical": TaskPolicy("critical", 60, 75, 8, 5),
    "default": TaskPolicy("default", 300, 360, 3, 10),
    "files": TaskPolicy("files", 600, 660, 3, 10),
    "videos": TaskPolicy("videos", 3600, 3660, 2, 30),
    "imports": TaskPolicy("imports", 1800, 1860, 3, 20),
    "search": TaskPolicy("search", 300, 360, 4, 10),
    "notifications": TaskPolicy("notifications", 120, 150, 5, 15),
    "reports": TaskPolicy("reports", 1800, 1860, 3, 20),
    "reconciliation": TaskPolicy("reconciliation", 1800, 1860, 5, 30),
}


TASK_FAMILY_QUEUES: tuple[tuple[str, str], ...] = (
    ("workers.tasks.file_tasks.", "files"),
    ("workers.tasks.video_tasks.", "videos"),
    ("workers.tasks.import_tasks.", "imports"),
    ("workers.tasks.report_tasks.", "reports"),
    ("workers.tasks.notification_tasks.", "notifications"),
    ("workers.tasks.search_tasks.", "search"),
    ("workers.tasks.sync_tasks.", "default"),
)


def policy_for(queue: str) -> TaskPolicy:
    return WORKER_POLICIES.get(queue, WORKER_POLICIES["default"])


def legacy_queue_for(queue: str) -> str:
    """Namespace legacy worker queues so they cannot steal app tasks."""
    policy = policy_for(queue)
    return f"legacy-{policy.queue}"


def policy_for_task(task_name: str) -> TaskPolicy:
    for prefix, queue in TASK_FAMILY_QUEUES:
        if task_name.startswith(prefix):
            return policy_for(queue)
    return policy_for("default")


def is_retryable(exc: BaseException) -> bool:
    """Retry only failures that can plausibly succeed without new input."""
    if isinstance(exc, Retry):
        return False
    if isinstance(exc, HTTPException):
        return exc.status_code >= 500
    return not isinstance(
        exc,
        (PermanentTaskError, ValueError, PermissionError, FileNotFoundError),
    )


def task_annotations() -> dict[str, dict[str, Any]]:
    """Return Celery annotations for every legacy task family."""
    annotations: dict[str, dict[str, Any]] = {}
    for prefix, queue in TASK_FAMILY_QUEUES:
        policy = policy_for(queue)
        annotations[f"{prefix}*"] = {
            "max_retries": policy.max_retries,
            "default_retry_delay": policy.backoff_seconds,
            "soft_time_limit": policy.soft_timeout_seconds,
            "time_limit": policy.hard_timeout_seconds,
            "acks_late": True,
        }
    return annotations
