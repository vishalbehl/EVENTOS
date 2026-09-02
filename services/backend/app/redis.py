"""Role-separated Redis clients with event-loop-safe connection pools."""

from __future__ import annotations

import asyncio

import redis.asyncio as redis

from app.config import settings


class LoopBoundRedis:
    """Bind one Redis pool to the active asyncio event loop.

    FastAPI normally has one long-lived loop, while tests and Celery task
    runners can use more than one. Redis pools cannot safely move connections
    between loops, so a fresh pool is created when the active loop changes.
    """

    def __init__(self, url: str):
        self.url = url
        self._loop: asyncio.AbstractEventLoop | None = None
        self._client = None

    def _get_client(self):
        loop = asyncio.get_running_loop()
        if self._client is None or self._loop is not loop:
            self._client = redis.from_url(
                self.url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=settings.REDIS_OPERATION_TIMEOUT_SECONDS,
                socket_timeout=settings.REDIS_OPERATION_TIMEOUT_SECONDS,
            )
            self._loop = loop
        return self._client

    def __getattr__(self, name: str):
        return getattr(self._get_client(), name)

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
            self._loop = None


# DB 2: application cache. DB 3: locks, rate limits, and short-lived sessions.
cache_client = LoopBoundRedis(settings.redis_cache_url)
coordination_client = LoopBoundRedis(settings.redis_lock_url)

# Compatibility alias for older coordination consumers. Cache code imports
# ``cache_client`` explicitly so the legacy name remains on DB 3.
redis_client = coordination_client
lock_client = coordination_client


async def get_redis():
    return cache_client


async def get_lock_redis():
    return coordination_client


async def close_redis() -> None:
    await cache_client.aclose()
    if coordination_client is not cache_client:
        await coordination_client.aclose()
