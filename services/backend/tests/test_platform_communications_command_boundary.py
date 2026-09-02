from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/communications_router.py"
SERVICE = ROOT / "app/modules/platform/application/communications_commands.py"


def test_platform_communication_mutations_delegate_to_commands():
    source = ROUTER.read_text(encoding="utf-8")
    assert "PlatformCommunicationsCommandService(db).create_announcement" in source
    assert "PlatformCommunicationsCommandService(db).update_announcement" in source
    assert "PlatformCommunicationsCommandService(db).delete_announcement" in source
    assert "PlatformCommunicationsCommandService(db).create_maintenance" in source
    assert "PlatformCommunicationsCommandService(db).update_maintenance" in source
    assert "PlatformCommunicationsCommandService(db).delete_maintenance" in source


def test_platform_communication_commands_lock_and_own_transactions():
    source = SERVICE.read_text(encoding="utf-8")
    assert ".with_for_update()" in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
    assert "AuditLog" in source
