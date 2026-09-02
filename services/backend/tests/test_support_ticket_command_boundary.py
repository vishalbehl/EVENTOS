from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/support_router.py"
SERVICE = ROOT / "app/modules/platform/application/support_commands.py"


def test_support_ticket_creation_delegates_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def create_ticket", 1)[1].split('@router.get("/admin"', 1)[0]
    assert "SupportTicketCommandService(db).create" in region
    assert "await db.commit()" not in region
    assert "db.add(" not in region


def test_support_ticket_command_commits_related_records_atomically():
    source = SERVICE.read_text(encoding="utf-8")
    assert "TicketComment" in source
    assert "ActivityTimeline" in source
    assert "await self.db.flush()" in source
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
