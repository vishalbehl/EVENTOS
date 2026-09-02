from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/organization_console_router.py"
SERVICE = ROOT / "app/modules/platform/application/location_commands.py"


def test_platform_location_routes_delegate_transactions():
    source = ROUTER.read_text(encoding="utf-8")
    create_region = source.split("async def create_location", 1)[1].split("@router.", 1)[0]
    update_region = source.split("async def update_location", 1)[1].split("@router.", 1)[0]
    assert "OrganizationLocationCommandService(db).create" in create_region
    assert "OrganizationLocationCommandService(db).update" in update_region
    assert "await db.commit()" not in create_region
    assert "await db.commit()" not in update_region


def test_platform_location_commands_are_locked_versioned_audited_and_fail_safe():
    source = SERVICE.read_text(encoding="utf-8")
    assert ".with_for_update()" in source
    assert "LOCATION_NAME_EXISTS" in source
    assert "HTTP_412_PRECONDITION_FAILED" in source
    assert "AuditLog" in source and "invalidate_organization" in source
    assert "await self.db.rollback()" in source
