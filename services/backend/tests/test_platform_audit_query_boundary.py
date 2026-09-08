from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = (ROOT / "app/modules/platform/router.py").read_text(encoding="utf-8")
SERVICE = (ROOT / "app/modules/audit/application/queries.py").read_text(encoding="utf-8")


def test_platform_audit_route_delegates_read_construction():
    region = ROUTER.split("async def get_audit_logs", 1)[1].split("# C5:", 1)[0]
    assert "AuditQueryService(db).list_platform_audit" in region
    assert "FROM command_center_audit.logs" not in region
    assert "await db.execute" not in region
    assert "OFFSET :skip LIMIT :limit" not in region


def test_platform_audit_query_service_is_explicit_bounded_and_seek_ordered():
    method = SERVICE.split("    async def list_platform_audit", 1)[1]
    assert "AuditLog.organization_id == organization_id" in method
    assert "AuditLog.occurred_at < cursor_time" in method
    assert "AuditLog.id < cursor_id" in method
    assert "AuditLog.occurred_at.desc(), AuditLog.id.desc()" in method
    assert ".limit(bounded + 1)" in method
    assert "select(*columns)" in method


def test_impersonation_feed_delegates_to_explicit_audit_query_service():
    region = ROUTER.split("async def get_impersonation_logs", 1)[1].split("# ── Organization Status", 1)[0]
    assert "AuditQueryService(db).list_impersonation_logs" in region
    assert "FROM command_center_audit.impersonation_logs" not in region
    assert "await db.execute" not in region
    assert "ImpersonationLog.started_at.desc(), ImpersonationLog.id.desc()" in SERVICE
    assert ".limit(bounded)" in SERVICE
