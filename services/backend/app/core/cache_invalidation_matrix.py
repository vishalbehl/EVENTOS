"""Authoritative cache read/mutation invalidation contract.

The matrix is intentionally data-only so it can be inspected by tooling and
used by mutation tests without importing application routers.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType

from app.core.cache_policy import CacheTTL


@dataclass(frozen=True)
class CacheInvalidationRule:
    read_domain: str
    scope: str
    ttl_policy: CacheTTL
    mutation_domains: tuple[str, ...]


_RULES = (
    CacheInvalidationRule("registration_form", "event", CacheTTL.PUBLIC_FORM, ("forms", "form_fields", "registration_settings")),
    CacheInvalidationRule("published_website", "event", CacheTTL.PUBLISHED_WEBSITE, ("website_documents", "website_publish", "website_domains")),
    CacheInvalidationRule("registration_pricing", "event", CacheTTL.PRICING, ("pricing", "ticket_types", "registration_settings")),
    CacheInvalidationRule("registration_roles", "event", CacheTTL.ROLES, ("roles", "role_assignments")),
    CacheInvalidationRule("capabilities", "organization_event", CacheTTL.CAPABILITIES, ("entitlements", "capability_overrides", "organization_settings")),
    CacheInvalidationRule("search_suggestions", "organization", CacheTTL.SEARCH_SUGGESTIONS, ("participants", "speakers", "sessions", "search_index")),
    CacheInvalidationRule("dashboard", "event", CacheTTL.DASHBOARD, ("participants", "registrations", "payments", "attendance", "agenda")),
    CacheInvalidationRule("venue_ops_recommendations", "event", CacheTTL.DASHBOARD, ("venue_requests", "venue_quotes", "venue_fulfilment")),
)

CACHE_INVALIDATION_MATRIX = MappingProxyType({rule.read_domain: rule for rule in _RULES})


def get_cache_invalidation_rule(read_domain: str) -> CacheInvalidationRule:
    try:
        return CACHE_INVALIDATION_MATRIX[read_domain]
    except KeyError as exc:
        raise ValueError(f"Unknown cache read domain: {read_domain}") from exc


def cache_invalidation_domains() -> tuple[str, ...]:
    return tuple(CACHE_INVALIDATION_MATRIX.keys())


def cache_domains_for_mutation(mutation_domain: str) -> tuple[str, ...]:
    """Return every cached read affected by one authoritative mutation."""
    return tuple(
        rule.read_domain
        for rule in _RULES
        if mutation_domain in rule.mutation_domains
    )


def cache_mutation_domains() -> tuple[str, ...]:
    """Return the unique mutation names represented by the matrix."""
    return tuple(
        dict.fromkeys(
            mutation_domain
            for rule in _RULES
            for mutation_domain in rule.mutation_domains
        )
    )
