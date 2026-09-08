from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_cache_exports_lock_and_pattern_operations_to_metrics():
    source = (ROOT / "app/core/cache.py").read_text(encoding="utf-8")
    assert '"delete_pattern"' in source
    assert '"lock_acquire"' in source
    assert '"lock_release"' in source
    assert "_observe_cache(\"lock_acquire\", \"contended\"" in source


def test_cache_metrics_preserve_request_values_and_expose_process_totals():
    source = (ROOT / "app/core/cache.py").read_text(encoding="utf-8")
    region = source.split("    def metrics(self)", 1)[1].split(
        "    @asynccontextmanager", 1
    )[0]
    assert "**request" in region
    assert 'f"process_{name}"' in region
    assert "get_global_cache_metrics()" in region


def test_cache_invalidation_uses_verified_tenant_key_patterns():
    keys = (ROOT / "app/core/cache_keys.py").read_text(encoding="utf-8")
    cache = (ROOT / "app/core/cache.py").read_text(encoding="utf-8")

    assert "def event_pattern" in keys
    assert "def organization_pattern" in keys
    assert "TenantCacheKey.event_pattern" in cache
    assert "TenantCacheKey.organization_pattern" in cache
    assert "f\"cache:v1:tenant:{organization_id}" not in cache
