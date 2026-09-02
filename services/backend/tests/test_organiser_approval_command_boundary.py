from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/organiser/router.py"
SERVICE = ROOT / "app/modules/organiser/application/approval_commands.py"


def test_approval_rule_mutations_delegate_transaction_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    for name, method in (("create_organiser_approval_rule", "create"), ("update_organiser_approval_rule", "update")):
        region = source.split(f"async def {name}", 1)[1].split("@router.", 1)[0]
        assert f"OrganizerApprovalRuleCommandService(db).{method}" in region
        assert "await db.commit()" not in region


def test_approval_commands_are_tenant_checked_locked_audited_and_fail_safe():
    source = SERVICE.read_text(encoding="utf-8")
    assert "async def create" in source and "async def update" in source
    assert ".with_for_update()" in source
    assert "EVENT_NOT_FOUND" in source and "VERSION_CONFLICT" in source
    assert "AuditLog" in source and "invalidate_organization" in source
    assert "await self.db.rollback()" in source
