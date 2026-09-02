from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/organization_console_router.py"
SERVICE = ROOT / "app/modules/platform/application/organization_team_commands.py"


def test_team_crud_routes_delegate_transaction_ownership():
    source = ROUTER.read_text(encoding="utf-8")
    for name, method in (
        ("create_organization_team", "create"),
        ("update_organization_team", "update"),
        ("archive_organization_team", "archive"),
        ("assign_organization_team_member", "assign_member"),
        ("unassign_organization_team_member", "unassign_member"),
        ("assign_organization_team_event", "assign_event"),
        ("unassign_organization_team_event", "unassign_event"),
    ):
        region = source.split(f"async def {name}", 1)[1].split("@router.", 1)[0]
        assert f"OrganizationTeamCommandService(db).{method}" in region
        assert "await db.commit()" not in region


def test_team_commands_lock_version_audit_and_rollback():
    source = SERVICE.read_text(encoding="utf-8")
    assert all(f"async def {name}" in source for name in ("create", "update", "archive", "assign_member", "unassign_member", "assign_event", "unassign_event"))
    assert source.count(".with_for_update()") >= 7
    assert "raise_version_conflict" in source
    assert "AuditLog" in source
    assert "await self.db.rollback()" in source
