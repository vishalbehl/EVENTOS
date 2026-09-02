from __future__ import annotations

from dataclasses import dataclass
import random
from typing import Type

from fastapi import HTTPException


class PermanentTaskError(Exception):
    """Validation, authorization, or malformed-input failure; never retry."""


@dataclass(frozen=True)
class TaskPolicy:
    queue: str = "default"
    soft_timeout_seconds: int = 300
    hard_timeout_seconds: int = 360
    max_retries: int = 3
    backoff_seconds: int = 10
    jitter: bool = True

    def __post_init__(self) -> None:
        if not self.queue.strip():
            raise ValueError("task queue name is required")
        if self.soft_timeout_seconds <= 0 or self.hard_timeout_seconds <= 0:
            raise ValueError("task timeouts must be positive")
        if self.hard_timeout_seconds < self.soft_timeout_seconds:
            raise ValueError("hard timeout must not be shorter than soft timeout")
        if self.max_retries < 0 or self.backoff_seconds < 0:
            raise ValueError("retry limits and backoff must not be negative")

    def retry_delay(self, retry_number: int, *, apply_jitter: bool = False) -> int:
        delay = self.backoff_seconds * (2 ** max(0, min(retry_number, 8)))
        if apply_jitter and self.jitter:
            delay += random.randint(0, max(1, delay // 4))
        return delay


TASK_POLICIES = {
    "critical": TaskPolicy(queue="critical", soft_timeout_seconds=60, hard_timeout_seconds=75, max_retries=8, backoff_seconds=5),
    "files": TaskPolicy(queue="files", soft_timeout_seconds=600, hard_timeout_seconds=660, max_retries=3),
    "videos": TaskPolicy(queue="videos", soft_timeout_seconds=3600, hard_timeout_seconds=3660, max_retries=2, backoff_seconds=30),
    "imports": TaskPolicy(queue="imports", soft_timeout_seconds=1800, hard_timeout_seconds=1860, max_retries=3, backoff_seconds=20),
    "notifications": TaskPolicy(queue="notifications", soft_timeout_seconds=120, hard_timeout_seconds=150, max_retries=5, backoff_seconds=15),
    "reports": TaskPolicy(queue="reports", soft_timeout_seconds=1800, hard_timeout_seconds=1860, max_retries=3, backoff_seconds=20),
    "search": TaskPolicy(queue="search", soft_timeout_seconds=300, hard_timeout_seconds=360, max_retries=4, backoff_seconds=10),
    "reconciliation": TaskPolicy(queue="reconciliation", soft_timeout_seconds=1800, hard_timeout_seconds=1860, max_retries=5, backoff_seconds=30),
    "default": TaskPolicy(),
}


def policy_for(queue: str) -> TaskPolicy:
    return TASK_POLICIES.get(queue, TASK_POLICIES["default"])


def is_retryable(exc: BaseException) -> bool:
    """Classify failures without retrying caller-controlled invalid work.

    Celery tasks commonly surface FastAPI validation errors from shared
    application services. Retrying a 4xx cannot change the input and only
    consumes worker capacity; 5xx responses remain eligible for retry because
    they represent a transient or server-side condition.
    """
    if isinstance(exc, HTTPException):
        return exc.status_code >= 500
    return not isinstance(
        exc,
        (PermanentTaskError, ValueError, PermissionError, FileNotFoundError),
    )
