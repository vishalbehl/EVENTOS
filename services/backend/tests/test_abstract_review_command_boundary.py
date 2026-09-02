from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/abstracts/router.py"
SERVICE = ROOT / "app/modules/abstracts/application/review_commands.py"


def test_review_submission_delegates_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def submit_review", 1)[1].split('@router.post("/submissions/{submission_id}/decision"', 1)[0]
    assert "AbstractReviewCommandService(db).submit" in region
    assert "await db.commit()" not in region


def test_review_command_locks_scopes_and_rolls_back():
    source = SERVICE.read_text(encoding="utf-8")
    assert "AbstractAssignment.organization_id == event.organization_id" in source
    assert "AbstractSubmission.organization_id == event.organization_id" in source
    assert ".with_for_update()" in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
