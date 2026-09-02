from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/organiser/router.py"
SERVICE = ROOT / "app/modules/organiser/application/member_commands.py"


def test_member_mutations_delegate_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    for name, method in (
        ("resend_organiser_invitation", "resend_invitation"),
        ("revoke_organiser_invitation", "revoke_invitation"),
        ("update_organiser_member_role", "update_role"),
        ("update_organiser_member_status", "update_status"),
        ("bulk_update_organiser_member_status", "bulk_update_status"),
    ):
        region = source.split(f"async def {name}", 1)[1].split("@router.", 1)[0]
        assert f"OrganizationMemberCommandService(db).{method}" in region
        assert "await db.commit()" not in region


def test_member_commands_are_tenant_locked_versioned_and_rollback_safe():
    source = SERVICE.read_text(encoding="utf-8")
    assert all(f"async def {name}" in source for name in ("resend_invitation", "revoke_invitation", "update_role", "update_status", "bulk_update_status"))
    assert source.count(".with_for_update()") >= 4
    assert "VERSION_CONFLICT" in source
    assert "RefreshToken" in source
    assert "AuditLog" in source
    assert "invalidate_organization" in source
    assert "await self.db.rollback()" in source
