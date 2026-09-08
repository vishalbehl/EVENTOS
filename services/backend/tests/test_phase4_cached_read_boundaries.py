from pathlib import Path


def _source(relative: str) -> str:
    root = Path(__file__).resolve().parents[1]
    return (root / relative).read_text(encoding="utf-8")


def test_venue_ops_recommendations_use_tenant_cache_and_bypass_overrides():
    source = _source("app/modules/technology_services/application/queries.py")
    assert 'TenantCacheKey.event(event_id, "venue-ops-recommendations"' in source
    assert "cache_service.get_or_set" in source
    assert "if overrides:" in source


def test_published_website_runtime_uses_revision_and_route_scoped_cache():
    source = _source("app/modules/website_builder/router.py")
    assert '"published-website"' in source
    assert "deployment.id" in source
    assert "hashlib.sha256(route.encode" in source
    assert "CacheTTL.PUBLISHED_WEBSITE" in source


def test_published_website_mutations_invalidate_only_after_commit():
    source = _source("app/modules/website_builder/router.py")
    assert source.count('await cache_service.invalidate_domain("published_website"') >= 2
    assert source.count("await commit_transaction(db)") >= 2


def test_event_dashboard_reads_use_tenant_scoped_cache_aside():
    source = _source("app/modules/analytics/routers/dashboard.py")
    assert "def _cached_event_read" in source
    assert "TenantCacheKey.event" in source
    assert "CacheTTL.DASHBOARD" in source
    for segment in (
        "summary",
        "registrations-timeline",
        "roles-breakdown",
        "pending-actions",
        "recent-activity",
        "deadlines",
    ):
        assert f'segment="{segment}"' in source
