from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_legacy_platform_impersonation_route_uses_query_service():
    source = (ROOT / "app/modules/platform/router.py").read_text(encoding="utf-8")
    region = source.split("async def list_impersonation_logs", 1)[1].split("@router.post(\"/impersonation/{session_id}/end\")", 1)[0]
    assert "AuditQueryService(db).list_impersonation_logs" in region
    assert "select(ImpersonationLog" not in region
    assert "aliased(User)" not in region
