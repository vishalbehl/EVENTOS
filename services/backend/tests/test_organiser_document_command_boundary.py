from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/organiser/router.py"
SERVICE = ROOT / "app/modules/organiser/application/document_commands.py"


def test_document_archive_delegates_transaction_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def archive_organiser_document", 1)[1].split("@router.", 1)[0]
    assert "OrganizerDocumentCommandService(db).archive" in region
    assert "await db.commit()" not in region


def test_document_archive_command_is_locked_versioned_audited_and_fail_safe():
    source = SERVICE.read_text(encoding="utf-8")
    assert ".with_for_update()" in source
    assert "VERSION_CONFLICT" in source
    assert "AuditLog" in source and "invalidate_organization" in source
    assert "await self.db.rollback()" in source


def test_document_upload_and_replace_delegate_transactions():
    router = ROUTER.read_text(encoding="utf-8")
    service = SERVICE.read_text(encoding="utf-8")
    for route_name, method in (("upload_organiser_document", "upload"), ("replace_organiser_document", "replace")):
        region = router.split(f"async def {route_name}", 1)[1].split("@router.", 1)[0]
        assert f"OrganizerDocumentCommandService(db).{method}" in region
        assert "await db.commit()" not in region
    assert "FileService.upload_asset" in service
    assert "async def upload" in service and "async def replace" in service
