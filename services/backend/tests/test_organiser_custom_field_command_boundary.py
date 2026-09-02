from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/organiser/router.py"
SERVICE = ROOT / "app/modules/organiser/application/custom_field_commands.py"


def test_custom_field_update_delegates_transaction_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    create_region = source.split("async def create_organiser_custom_field", 1)[1].split("@router.", 1)[0]
    assert "OrganizerCustomFieldCommandService(db).create" in create_region
    assert "await db.commit()" not in create_region
    region = source.split("async def update_organiser_custom_field", 1)[1].split("@router.", 1)[0]
    assert "OrganizerCustomFieldCommandService(db).update" in region
    assert "await db.commit()" not in region


def test_custom_field_command_is_tenant_locked_versioned_audited_and_fail_safe():
    source = SERVICE.read_text(encoding="utf-8")
    assert "async def create" in source and "async def update" in source
    assert ".with_for_update()" in source
    assert "VERSION_CONFLICT" in source and "field_key" in source
    assert "AuditLog" in source and "invalidate_organization" in source
    assert "await self.db.rollback()" in source
