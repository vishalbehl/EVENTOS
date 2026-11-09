"""Dispatch uses bounded real threads; database durability stays with callers."""
import asyncio
from contextlib import contextmanager
import threading
import socket
import uuid

import pytest

from app.modules.registration.services import managed_registration_uploads as service


async def _wait_until(predicate, *, timeout=3):
    async def wait():
        while not predicate():
            await asyncio.sleep(0.01)
    await asyncio.wait_for(wait(), timeout)


async def _wait_for_dispatches_to_finish(*, timeout=3):
    def idle():
        with service._DISPATCH_FUTURES_LOCK:
            return not service._DISPATCH_FUTURES
    await _wait_until(idle, timeout=timeout)


@pytest.fixture
def publisher(monkeypatch):
    from app.tasks.upload_jobs import process_durable_upload
    from app.worker import celery_app
    observations = []
    @contextmanager
    def connection(**kwargs):
        assert kwargs["connect_timeout"] == 3
        assert kwargs["transport_options"]["max_retries"] == 0
        yield object()
    monkeypatch.setattr(celery_app, "connection_for_write", connection)
    def publish(**kwargs):
        observations.append((threading.get_ident(), kwargs))
    monkeypatch.setattr(process_durable_upload, "apply_async", publish)
    return process_durable_upload, observations


@pytest.mark.asyncio
async def test_publish_is_off_loop_and_tenant_bound(publisher):
    owner, upload = uuid.uuid4(), uuid.uuid4()
    loop_thread = threading.get_ident()
    assert await service.dispatch_committed_registration_upload(upload_id=upload, organization_id=owner)
    await _wait_for_dispatches_to_finish()
    (_, calls) = publisher
    assert len(calls) == 1 and calls[0][0] != loop_thread
    assert calls[0][1]["args"] == (str(upload), str(owner))
    assert calls[0][1]["headers"] == {"tenant_org_id": str(owner)}
    assert calls[0][1]["retry"] is False


@pytest.mark.asyncio
async def test_broker_failure_is_left_for_recovery_without_inline_retry(publisher, monkeypatch):
    calls = []
    def unavailable(**kwargs):
        calls.append(kwargs)
        raise ConnectionError("synthetic broker interruption")
    monkeypatch.setattr(publisher[0], "apply_async", unavailable)
    assert await service.dispatch_committed_registration_upload(upload_id=uuid.uuid4(), organization_id=uuid.uuid4())
    await _wait_for_dispatches_to_finish()
    assert len(calls) == 1 and calls[0]["retry"] is False


@pytest.mark.asyncio
async def test_dispatch_has_eight_slot_bound_without_wait_queue(publisher, monkeypatch):
    semaphore = threading.BoundedSemaphore(8)
    monkeypatch.setattr(service, "_DISPATCH_SLOTS", semaphore)
    started, release, lock = threading.Event(), threading.Event(), threading.Lock()
    count = 0
    def blocked(**kwargs):
        nonlocal count
        with lock:
            count += 1
            if count == 8:
                started.set()
        assert release.wait(5)
    monkeypatch.setattr(publisher[0], "apply_async", blocked)
    admitted = [await service.dispatch_committed_registration_upload(
        upload_id=uuid.uuid4(), organization_id=uuid.uuid4()) for _ in range(8)]
    try:
        assert await asyncio.to_thread(started.wait, 3)
        assert not await service.dispatch_committed_registration_upload(upload_id=uuid.uuid4(), organization_id=uuid.uuid4())
        assert count == 8
    finally:
        release.set()
        await _wait_for_dispatches_to_finish()
    assert all(admitted)


@pytest.mark.asyncio
async def test_returned_request_does_not_release_running_publish_slot(publisher, monkeypatch):
    semaphore = threading.BoundedSemaphore(1)
    monkeypatch.setattr(service, "_DISPATCH_SLOTS", semaphore)
    started, release, finished = threading.Event(), threading.Event(), threading.Event()
    def blocked(**kwargs):
        started.set()
        try:
            assert release.wait(5)
        finally:
            finished.set()
    monkeypatch.setattr(publisher[0], "apply_async", blocked)
    admitted = await service.dispatch_committed_registration_upload(
        upload_id=uuid.uuid4(), organization_id=uuid.uuid4())
    try:
        assert await asyncio.to_thread(started.wait, 3)
        assert admitted
        assert not await service.dispatch_committed_registration_upload(upload_id=uuid.uuid4(), organization_id=uuid.uuid4())
    finally:
        release.set()
        assert await asyncio.to_thread(finished.wait, 3)
    # The semaphore release happens after the provider returns, not on cancel.
    async def released():
        while not semaphore.acquire(blocking=False):
            await asyncio.sleep(0)
        semaphore.release()
    await asyncio.wait_for(released(), 3)


@pytest.mark.asyncio
async def test_slow_publish_does_not_delay_committed_request(publisher, monkeypatch):
    semaphore = threading.BoundedSemaphore(1)
    monkeypatch.setattr(service, "_DISPATCH_SLOTS", semaphore)
    started, release = threading.Event(), threading.Event()

    def blocked(**kwargs):
        started.set()
        assert release.wait(5)

    monkeypatch.setattr(publisher[0], "apply_async", blocked)
    try:
        admitted = await asyncio.wait_for(service.dispatch_committed_registration_upload(
            upload_id=uuid.uuid4(), organization_id=uuid.uuid4()), 0.25)
        assert admitted
        assert await asyncio.to_thread(started.wait, 3)
    finally:
        release.set()
        await _wait_for_dispatches_to_finish()


@pytest.mark.asyncio
async def test_executor_rejection_retains_durable_pending_contract(publisher, monkeypatch):
    semaphore = threading.BoundedSemaphore(1)
    monkeypatch.setattr(service, "_DISPATCH_SLOTS", semaphore)
    def stopped(*args, **kwargs):
        raise RuntimeError("executor shutting down")
    monkeypatch.setattr(asyncio.get_running_loop(), "run_in_executor", stopped)
    assert not await service.dispatch_committed_registration_upload(upload_id=uuid.uuid4(), organization_id=uuid.uuid4())
    assert semaphore.acquire(blocking=False)
    semaphore.release()


@pytest.mark.asyncio
async def test_real_broker_connection_failure_is_bounded_and_pending(monkeypatch):
    """Real Redis transport to an owned TCP peer that closes connections."""
    from kombu import Connection
    from app.worker import celery_app
    # Do not let the database suite's eager-mode fixture replace broker IO.
    monkeypatch.setattr(celery_app.conf, "task_always_eager", False)
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    listener.settimeout(0.2)
    port = listener.getsockname()[1]
    stopped, contacted = threading.Event(), threading.Event()
    def reject_connections():
        while not stopped.is_set():
            try:
                peer, _ = listener.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            contacted.set()
            peer.close()
    peer_thread = threading.Thread(target=reject_connections, daemon=True)
    peer_thread.start()
    def broker_connection(**kwargs):
        return Connection(f"redis://127.0.0.1:{port}/0", **kwargs)
    monkeypatch.setattr(celery_app, "connection_for_write", broker_connection)
    try:
        assert await asyncio.wait_for(service.dispatch_committed_registration_upload(
            upload_id=uuid.uuid4(), organization_id=uuid.uuid4()), 0.25)
        assert await asyncio.to_thread(contacted.wait, 8), \
            "The real transport must contact the isolated failure endpoint"
        await _wait_for_dispatches_to_finish(timeout=8)
    finally:
        stopped.set()
        listener.close()
        await asyncio.to_thread(peer_thread.join, 1)
        assert not peer_thread.is_alive()
