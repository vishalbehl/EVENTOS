from __future__ import annotations

import re
import uuid
from hashlib import sha256

from app.database import tenant_org_id


class TenantCacheKeyError(ValueError):
    pass


_SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9_.-]+$")


class TenantCacheKey:
    PREFIX = "cache:v1:tenant"

    @staticmethod
    def build(*segments: object, organization_id: uuid.UUID | None = None) -> str:
        org_id = organization_id or tenant_org_id.get()
        if not isinstance(org_id, uuid.UUID):
            raise TenantCacheKeyError("Verified tenant context is required for cache keys.")
        normalized = [_normalize_segment(segment) for segment in segments]
        if not normalized:
            raise TenantCacheKeyError("At least one cache-key segment is required.")
        return ":".join((TenantCacheKey.PREFIX, str(org_id), *normalized))

    @staticmethod
    def event(
        event_id: uuid.UUID,
        *segments: object,
        organization_id: uuid.UUID | None = None,
    ) -> str:
        if not isinstance(event_id, uuid.UUID):
            raise TenantCacheKeyError("Event cache keys require an event UUID.")
        return TenantCacheKey.build(
            "event", event_id, *segments, organization_id=organization_id
        )

    @staticmethod
    def event_pattern(event_id: uuid.UUID, organization_id: uuid.UUID) -> str:
        """Return the only wildcard pattern allowed for one verified event."""
        return TenantCacheKey.event(
            event_id, "invalidation", organization_id=organization_id
        ).rsplit(":", 1)[0] + ":*"

    @staticmethod
    def organization_pattern(organization_id: uuid.UUID) -> str:
        """Return the only wildcard pattern allowed for one verified tenant."""
        if not isinstance(organization_id, uuid.UUID):
            raise TenantCacheKeyError("Organization cache patterns require a UUID.")
        return f"{TenantCacheKey.PREFIX}:{organization_id}:*"

    @staticmethod
    def organization_domain_pattern(
        organization_id: uuid.UUID, domain: str
    ) -> str:
        """Return a bounded pattern for one tenant-owned cache domain."""
        if not isinstance(organization_id, uuid.UUID):
            raise TenantCacheKeyError("Organization cache patterns require a UUID.")
        normalized = _normalize_segment(domain)
        return f"{TenantCacheKey.PREFIX}:{organization_id}:{normalized}:*"

    @staticmethod
    def rate_limit_config(organization_id: uuid.UUID) -> str:
        return TenantCacheKey.build("rate-limit", "config", organization_id=organization_id)

    @staticmethod
    def rate_limit_window(
        organization_id: uuid.UUID, window: str
    ) -> str:
        return TenantCacheKey.build("rate-limit", window, organization_id=organization_id)

    @staticmethod
    def api_usage(organization_id: uuid.UUID, endpoint: str) -> tuple[str, str]:
        """Return a tenant-bound counter key and stable endpoint fingerprint."""
        fingerprint = sha256(endpoint.encode("utf-8")).hexdigest()
        return (
            TenantCacheKey.build("api-usage", fingerprint, organization_id=organization_id),
            fingerprint,
        )

    @staticmethod
    def api_usage_metadata(organization_id: uuid.UUID, fingerprint: str) -> str:
        return TenantCacheKey.build(
            "api-usage", "metadata", fingerprint, organization_id=organization_id
        )

    @staticmethod
    def event_roles(event_id: uuid.UUID, organization_id: uuid.UUID) -> str:
        return TenantCacheKey.event(event_id, "registration-roles-v1", organization_id=organization_id)

    @staticmethod
    def event_prices(event_id: uuid.UUID, tier: str, organization_id: uuid.UUID) -> str:
        tier_segment = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(tier).strip()).strip("-") or "default"
        return TenantCacheKey.event(event_id, "registration-prices-v1", tier_segment, organization_id=organization_id)

    @staticmethod
    def dashboard(event_id: uuid.UUID, revision: str, organization_id: uuid.UUID) -> str:
        return TenantCacheKey.event(
            event_id,
            "dashboard-v1",
            revision,
            organization_id=organization_id,
        )

    @staticmethod
    def capabilities(event_id: uuid.UUID, revision: str, organization_id: uuid.UUID) -> str:
        return TenantCacheKey.event(
            event_id,
            "capabilities-v1",
            revision,
            organization_id=organization_id,
        )

    @staticmethod
    def search(query_hash: str, organization_id: uuid.UUID) -> str:
        return TenantCacheKey.build(
            "search-v1",
            query_hash,
            organization_id=organization_id,
        )

    @staticmethod
    def identity(
        *segments: object,
        organization_id: uuid.UUID,
        user_id: uuid.UUID,
        role: str,
        capability_revision: str,
        locale: str = "en",
    ) -> str:
        """Build a cache key for data whose result depends on the viewer."""
        if not isinstance(user_id, uuid.UUID):
            raise TenantCacheKeyError("Identity cache keys require a user UUID.")
        if not role.strip() or not capability_revision.strip() or not locale.strip():
            raise TenantCacheKeyError("Identity cache dimensions must be non-empty.")
        return TenantCacheKey.build(
            *segments,
            "user", user_id,
            "role", role,
            "capabilities", capability_revision,
            "locale", locale,
            organization_id=organization_id,
        )


def _normalize_segment(value: object) -> str:
    segment = str(value).strip()
    if not segment or not _SAFE_SEGMENT.fullmatch(segment):
        raise TenantCacheKeyError("Cache-key segments must be non-empty and namespace safe.")
    return segment
