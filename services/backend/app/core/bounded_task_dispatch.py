"""Bounded, non-blocking publication for non-authoritative Celery nudges.

Business mutations and mandatory audits must commit transactionally before this
helper is used. This module is only for best-effort notifications whose loss is
acceptable or whose authoritative state has a separate recovery path.
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
import threading
from typing import Any, Iterable, Mapping

from loguru import logger


_MAX_IN_FLIGHT = 8
_EXECUTOR = ThreadPoolExecutor(max_workers=_MAX_IN_FLIGHT, thread_name_prefix="bounded-celery")
_SLOTS = threading.BoundedSemaphore(_MAX_IN_FLIGHT)
_FUTURES_LOCK = threading.Lock()
_FUTURES: set[asyncio.Future[bool]] = set()


def admit_best_effort_celery_task(
    task: Any,
    *,
    args: Iterable[Any] = (),
    kwargs: Mapping[str, Any] | None = None,
    headers: Mapping[str, Any] | None = None,
) -> bool:
    """Schedule one bounded Celery publication and return without broker I/O.

    The return value reports local admission only. Broker delivery is explicitly
    not guaranteed, so callers may not use this helper as the durability boundary
    for a business mutation or mandatory audit.
    """
    if not _SLOTS.acquire(blocking=False):
        return False

    task_args = tuple(args)
    task_kwargs = dict(kwargs or {})
    task_headers = dict(headers or {})

    def publish() -> bool:
        try:
            from app.worker import celery_app

            with celery_app.connection_for_write(
                connect_timeout=3,
                transport_options={
                    **celery_app.conf.broker_transport_options,
                    "socket_connect_timeout": 3,
                    "socket_timeout": 3,
                    "retry_on_timeout": False,
                    "max_retries": 0,
                },
            ) as connection:
                options: dict[str, Any] = {
                    "args": task_args,
                    "kwargs": task_kwargs,
                    "retry": False,
                    "connection": connection,
                }
                if task_headers:
                    options["headers"] = task_headers
                task.apply_async(**options)
            return True
        except Exception as exc:
            logger.warning(
                "Best-effort task publication deferred or dropped task={} error={}",
                getattr(task, "name", type(task).__name__),
                type(exc).__name__,
            )
            return False
        finally:
            _SLOTS.release()

    try:
        future = asyncio.get_running_loop().run_in_executor(_EXECUTOR, publish)
    except Exception:
        _SLOTS.release()
        return False

    with _FUTURES_LOCK:
        _FUTURES.add(future)

    def forget(completed: asyncio.Future[bool]) -> None:
        try:
            completed.result()
        except asyncio.CancelledError:
            pass
        except Exception:
            pass
        finally:
            with _FUTURES_LOCK:
                _FUTURES.discard(completed)

    future.add_done_callback(forget)
    return True

