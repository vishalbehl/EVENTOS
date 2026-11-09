"""Best-effort telemetry publication never extends request latency."""
from __future__ import annotations

import asyncio
from contextlib import contextmanager
import threading

import pytest

from app.core import bounded_task_dispatch as dispatch


class Task:
    name = "tests.best_effort"

    def __init__(self, publish):
        self.publish = publish

    def apply_async(self, **options):
        return self.publish(**options)


async def _wait_until(predicate, *, timeout=3):
    async def wait():
        while not predicate():
            await asyncio.sleep(0.01)

    await asyncio.wait_for(wait(), timeout)


@pytest.fixture
def connection(monkeypatch):
    from app.worker import celery_app

    @contextmanager
    def open_connection(**options):
        assert options["connect_timeout"] == 3
        assert options["transport_options"]["max_retries"] == 0
        yield object()

    monkeypatch.setattr(celery_app, "connection_for_write", open_connection)


@pytest.mark.asyncio
async def test_slow_publication_returns_after_bounded_admission(connection):
    started, release = threading.Event(), threading.Event()

    def blocked(**options):
        started.set()
        assert release.wait(5)

    try:
        started_at = asyncio.get_running_loop().time()
        assert dispatch.admit_best_effort_celery_task(
            Task(blocked), args=({"safe": True},))
        assert asyncio.get_running_loop().time() - started_at < 0.25
        assert await asyncio.to_thread(started.wait, 3)
    finally:
        release.set()
        await _wait_until(lambda: not dispatch._FUTURES)


@pytest.mark.asyncio
async def test_publication_is_bounded_and_preserves_safe_payload(connection, monkeypatch):
    semaphore = threading.BoundedSemaphore(1)
    monkeypatch.setattr(dispatch, "_SLOTS", semaphore)
    started, release = threading.Event(), threading.Event()
    observed = []

    def blocked(**options):
        observed.append(options)
        started.set()
        assert release.wait(5)

    try:
        assert dispatch.admit_best_effort_celery_task(Task(blocked), args=("payload",))
        assert await asyncio.to_thread(started.wait, 3)
        assert not dispatch.admit_best_effort_celery_task(Task(blocked), args=("second",))
    finally:
        release.set()
        await _wait_until(lambda: not dispatch._FUTURES)

    assert observed[0]["args"] == ("payload",)
    assert observed[0]["kwargs"] == {}
    assert observed[0]["retry"] is False

