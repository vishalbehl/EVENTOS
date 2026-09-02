from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/abstracts/router.py"
SERVICE = ROOT / "app/modules/abstracts/application/publication_commands.py"


def test_abstract_publication_delegates_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def publish_submission", 1)[1].split('@router.post("/accepted/publish-all"', 1)[0]
    assert "AbstractPublicationCommandService(db).publish" in region
    assert "await db.commit()" not in region


def test_abstract_publication_command_scopes_locks_audits_and_rolls_back():
    source = SERVICE.read_text(encoding="utf-8")
    assert "AbstractSubmission.organization_id == event.organization_id" in source
    assert ".with_for_update()" in source
    assert "ABSTRACT_NOT_ACCEPTED" in source
    assert "AuditService.write_log_sync" in source
    assert "await self.db.rollback()" in source
