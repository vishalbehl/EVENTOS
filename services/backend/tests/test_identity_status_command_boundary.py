from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/router.py"
SERVICE = ROOT / "app/modules/platform/application/identity_commands.py"


def test_user_status_delegates_to_identity_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def update_user_status", 1)[1].split("# ── Database Migration Helpers", 1)[0]
    assert "IdentityAdminCommandService(db).update_status" in region
    assert "await db.commit()" not in region


def test_user_status_command_locks_revokes_audits_and_rolls_back():
    source = SERVICE.read_text(encoding="utf-8")
    assert "async def update_status" in source
    assert ".with_for_update()" in source
    assert "USER_DEACTIVATED_BY_ADMIN" in source
    assert "ActivityTimeline" in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
