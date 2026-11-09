"""Regression contract for bounded notification log export reads."""

import inspect

from app.modules.notifications.application.queries import EmailLogQueryService


def test_email_log_export_query_is_scoped_explicit_and_bounded():
    source = inspect.getsource(EmailLogQueryService.list_for_export)
    assert "EmailLog.event_id == event_id" in source
    assert "Participant.event_id == event_id" in source
    assert "Speaker.event_id == event_id" in source
    assert "EmailLog.to_email" in source
    assert "EmailLog.subject" in source
    assert ".order_by(desc(EmailLog.sent_at), desc(EmailLog.id)).limit(bounded)" in source
    assert "10_000" in source


def test_email_log_export_route_delegates_to_query_service():
    source = inspect.getsource(__import__(
        "app.modules.notifications.routers.notifications", fromlist=["download_logs"]
    ).download_logs)
    assert "EmailLogQueryService(db).list_for_export" in source
    assert "result.scalars" not in source
