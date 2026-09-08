from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/support_router.py"
SERVICE = ROOT / "app/modules/platform/application/support_commands.py"


def test_support_attachment_completion_delegates_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def complete_admin_ticket_attachment", 1)[1].split('@router.get("/admin/{ticket_id}/attachments/{attachment_id}/download"', 1)[0]
    assert "SupportTicketCommandService(db).complete_attachment" in region
    assert "await db.commit()" not in region


def test_support_attachment_completion_verifies_storage_commits_and_queues_scan():
    source = SERVICE.read_text(encoding="utf-8")
    assert "get_object_metadata" in source
    assert "VirusScan" in source
    assert "await self.db.commit()" in source
    assert "scan_asset_for_viruses.delay" in source
    assert "await self.db.rollback()" in source
