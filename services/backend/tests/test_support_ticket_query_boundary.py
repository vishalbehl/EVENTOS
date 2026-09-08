from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_organization_ticket_list_uses_bounded_explicit_projection():
    router = (ROOT / "app/modules/platform/support_router.py").read_text(encoding="utf-8")
    query_service = (ROOT / "app/modules/platform/application/support_queries.py").read_text(encoding="utf-8")
    region = router.split("async def list_tickets", 1)[1].split("async def get_ticket_comments", 1)[0]
    assert "SupportTicketQueryService(db).list_for_organization" in region
    assert "select(SupportTicket)" in query_service
    assert "load_only(" in query_service
    assert ".limit(self.MAX_TICKETS)" in query_service
    assert "SupportTicket.organization_id == organization_id" in query_service
    assert "SupportTicket.updated_at.desc(), SupportTicket.id.desc()" in query_service


def test_admin_attachment_list_uses_bounded_explicit_projection():
    router = (ROOT / "app/modules/platform/support_router.py").read_text(encoding="utf-8")
    query_service = (ROOT / "app/modules/platform/application/support_queries.py").read_text(encoding="utf-8")
    region = router.split("async def list_admin_ticket_attachments", 1)[1].split("async def request_admin_ticket_attachment_upload", 1)[0]
    assert "SupportTicketQueryService(db).list_attachments" in region
    assert "TicketAttachment.organization_id == organization_id" in query_service
    assert "TicketAttachment.created_at.desc(), TicketAttachment.id.desc()" in query_service


def test_comment_lists_share_tenant_scoped_bounded_projection():
    router = (ROOT / "app/modules/platform/support_router.py").read_text(encoding="utf-8")
    query_service = (ROOT / "app/modules/platform/application/support_queries.py").read_text(encoding="utf-8")
    assert router.count("SupportTicketQueryService(db).list_comments") == 2
    assert "SupportTicket.organization_id == organization_id" in query_service
    assert "TicketComment.created_at.asc(), TicketComment.id.asc()" in query_service
    assert ".limit(self.MAX_TICKETS)" in query_service
    assert "TicketComment.is_internal.is_(False)" in query_service


def test_customer_comment_authorization_uses_support_query_service():
    router = (ROOT / "app/modules/platform/support_router.py").read_text(encoding="utf-8")
    region = router.split("async def get_ticket_comments", 1)[1].split("async def add_ticket_comment", 1)[0]
    assert "SupportTicketQueryService(db).get_for_organization" in region
    assert "await db.scalar(select(SupportTicket)" not in region


def test_admin_ticket_cursor_query_is_constructed_by_query_service():
    router = (ROOT / "app/modules/platform/support_router.py").read_text(encoding="utf-8")
    query_service = (ROOT / "app/modules/platform/application/support_queries.py").read_text(encoding="utf-8")
    region = router.split("async def list_admin_tickets", 1)[1].split("async def get_admin_ticket", 1)[0]
    assert "SupportTicketQueryService(db).admin_list_statement" in region
    assert "select(SupportTicket).where" not in region
    method = query_service.split("    def admin_list_statement", 1)[1].split("    async def get_for_organization", 1)[0]
    assert "SupportTicket.organization_id == organization_id" in method
    assert "load_only(" in method
