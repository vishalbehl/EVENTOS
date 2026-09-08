from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_organiser_audit_backed_reads_use_bounded_audit_query_service():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/audit/application/queries.py").read_text(encoding="utf-8")
    history = router.split("async def organiser_entitlement_history", 1)[1].split("@router.get(\"/reports/{domain}\"", 1)[0]
    reports = router.split("async def organiser_report", 1)[1].split("@router.post(\"/reports/exports\"", 1)[0]

    assert "AuditQueryService(db).list_organization_entitlement_history" in history
    assert "select(AuditLog)" not in history
    assert "AuditQueryService(db).list_organization_actions" in reports
    assert "select(AuditLog)" not in reports
    assert "AuditQueryService(db).get_organization_action" in router
    assert "AuditLog.new_state" in queries
    assert "AuditLog.occurred_at.desc(), AuditLog.id.desc()" in queries
