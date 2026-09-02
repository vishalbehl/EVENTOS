from app.config import Settings
from ops.production_release_gate import validate


def test_release_gate_rejects_non_positive_cache_ttl(monkeypatch):
    config = Settings(CACHE_PUBLIC_FORM_TTL_SECONDS=0)
    monkeypatch.setattr(config, "environment", "production")
    failures = validate(config)
    assert "cache TTL settings must all be positive" in failures


def test_release_gate_accepts_valid_local_defaults():
    assert validate(Settings()) == []
