from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/abstracts/router.py"
SERVICE = ROOT / "app/modules/abstracts/application/submission_commands.py"


def test_abstract_submission_creation_delegates_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def create_submission", 1)[1].split('@router.get("/submissions/{submission_id}"', 1)[0]
    assert "AbstractSubmissionCommandService(db).create" in region
    assert "await db.commit()" not in region
    assert "db.add(" not in region


def test_abstract_submission_command_commits_authors_and_audit_atomically():
    source = SERVICE.read_text(encoding="utf-8")
    assert "AbstractAuthor" in source
    assert "AuditService.write_log_sync" in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source


def test_submission_update_and_delete_delegate_transaction_ownership():
    source = ROUTER.read_text(encoding="utf-8")
    update_region = source.split("async def update_submission", 1)[1].split("@router.delete", 1)[0]
    delete_region = source.split("async def delete_submission", 1)[1].split("@router.post(\"/submissions/{submission_id}/attachments\"", 1)[0]
    assert "AbstractSubmissionCommandService(db).update" in update_region
    assert "AbstractSubmissionCommandService(db).delete" in delete_region
    assert "await db.commit()" not in update_region + delete_region


def test_submission_mutations_lock_tenant_scope_and_rollback():
    source = SERVICE.read_text(encoding="utf-8")
    assert source.count("AbstractSubmission.organization_id == event.organization_id") >= 2
    assert source.count(".with_for_update()") >= 2
    assert source.count("await self.db.rollback()") >= 3
