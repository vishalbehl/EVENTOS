from pathlib import Path


def test_legacy_impersonation_route_delegates_to_audit_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_impersonation_logs_route", 1)[1].split(
        "@router.get(\"/ai/dashboard\")", 1
    )[0]
    assert "AuditQueryService(db).list_impersonation_logs" in region
    assert "await db.execute" not in region


def test_audit_impersonation_query_has_bounded_stable_pagination():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/audit/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def list_impersonation_logs", 1)[1].split(
        "return items, total", 1
    )[0]
    assert "bounded = self._page_size(limit)" in region
    assert "ImpersonationLog.started_at.desc(), ImpersonationLog.id.desc()" in region
    assert ".limit(bounded)" in region
