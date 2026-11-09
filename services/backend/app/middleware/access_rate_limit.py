"""Pre-authentication ingress admission, before credential database work."""
from __future__ import annotations

import uuid
from fastapi import Request
from loguru import logger
from starlette.responses import JSONResponse

from app.core.client_ip import resolve_client_ip
from app.core.distributed_rate_limit import Budget, admit, identity_key
from app.core.rate_policy import template_policy, request_operation


def endpoint_family(path: str, method: str) -> tuple[str, int, int, int]:
    policy = template_policy(path, method)
    return policy.family, policy.capacity, policy.window, policy.burst


def limiter_error(status: int, retry_after: int = 0) -> JSONResponse:
    correlation = str(uuid.uuid4())
    code = "RATE_LIMITED" if status == 429 else "RATE_LIMIT_UNAVAILABLE"
    return JSONResponse(status_code=status, content={"detail": {
        "code": code, "message": "Please retry later.", "correlation_id": correlation,
        "retryable": True, "retry_after": retry_after,
    }}, headers={"Retry-After": str(max(1, retry_after)), "X-Correlation-ID": correlation, "Cache-Control": "no-store"})


class IngressRateLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] in {"/health", "/health/live", "/health/ready", "/ready"}:
            await self.app(scope, receive, send)
            return
        # Preflight is unauthenticated CORS negotiation; never rate limit or fail preflight.
        if scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        ip = identity_key(resolve_client_ip(request) or "unknown")
        family = request_operation(request).policy.family
        limit, window = (30, 300) if family == "login" else ((10, 600) if family == "invite-accept" else ((20, 3600) if family == "recovery" else (300, 60)))
        try:
            result = await admit([Budget(f"access-rate:ingress:{family}:{ip}", limit, window)])
        except Exception as exc:
            logger.warning("Ingress rate coordination unavailable (failing open): {}", type(exc).__name__)
            await self.app(scope, receive, send)
            return
        if not result.allowed:
            await limiter_error(429, result.retry_after)(scope, receive, send)
            return
        await self.app(scope, receive, send)
