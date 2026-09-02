from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/router.py"
SERVICE = ROOT / "app/modules/platform/application/identity_commands.py"


def test_force_logout_delegates_to_identity_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def force_logout_user", 1)[1].split("# C3: Reset 2FA", 1)[0]
    assert "IdentityAdminCommandService(db).force_logout" in region
    assert "await db.commit()" not in region


def test_force_logout_command_locks_audits_and_rolls_back():
    source = SERVICE.read_text(encoding="utf-8")
    assert ".with_for_update()" in source
    assert "RefreshToken" in source
    assert "AuditLog" in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
