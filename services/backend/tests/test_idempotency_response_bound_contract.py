from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_idempotency_completion_bounds_replay_response_size():
    source = (ROOT / "app/core/idempotency_service.py").read_text(encoding="utf-8")
    region = source.split("async def complete_idempotent(", 1)[1].split(
        "\n\ndef replay_response", 1
    )[0]
    assert "json.dumps(response_body" in region
    assert "IDEMPOTENCY_MAX_RESPONSE_BYTES" in region
    assert "IDEMPOTENCY_RESPONSE_TOO_LARGE" in region


def test_idempotency_response_limit_is_validated_as_an_operational_limit():
    source = (ROOT / "app/config.py").read_text(encoding="utf-8")
    assert "IDEMPOTENCY_MAX_RESPONSE_BYTES" in source
    assert '"IDEMPOTENCY_MAX_RESPONSE_BYTES": self.IDEMPOTENCY_MAX_RESPONSE_BYTES' in source
