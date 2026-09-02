from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/support_router.py"
SERVICE = ROOT / "app/modules/platform/application/support_commands.py"


def test_support_comment_routes_delegate_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    admin = source.split("async def add_admin_ticket_comment", 1)[1].split('@router.get("/{ticket_id}/comments"', 1)[0]
    public = source.split("async def add_ticket_comment", 1)[1]
    assert "SupportTicketCommandService(db).add_comment" in admin
    assert "SupportTicketCommandService(db).add_comment" in public
    assert "await db.commit()" not in admin + public


def test_support_comment_command_locks_ticket_and_rolls_back():
    source = SERVICE.read_text(encoding="utf-8")
    assert "async def add_comment" in source
    assert ".with_for_update()" in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
