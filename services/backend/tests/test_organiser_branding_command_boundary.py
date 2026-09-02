from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/organiser/router.py"
SERVICE = ROOT / "app/modules/organiser/application/branding_commands.py"


def test_branding_update_delegates_transaction_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def update_organiser_branding", 1)[1].split("@router.", 1)[0]
    assert "OrganizerBrandingCommandService(db).update" in region
    assert "await db.commit()" not in region


def test_branding_command_is_tenant_locked_versioned_audited_and_fail_safe():
    source = SERVICE.read_text(encoding="utf-8")
    assert "async def update" in source
    assert source.count(".with_for_update()") >= 2
    assert "VERSION_CONFLICT" in source
    assert "AuditLog" in source and "invalidate_organization" in source
    assert "await self.db.rollback()" in source
