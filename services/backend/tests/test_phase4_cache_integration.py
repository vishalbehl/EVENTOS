from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_legacy_analytics_cache_keys_are_explicitly_tenant_bound():
    source = _source("app/modules/analytics/services/analytics_service.py")
    assert "organization_id: uuid.UUID | None = None" in source
    assert "organization_id=resolved_organization_id" in source
    assert "cache_service.get_json(cache_key)" in source


def test_organization_search_cache_is_safe_and_stampede_protected():
    source = _source("app/modules/platform/organization_console_router.py")
    assert "include_sensitive" in source
    assert "TenantCacheKey.search" in source
    assert "CacheTTL.SEARCH_SUGGESTIONS" in source
    assert "cache_service.get_or_set" in source
    assert "include_sensitive=bool(access)" in source


def test_capability_domain_can_invalidate_either_event_or_organization_scope():
    source = _source("app/core/cache.py")
    assert 'if rule.scope == "organization_event"' in source
    assert "return await invalidate_organization(organization_id)" in source
    assert "return await invalidate_event(organization_id, event_id)" in source
