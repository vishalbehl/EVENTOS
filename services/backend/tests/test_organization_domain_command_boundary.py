from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/router.py"
SERVICE = ROOT / "app/modules/platform/application/organization_commands.py"


def test_domain_mutations_delegate_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    for name in ("add_organization_domain", "delete_organization_domain", "verify_organization_domain"):
        region = source.split(f"async def {name}", 1)[1]
        assert "OrganizationCommandService(db)." in region
        assert "await db.commit()" not in region.split("@router.", 1)[0]


def test_domain_commands_lock_scope_audit_and_rollback():
    source = SERVICE.read_text(encoding="utf-8")
    assert source.count(".with_for_update()") >= 4
    assert "ActivityTimeline" in source
    assert "AuditLog" in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
