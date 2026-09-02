from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/platform/support_router.py"
SERVICE = ROOT / "app/modules/platform/application/support_commands.py"


def test_support_attachment_upload_request_delegates_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    region = source.split("async def request_admin_ticket_attachment_upload", 1)[1].split('@router.post("/admin/{ticket_id}/attachments/{attachment_id}/complete"', 1)[0]
    assert "SupportTicketCommandService(db).request_attachment_upload" in region
    assert "await db.commit()" not in region
    assert "db.add(" not in region


def test_support_attachment_upload_commits_before_presigning_and_handles_idempotency():
    source = SERVICE.read_text(encoding="utf-8")
    assert "request_hash" in source
    assert "IDEMPOTENCY_CONFLICT" in source
    assert "await self.db.commit()" in source
    assert source.index("await self.db.commit()") < source.index("upload = await asyncio.to_thread(create_presigned_upload")
