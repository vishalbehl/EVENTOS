from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/abstracts/router.py"
SERVICE = ROOT / "app/modules/abstracts/application/assignment_commands.py"


def test_abstract_assignment_mutations_delegate_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    assert "AbstractAssignmentCommandService(db).assign" in source
    assert "AbstractAssignmentCommandService(db).update" in source


def test_abstract_assignment_commands_scope_lock_audit_and_transactions():
    source = SERVICE.read_text(encoding="utf-8")
    assert "AbstractAssignment.organization_id == event.organization_id" in source
    assert ".with_for_update()" in source
    assert "AuditService.write_log_sync" in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
