from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_idempotency_policy_has_operation_specific_retention():
    source = (ROOT / "app/core/idempotency_service.py").read_text(encoding="utf-8")
    assert "def default_ttl_seconds(operation: str)" in source
    assert "IDEMPOTENCY_FINANCIAL_TTL_SECONDS" in source
    assert "IDEMPOTENCY_WEBHOOK_TTL_SECONDS" in source
    assert "IDEMPOTENCY_REGISTRATION_TTL_SECONDS" in source


def test_explicit_idempotency_ttl_remains_authoritative():
    source = (ROOT / "app/core/idempotency_service.py").read_text(encoding="utf-8")
    assert "ttl_seconds = default_ttl_seconds(operation) if ttl_seconds is None else ttl_seconds" in source
    assert "default_ttl_seconds = staticmethod(default_ttl_seconds)" in source
