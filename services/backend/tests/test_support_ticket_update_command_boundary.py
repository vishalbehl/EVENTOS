from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/support_router.py"
SERVICE = ROOT / "app/modules/platform/application/support_commands.py"


def test_support_ticket_update_delegates_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def update_admin_ticket", 1)[1].split('@router.get("/admin/{ticket_id}/comments"', 1)[0]
    assert "SupportTicketCommandService(db).update" in region
    assert "await db.commit()" not in region


def test_support_ticket_update_uses_locked_optimistic_concurrency():
    source = SERVICE.read_text(encoding="utf-8")
    assert ".with_for_update()" in source
    assert '"VERSION_CONFLICT"' in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
