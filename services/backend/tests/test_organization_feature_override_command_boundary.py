from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/router.py"
SERVICE = ROOT / "app/modules/platform/application/organization_commands.py"


def test_feature_override_mutations_delegate_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    for name, method in (
        ("override_organization_feature", "set_feature_override"),
        ("delete_organization_feature_override", "remove_feature_override"),
    ):
        region = source.split(f"async def {name}", 1)[1].split("@router.", 1)[0]
        assert f"OrganizationCommandService(db).{method}" in region
        assert "await db.commit()" not in region


def test_feature_override_commands_lock_audit_invalidate_and_rollback():
    source = SERVICE.read_text(encoding="utf-8")
    assert "async def set_feature_override" in source
    assert "async def remove_feature_override" in source
    assert source.count(".with_for_update()") >= 6
    assert "await invalidate_organization(organization_id)" in source
    assert "AuditLog" in source
    assert "await self.db.rollback()" in source
