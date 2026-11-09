"""Compatibility imports; enforcement lives in the shared Redis admission service.

No replica-local limiter, URL-prefix policy or fail-open developer fallback is
retained. Decorator imports remain available for older integrations; the active
application uses the registered-policy middleware rather than SlowAPI defaults.
"""
from slowapi import Limiter
from app.config import settings
from app.core.client_ip import resolve_client_ip
from app.middleware.access_rate_limit import limiter_error
from app.middleware.rate_limiter import RateLimiterMiddleware

limiter = Limiter(key_func=lambda request: resolve_client_ip(request) or "unknown",
                  default_limits=[], storage_uri=settings.REDIS_URL)


def rate_limit_exceeded_handler(request, exc):
    return limiter_error(429, int(getattr(exc, "retry_after", 60) or 60))


class RateLimitMiddleware(RateLimiterMiddleware):
    """Legacy class name delegates to the single distributed implementation."""
