"""Bounded internal task probes used by local staging operations checks.

These tasks are not exposed through the API. They make queue-capacity
experiments measurable without mutating business data or requiring a fake
domain workflow.
"""
from __future__ import annotations

import time

from app.core.task_policy import policy_for
from app.worker import celery_app


_CRITICAL_POLICY = policy_for("critical")
_FILES_POLICY = policy_for("files")


def _bounded_delay(seconds: float) -> float:
    return min(max(float(seconds), 0.0), 10.0)


@celery_app.task(
    name="app.tasks.queue_probe.critical_queue_probe",
    bind=True,
    queue=_CRITICAL_POLICY.queue,
    max_retries=0,
    soft_time_limit=10,
    time_limit=15,
    acks_late=True,
)
def critical_queue_probe(self, delay_seconds: float = 0.0) -> dict:
    started = time.perf_counter()
    time.sleep(_bounded_delay(delay_seconds))
    return {
        "queue": _CRITICAL_POLICY.queue,
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
        "task_id": self.request.id,
    }


@celery_app.task(
    name="app.tasks.queue_probe.processing_queue_probe",
    bind=True,
    queue=_FILES_POLICY.queue,
    max_retries=0,
    soft_time_limit=10,
    time_limit=15,
    acks_late=True,
)
def processing_queue_probe(self, delay_seconds: float = 0.0) -> dict:
    started = time.perf_counter()
    time.sleep(_bounded_delay(delay_seconds))
    return {
        "queue": _FILES_POLICY.queue,
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
        "task_id": self.request.id,
    }


@celery_app.task(
    name="app.tasks.queue_probe.crash_recovery_probe",
    bind=True,
    queue=_FILES_POLICY.queue,
    max_retries=0,
    soft_time_limit=30,
    time_limit=45,
    acks_late=True,
)
def crash_recovery_probe(self, delay_seconds: float = 8.0) -> dict:
    """Sleep long enough for an operator to terminate its child process."""
    started = time.perf_counter()
    time.sleep(min(max(float(delay_seconds), 1.0), 30.0))
    return {
        "queue": _FILES_POLICY.queue,
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
        "task_id": self.request.id,
    }
