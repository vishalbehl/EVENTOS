from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/router.py"
SERVICE = ROOT / "app/modules/platform/application/identity_commands.py"


def test_reset_2fa_delegates_to_identity_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def reset_user_2fa", 1)[1].split("# C4: Audit logs", 1)[0]
    assert "IdentityAdminCommandService(db).reset_2fa" in region
    assert "await db.commit()" not in region


def test_reset_2fa_command_clears_devices_revokes_sessions_and_rolls_back():
    source = SERVICE.read_text(encoding="utf-8")
    assert "MfaDevice" in source
    assert "revoke_user_refresh_tokens" in source
    assert ".with_for_update()" in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
