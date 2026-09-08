from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_room_readiness_delegates_to_one_query_service_projection():
    service = (ROOT / "app/modules/analytics/services/analytics_service.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/analytics/application/queries.py").read_text(encoding="utf-8")

    assert "AnalyticsDashboardQueryService(db).room_readiness" in service
    assert "func.count(distinct(Session.id))" in queries
    assert "func.count(distinct(SessionSpeaker.id))" in queries
    assert "func.count(distinct(PresentationFile.id))" in queries
    assert 'limit(500)' in queries


def test_room_readiness_query_service_is_read_only():
    queries = (ROOT / "app/modules/analytics/application/queries.py").read_text(encoding="utf-8")
    method = queries.split("    async def room_readiness(", 1)[1].split("    @staticmethod", 1)[0]
    assert "commit(" not in method
    assert "add(" not in method
    assert "delete(" not in method


def test_analytics_overview_uses_two_bounded_projections_and_compatibility_wrapper():
    service = (ROOT / "app/modules/analytics/services/analytics_service.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/analytics/application/queries.py").read_text(encoding="utf-8")
    overview_wrapper = service.split("async def _get_overview", 1)[1].split("async def _get_upload_funnel", 1)[0]
    assert "AnalyticsDashboardQueryService(db).overview" in service
    assert "union_all(" in queries
    assert 'literal("file")' in queries
    assert 'literal("poster")' in queries
    assert 'limit(500)' in queries
    assert "rooms_q = await db.execute" not in overview_wrapper
    assert "file_status_q = await db.execute" not in overview_wrapper


def test_analytics_email_stats_uses_one_projection_and_compatibility_wrapper():
    service = (ROOT / "app/modules/analytics/services/analytics_service.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/analytics/application/queries.py").read_text(encoding="utf-8")
    email_wrapper = service.split("async def _get_email_stats", 1)[1].split("async def get_event_email_analytics", 1)[0]
    email_method = queries.split("    async def email_stats(", 1)[1].split("    @staticmethod", 1)[0]

    assert "AnalyticsDashboardQueryService(db).email_stats" in email_wrapper
    assert "func.count(EmailLog.id).filter" in email_method
    assert ".join(EmailCampaign" in email_method
    assert "total_q = await db.execute" not in email_wrapper
    assert "status_q = await db.execute" not in email_wrapper
    assert "opened_q = await db.execute" not in email_wrapper
    assert "commit(" not in email_method


def test_analytics_snapshot_projections_use_query_service_wrappers():
    service = (ROOT / "app/modules/analytics/services/analytics_service.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/analytics/application/queries.py").read_text(encoding="utf-8")
    for method in ("daily_upload_history", "upload_funnel", "file_format_distribution"):
        assert f"AnalyticsDashboardQueryService(db).{method}" in service
        region = queries.split(f"    async def {method}(", 1)[1].split("    async def ", 1)[0]
        assert "commit(" not in region
        assert "delete(" not in region
    assert 'func.date_trunc("day", PresentationFile.created_at)' in queries
    assert "group_by(PresentationFile.file_format)" in queries


def test_analytics_operational_stats_use_explicit_query_service_projections():
    service = (ROOT / "app/modules/analytics/services/analytics_service.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/analytics/application/queries.py").read_text(encoding="utf-8")
    for method in ("venue_sync_stats", "srr_stats"):
        assert f"AnalyticsDashboardQueryService(db).{method}" in service
        region = queries.split(f"    async def {method}(", 1)[1].split("    async def ", 1)[0]
        assert "commit(" not in region
    assert "VenueSyncJob.created_at" in queries
    assert 'func.count(SRRCheckin.id).filter' in queries


def test_analytics_session_coverage_is_explicit_and_read_only():
    service = (ROOT / "app/modules/analytics/services/analytics_service.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/analytics/application/queries.py").read_text(encoding="utf-8")
    method = queries.split("    async def session_coverage(", 1)[1].split("    async def ", 1)[0]
    assert "AnalyticsDashboardQueryService(db).session_coverage" in service
    assert "Session.id," in method
    assert "Session.name," in method
    assert "select(Session, Room.name" not in method
    assert "commit(" not in method
    assert "delete(" not in method


def test_event_email_analytics_uses_bounded_aggregate_service():
    service = (ROOT / "app/modules/analytics/services/analytics_service.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/analytics/application/queries.py").read_text(encoding="utf-8")
    method = queries.split("    async def email_campaign_analytics(", 1)[1].split("    async def ", 1)[0]
    assert "AnalyticsDashboardQueryService(db).email_campaign_analytics" in service
    assert "func.sum(EmailCampaign.total_recipients)" in method
    assert "func.sum(EmailCampaign.sent_count)" in method
    assert "EmailLog.status.in_" in method
    assert "select(EmailCampaign)" not in service.split("async def get_event_email_analytics", 1)[1]
    assert "commit(" not in method
