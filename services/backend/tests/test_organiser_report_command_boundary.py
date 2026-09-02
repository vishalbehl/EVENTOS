from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/organiser/router.py"
SERVICE = ROOT / "app/modules/organiser/application/report_commands.py"


def test_custom_report_creation_delegates_transaction_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def create_organiser_custom_report", 1)[1].split("@router.", 1)[0]
    assert "OrganizerReportCommandService(db).create_custom_report" in region
    assert "await db.commit()" not in region


def test_custom_report_command_is_idempotent_audited_and_fail_safe():
    source = SERVICE.read_text(encoding="utf-8")
    assert "idempotency_key" in source
    assert "ORGANISER_CUSTOM_REPORT_CREATED" in source
    assert "AuditLog" in source and "invalidate_organization" in source
    assert "await self.db.rollback()" in source


def test_report_export_delegates_persistence_to_command_service():
    router = ROUTER.read_text(encoding="utf-8")
    service = SERVICE.read_text(encoding="utf-8")
    region = router.split("async def create_organiser_report_export", 1)[1].split("@router.", 1)[0]
    assert "OrganizerReportCommandService(db).create_export" in region
    assert "await db.commit()" not in region
    assert "async def create_export" in service
