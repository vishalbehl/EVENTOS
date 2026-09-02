"""Run async Celery task bodies without rotating event loops per task."""

from __future__ import annotations

import asyncio
import sys
import threading
from typing import Coroutine, TypeVar

T = TypeVar("T")
_loop: asyncio.AbstractEventLoop | None = None
_loop_lock = threading.Lock()


def _ensure_loop() -> asyncio.AbstractEventLoop:
    global _loop
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    if _loop is None or _loop.is_closed():
        _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)
    return _loop


def run_async(coroutine: Coroutine[object, object, T]) -> T:
    """Run a coroutine on a stable loop for the lifetime of a worker process."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        with _loop_lock:
            return _ensure_loop().run_until_complete(coroutine)

    result: list[T] = []
    error: list[BaseException] = []

    def runner() -> None:
        try:
            with _loop_lock:
                result.append(_ensure_loop().run_until_complete(coroutine))
        except BaseException as exc:
            error.append(exc)

    thread = threading.Thread(target=runner, name="celery-async-runner")
    thread.start()
    thread.join()
    if error:
        raise error[0]
    return result[0]
