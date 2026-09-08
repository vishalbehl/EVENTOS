"""Venue Ops lifecycle command contracts for Phase 3A."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_venue_ops_lifecycle_uses_shared_conflict_and_idempotency_contracts():
    router = read("app/modules/technology_services/router.py")
    commands = read("app/modules/technology_services/application/commands.py")
    assert router.count('operation="venue_ops.request.') >= 5
    assert router.count('alias="If-Match"') >= 3
    assert "raise_version_conflict(row.version)" in commands
    assert "with_for_update()" in commands


def test_attachment_response_uses_persisted_request_identity():
    router = read("app/modules/technology_services/router.py")
    assert '"request_id": str(attachment.request_id)' in router
