from __future__ import annotations

from enum import IntEnum, unique

from app.config import settings


@unique
class CacheTTL(IntEnum):
    PUBLIC_FORM = 30
    PUBLISHED_WEBSITE = 60
    # Enum members must have distinct values. Keep policy defaults in the
    # mapping below so equal durations do not collapse into aliases.
    PRICING = 1
    ROLES = 2
    CAPABILITIES = 3
    SEARCH_SUGGESTIONS = 300
    DASHBOARD = 15


_DEFAULT_TTL_BY_POLICY = {
    CacheTTL.PUBLIC_FORM: 30,
    CacheTTL.PUBLISHED_WEBSITE: 60,
    CacheTTL.PRICING: 30,
    CacheTTL.ROLES: 30,
    CacheTTL.CAPABILITIES: 60,
    CacheTTL.SEARCH_SUGGESTIONS: 300,
    CacheTTL.DASHBOARD: 15,
}


_SETTING_BY_POLICY = {
    "PUBLIC_FORM": "CACHE_PUBLIC_FORM_TTL_SECONDS",
    "PUBLISHED_WEBSITE": "CACHE_PUBLISHED_WEBSITE_TTL_SECONDS",
    "PRICING": "CACHE_PRICING_TTL_SECONDS",
    "ROLES": "CACHE_ROLES_TTL_SECONDS",
    "CAPABILITIES": "CACHE_CAPABILITIES_TTL_SECONDS",
    "SEARCH_SUGGESTIONS": "CACHE_SEARCH_SUGGESTIONS_TTL_SECONDS",
    "DASHBOARD": "CACHE_DASHBOARD_TTL_SECONDS",
}


def ttl(policy: CacheTTL) -> int:
    """Return an operator-configurable, positive TTL for a named policy."""
    configured = getattr(settings, _SETTING_BY_POLICY.get(policy.name, ""), None)
    if configured is None:
        configured = _DEFAULT_TTL_BY_POLICY[policy]
    return max(1, int(configured or settings.CACHE_DEFAULT_TTL_SECONDS))
