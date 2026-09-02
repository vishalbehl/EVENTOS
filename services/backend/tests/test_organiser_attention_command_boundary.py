from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/organiser/router.py"
SERVICE = ROOT / "app/modules/organiser/application/attention_commands.py"


def test_attention_assign_and_resolve_delegate_transactions():
    source = ROUTER.read_text(encoding="utf-8")
    for name, method in (("assign_attention_task", "assign"), ("resolve_attention_task", "resolve")):
        region = source.split(f"async def {name}", 1)[1].split("@router.", 1)[0]
        assert f"OrganizerAttentionCommandService(db).{method}" in region
        assert "await db.commit()" not in region


def test_attention_commands_are_tenant_locked_versioned_audited_and_fail_safe():
    source = SERVICE.read_text(encoding="utf-8")
    assert "async def assign" in source and "async def resolve" in source
    assert ".with_for_update()" in source
    assert "VERSION_CONFLICT" in source and "OWNER_NOT_IN_ORGANIZATION" in source
    assert "AuditLog" in source and "invalidate_organization" in source
    assert "await self.db.rollback()" in source


def test_attention_snooze_is_command_owned():
    router = ROUTER.read_text(encoding="utf-8")
    service = SERVICE.read_text(encoding="utf-8")
    region = router.split("async def snooze_attention_task", 1)[1].split("@router.", 1)[0]
    assert "OrganizerAttentionCommandService(db).snooze" in region
    assert "await db.commit()" not in region
    assert "async def snooze" in service and "ATTENTION_TASK_SNOOZED" in service
