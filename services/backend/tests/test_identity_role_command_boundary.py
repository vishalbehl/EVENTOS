from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/router.py"
SERVICE = ROOT / "app/modules/platform/application/identity_commands.py"


def test_platform_role_update_delegates_to_identity_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def update_user_platform_role", 1)[1].split('@router.patch("/users/{user_id}/status"', 1)[0]
    assert "IdentityAdminCommandService(db).update_platform_role" in region
    assert "await db.commit()" not in region


def test_platform_role_command_locks_revokes_sessions_and_rolls_back():
    source = SERVICE.read_text(encoding="utf-8")
    assert "async def update_platform_role" in source
    assert ".with_for_update()" in source
    assert "PLATFORM_ROLE_CHANGED" in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
