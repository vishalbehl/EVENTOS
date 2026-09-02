from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/abstracts/router.py"
SERVICE = ROOT / "app/modules/abstracts/application/decision_commands.py"


def test_abstract_decision_delegates_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def decide_submission", 1)[1].split('@router.post("/submissions/{submission_id}/publish"', 1)[0]
    assert "AbstractDecisionCommandService(db).decide" in region
    assert "await db.commit()" not in region


def test_abstract_decision_command_preserves_idempotency_and_concurrency():
    source = SERVICE.read_text(encoding="utf-8")
    assert "idempotency_key" in source
    assert "VERSION_CONFLICT" in source
    assert ".with_for_update()" in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
