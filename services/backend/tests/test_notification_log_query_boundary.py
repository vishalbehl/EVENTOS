from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_legacy_email_logs_delegate_to_scoped_query_service():
    router = (ROOT / "app/modules/notifications/routers/notifications.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/notifications/application/queries.py").read_text(encoding="utf-8")
    endpoint = router.split("async def get_email_logs(", 1)[1].split('@router.get(\n    "/logs/cursor"', 1)[0]
    assert "EmailLogQueryService(db).list_legacy" in endpoint
    assert "db.execute" not in endpoint
    assert "EmailLog.event_id == event_id" in queries
    assert ".order_by(desc(EmailLog.sent_at), desc(EmailLog.id))" in queries
    assert ".limit(limit)" in queries

