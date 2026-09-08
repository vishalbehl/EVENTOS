from pathlib import Path


def test_cache_matrix_covers_required_read_domains_and_scopes():
    root = Path(__file__).resolve().parents[1]
    source = (root / "app/core/cache_invalidation_matrix.py").read_text(encoding="utf-8")
    for domain in (
        "registration_form", "published_website", "registration_pricing",
        "registration_roles", "capabilities", "search_suggestions",
        "dashboard", "venue_ops_recommendations",
    ):
        assert f'CacheInvalidationRule("{domain}"' in source
    assert '"organization_event"' in source


def test_shared_cache_api_resolves_matrix_domains_to_tenant_scoped_invalidation():
    root = Path(__file__).resolve().parents[1]
    source = (root / "app/core/cache.py").read_text(encoding="utf-8")
    assert "get_cache_invalidation_rule(read_domain)" in source
    assert "invalidate_event(organization_id, event_id)" in source
    assert "invalidate_organization(organization_id)" in source


def test_matrix_has_reverse_mutation_coverage_and_targeted_search_namespace():
    from app.core.cache_invalidation_matrix import cache_domains_for_mutation

    assert "registration_form" in cache_domains_for_mutation("forms")
    assert "dashboard" in cache_domains_for_mutation("participants")
    assert "search_suggestions" in cache_domains_for_mutation("search_index")

    root = Path(__file__).resolve().parents[1]
    keys = (root / "app/core/cache_keys.py").read_text(encoding="utf-8")
    cache = (root / "app/core/cache.py").read_text(encoding="utf-8")
    assert "organization_domain_pattern" in keys
    assert "cache_domains_for_mutation" in cache
    assert '"search-v1"' in cache
