from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_organiser_audit_export_uses_bounded_explicit_query_service():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/audit/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def export_organiser_audit", 1)[1].split("@router.", 1)[0]

    assert "AuditQueryService(db).list_organization_export" in region
    assert "select(AuditLog)" not in region
    assert "MAX_EXPORT_ROWS = 10_000" in queries
    assert ".limit(self.MAX_EXPORT_ROWS)" in queries
    assert "AuditLog.organization_id == organization_id" in queries
