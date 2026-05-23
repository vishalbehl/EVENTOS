# =============================================================
# Conference Platform — Rate Limiting Middleware
# backend/app/middleware/rate_limit.py
#
# IP-based and user-based rate limiting via SlowAPI (wraps limits).
#
# Two strategies used together:
#   1. SlowAPI limiter — decorator-based, per-route limits
#      applied via @limiter.limit("X/minute") on route functions.
#   2. RateLimitMiddleware — ASGI middleware for global IP-level
#      limits applied BEFORE routing (DoS protection layer).
#
# Rate limit tiers:
#   - Global (all IPs)        → 300 requests/minute
#   - Auth endpoints          → 10 requests/minute per IP
#   - Upload endpoints        → 5 requests/minute per IP
#   - WebSocket upgrades      → 30 connections/minute per IP
#
# Storage backend:
#   - In-memory (default): good for single-process dev/staging
#   - Redis (production): set REDIS_URL in .env for multi-process
#
# Usage in routes (decorator style via SlowAPI):
#   from app.middleware.rate_limit import limiter
#
#   @router.post("/login")
#   @limiter.limit("10/minute")
#   async def login(request: Request, ...): ...
#
# Usage in main.py (global middleware):
#   from app.middleware.rate_limit import RateLimitMiddleware, limiter
#   app.state.limiter = limiter
#   app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
#   app.add_middleware(RateLimitMiddleware)
# =============================================================

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field
from threading import Lock
from typing import Optional, Any

from loguru import logger
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.config import settings


# ── SlowAPI limiter (decorator-based, per-route) ──────────────
#
# The key function determines how requests are grouped for limiting.
# We use IP address as the key; in production you can switch to
# user_id for authenticated endpoints.

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["300/minute"],
    storage_uri=settings.REDIS_URL,   # Redis when configured, memory otherwise
)


# ── 429 response handler ──────────────────────────────────────

def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """
    Called by FastAPI's exception handler when SlowAPI raises RateLimitExceeded.

    Register in main.py:
        from slowapi.errors import RateLimitExceeded
        from app.middleware.rate_limit import rate_limit_exceeded_handler
        app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    """
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please slow down and try again.",
            "retry_after": str(exc.retry_after) if hasattr(exc, "retry_after") else "60",
        },
        headers={"Retry-After": str(getattr(exc, "retry_after", 60))},
    )


# ── In-memory sliding window rate limiter ─────────────────────
# Used by RateLimitMiddleware for global IP protection before routing.
# Thread-safe via Lock. For production scale, replace with Redis.

@dataclass
class _Window:
    """Sliding window state for one IP address."""
    timestamps: list = field(default_factory=list)
    lock: Lock = field(default_factory=Lock)


class _InMemoryLimiter:
    """
    Thread-safe in-memory sliding window rate limiter.

    Tracks request timestamps per IP within a rolling window.
    Automatically evicts stale entries to prevent unbounded memory growth.
    """

    def __init__(self) -> None:
        self._windows: dict[str, _Window] = defaultdict(_Window)
        self._global_lock = Lock()

    def is_allowed(self, key: str, max_requests: int, window_seconds: int) -> bool:
        """
        Return True if the key is within its rate limit.
        Return False if the limit has been exceeded.
        """
        now = time.monotonic()
        window = self._windows[key]

        with window.lock:
            # Evict timestamps outside the rolling window
            cutoff = now - window_seconds
            window.timestamps = [t for t in window.timestamps if t > cutoff]

            if len(window.timestamps) >= max_requests:
                return False

            window.timestamps.append(now)
            return True

    def cleanup_stale(self, max_idle_seconds: int = 300) -> None:
        """
        Remove IP windows that have had no requests for `max_idle_seconds`.
        Call this periodically (e.g. from an APScheduler job).
        """
        now = time.monotonic()
        with self._global_lock:
            stale = [
                ip for ip, w in self._windows.items()
                if not w.timestamps or (now - max(w.timestamps)) > max_idle_seconds
            ]
            for ip in stale:
                del self._windows[ip]
        if stale:
            logger.debug(f"Rate limiter: evicted {len(stale)} stale IP windows")


_ip_limiter = _InMemoryLimiter()


# ── Per-path rate limit rules ─────────────────────────────────

@dataclass
class _PathRule:
    prefix: str
    max_requests: int
    window_seconds: int
    description: str


_PATH_RULES: list[_PathRule] = [
    _PathRule("/auth/login",     10,   60,  "Login brute-force protection"),
    _PathRule("/auth/refresh",   20,   60,  "Refresh token endpoint"),
    _PathRule("/upload/",         5,   60,  "File upload initiation"),
    _PathRule("/srr/checkin",    30,   60,  "SRR check-in (kiosk scan)"),
    _PathRule("/import",          5,  300,  "Excel import upload"),
]

# Global fallback: 300 req/min per IP for all other paths
_GLOBAL_LIMIT = _PathRule("", 300, 60, "Global per-IP limit")


def _find_rule(path: str) -> _PathRule:
    """Find the most specific rule for a given path."""
    for rule in _PATH_RULES:
        if path.startswith(rule.prefix):
            return rule
    return _GLOBAL_LIMIT


# ── ASGI Middleware class ─────────────────────────────────────

class RateLimitMiddleware:
    """
    Global IP-level rate limiting middleware (Pure ASGI).
    Acts as the first line of defence for DoS/brute-force attacks.
    Excludes /ws and other system paths.
    """
    _EXCLUDED_PREFIXES = ("/health", "/ws", "/socket.io", "/docs", "/redoc", "/openapi.json")

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        path = scope["path"]

        # Skip excluded paths
        if any(path.startswith(prefix) for prefix in self._EXCLUDED_PREFIXES):
            await self.app(scope, receive, send)
            return

        # Skip OPTIONS (CORS preflight) — never rate-limit
        if scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send)
            return

        ip = self._get_ip(request)
        rule = _find_rule(path)

        if not _ip_limiter.is_allowed(ip, rule.max_requests, rule.window_seconds):
            logger.warning(
                f"Rate limit exceeded: IP={ip} path={path} "
                f"limit={rule.max_requests}/{rule.window_seconds}s"
            )
            response = JSONResponse(
                status_code=429,
                content={
                    "detail": (
                        f"Rate limit exceeded. Maximum {rule.max_requests} requests "
                        f"per {rule.window_seconds} seconds from this IP."
                    ),
                },
                headers={"Retry-After": str(rule.window_seconds)},
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)

    @staticmethod
    def _get_ip(request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
