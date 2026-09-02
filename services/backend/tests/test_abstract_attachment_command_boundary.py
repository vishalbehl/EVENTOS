from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/abstracts/router.py"
SERVICE = ROOT / "app/modules/abstracts/application/attachment_commands.py"


def test_attachment_add_delegates_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def add_attachment", 1)[1].split('@router.get("/reviewers"', 1)[0]
    assert "AbstractAttachmentCommandService(db).add" in region
    assert "await db.commit()" not in region


def test_attachment_command_scopes_locks_and_rolls_back():
    source = SERVICE.read_text(encoding="utf-8")
    assert "AbstractSubmission.organization_id == event.organization_id" in source
    assert ".with_for_update()" in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
