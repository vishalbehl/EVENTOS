from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/abstracts/router.py"
SERVICE = ROOT / "app/modules/abstracts/application/reviewer_commands.py"


def test_abstract_reviewer_mutations_delegate_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    assert "AbstractReviewerCommandService(db).create" in source
    assert "AbstractReviewerCommandService(db).update" in source
    assert "AbstractReviewerCommandService(db).delete" in source


def test_abstract_reviewer_commands_preserve_lock_guard_audit_and_transactions():
    source = SERVICE.read_text(encoding="utf-8")
    assert ".with_for_update()" in source
    assert "REVIEWER_HAS_ACTIVE_ASSIGNMENTS" in source
    assert "AuditService.write_log_sync" in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
