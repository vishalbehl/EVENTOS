from __future__ import annotations

import re
import uuid
from hashlib import sha256

from app.database import tenant_org_id


class TenantCacheKeyError(ValueError):
    pass


_SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9_.-]+$")


class TenantCacheKey:
    @staticmethod
    def build(*segments: object, organization_id: uuid.UUID | None = None) -> str:
        org_id = organization_id or tenant_org_id.get()
        if not isinstance(org_id, uuid.UUID):
            raise TenantCacheKeyError("Verified tenant context is required for cache keys.")
        normalized = [_normalize_segment(segment) for segment in segments]
        if not normalized:
            raise TenantCacheKeyError("At least one cache-key segment is required.")
        return ":".join(("tenant", str(org_id), *normalized))

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


def _normalize_segment(value: object) -> str:
    segment = str(value).strip()
    if not segment or not _SAFE_SEGMENT.fullmatch(segment):
        raise TenantCacheKeyError("Cache-key segments must be non-empty and namespace safe.")
    return segment
